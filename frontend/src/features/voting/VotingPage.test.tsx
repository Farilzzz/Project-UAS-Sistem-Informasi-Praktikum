import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { VotingPage } from './VotingPage';
import { ToastProvider } from '@/components/ui/Toast';
import { ApiError } from '@/services/api';
import { VotingStatusResponse } from '@/types';

const statusMock = vi.fn();
const candidatesMock = vi.fn();
const openVotingMock = vi.fn();
const voteMock = vi.fn();
const userState: { role: 'chair' | 'member' | 'voter' } = { role: 'voter' };

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return {
    ...actual,
    api: {
      getVotingStatus: () => statusMock(),
      getCandidates: () => candidatesMock(),
      openVoting: () => openVotingMock(),
      vote: (candidateId: number) => voteMock(candidateId),
    },
  };
});

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 4, username: 'voter1', name: 'Pemilih Satu', role: userState.role },
  }),
}));

const baseStatus: VotingStatusResponse = {
  session_status: 'voting',
  current_round: 1,
  is_voting_open: true,
  has_voted_this_round: false,
  votes_cast_in_round: 1,
  eligible_voters: 4,
  required_votes: 4,
  majority_threshold: 3,
  is_eligible: true,
  evaluation: null,
  ratified_decision: null,
  can_chair_open: false,
  can_chair_approve: false,
  electorate: [],
};

const chairAssessmentStatus: VotingStatusResponse = {
  ...baseStatus,
  session_status: 'assessment',
  is_voting_open: false,
  votes_cast_in_round: 0,
  can_chair_open: true,
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <VotingPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  return { client, ...utils };
}

describe('VotingPage', () => {
  beforeEach(() => {
    statusMock.mockReset();
    candidatesMock.mockReset();
    openVotingMock.mockReset();
    voteMock.mockReset();
    userState.role = 'voter';
    candidatesMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: [
        { id: 1, name: 'Kandidat A', vision: null, mission: null, profile: null },
        { id: 2, name: 'Kandidat B', vision: null, mission: null, profile: null },
        { id: 3, name: 'Kandidat C', vision: null, mission: null, profile: null },
      ],
    });
  });

  it('menampilkan jumlah pemilih dan ambang mayoritas dari backend', async () => {
    statusMock.mockResolvedValue({ success: true, message: 'ok', data: baseStatus });
    renderPage();

    expect(await screen.findByText('1/4')).toBeInTheDocument();
    expect(await screen.findByText('3 suara')).toBeInTheDocument();
  });

  it('pemilih yang tidak terdaftar melihat pemberitahuan dan tidak bisa memilih', async () => {
    statusMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: { ...baseStatus, is_eligible: false },
    });
    renderPage();

    expect(
      await screen.findByText('Anda tidak terdaftar sebagai pemilih pada sesi ini.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kandidat A/i })).not.toBeInTheDocument();
  });

  it('pemilih yang sudah memilih tidak melihat tombol voting lagi', async () => {
    statusMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: { ...baseStatus, has_voted_this_round: true },
    });
    renderPage();

    const matches = await screen.findAllByText(/sudah memberikan suara/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('menampilkan modal konfirmasi sebelum membuka voting', async () => {
    const user = userEvent.setup();
    userState.role = 'chair';
    statusMock.mockResolvedValue({ success: true, message: 'ok', data: chairAssessmentStatus });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Buka Sesi Voting/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Buka Sesi Voting?')).toBeInTheDocument();
    expect(openVotingMock).not.toHaveBeenCalled();
  });

  it('membuka voting sekali, menampilkan loading, lalu sukses dan menyegarkan query', async () => {
    const user = userEvent.setup();
    userState.role = 'chair';
    statusMock.mockResolvedValue({ success: true, message: 'ok', data: chairAssessmentStatus });

    let resolveOpen: (value: unknown) => void = () => {};
    openVotingMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve;
        })
    );

    const { client } = renderPage();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    await user.click(await screen.findByRole('button', { name: /Buka Sesi Voting/i }));
    const confirmButton = await screen.findByRole('button', { name: /Ya, Buka Voting/i });
    await user.click(confirmButton);

    expect(await screen.findByText('Membuka...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Batal/i })).toBeDisabled();

    resolveOpen({ success: true, message: 'ok', data: { round_number: 1, status: 'voting', message: 'Sesi voting dibuka.' } });

    expect(await screen.findByText('Sesi voting berhasil dibuka.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(openVotingMock).toHaveBeenCalledTimes(1);

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(invalidatedKeys).toContain(JSON.stringify(['voting', 'status']));
    expect(invalidatedKeys).toContain(JSON.stringify(['voting', 'results']));
    expect(invalidatedKeys).toContain(JSON.stringify(['assessments', 'status']));
    expect(invalidatedKeys).toContain(JSON.stringify(['decisions', 'final']));
  });

  it('menolak pembukaan voting karena penilaian belum final: modal tetap terbuka dan pesan backend tampil', async () => {
    const user = userEvent.setup();
    userState.role = 'chair';
    statusMock.mockResolvedValue({ success: true, message: 'ok', data: chairAssessmentStatus });
    openVotingMock.mockRejectedValue(
      new ApiError(
        409,
        'Seluruh Decision Maker harus memfinalisasi penilaian terlebih dahulu sebelum voting dapat dibuka.'
      )
    );

    renderPage();

    await user.click(await screen.findByRole('button', { name: /Buka Sesi Voting/i }));
    await user.click(await screen.findByRole('button', { name: /Ya, Buka Voting/i }));

    expect(
      await screen.findByText(/Sesi voting belum dapat dibuka/i)
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByText(/Seluruh Decision Maker harus memfinalisasi penilaian/i)).length
    ).toBeGreaterThan(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ya, Buka Voting/i })).toBeEnabled();
    expect(screen.queryByText('Sesi voting berhasil dibuka.')).not.toBeInTheDocument();
  });

  it('menampilkan pesan aman untuk kegagalan server dan mengizinkan percobaan ulang', async () => {
    const user = userEvent.setup();
    userState.role = 'chair';
    statusMock.mockResolvedValue({ success: true, message: 'ok', data: chairAssessmentStatus });
    openVotingMock.mockRejectedValueOnce(new ApiError(500, 'Kesalahan internal server.'));

    renderPage();

    await user.click(await screen.findByRole('button', { name: /Buka Sesi Voting/i }));
    await user.click(await screen.findByRole('button', { name: /Ya, Buka Voting/i }));

    expect((await screen.findAllByText('Kesalahan internal server.')).length).toBeGreaterThan(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    openVotingMock.mockResolvedValueOnce({
      success: true,
      message: 'ok',
      data: { round_number: 1, status: 'voting', message: 'Sesi voting dibuka.' },
    });
    await user.click(screen.getByRole('button', { name: /Ya, Buka Voting/i }));

    expect(await screen.findByText('Sesi voting berhasil dibuka.')).toBeInTheDocument();
    expect(openVotingMock).toHaveBeenCalledTimes(2);
  });

  it('mengirim suara sekali dan menampilkan notifikasi sukses', async () => {
    const user = userEvent.setup();
    statusMock.mockResolvedValue({ success: true, message: 'ok', data: baseStatus });
    voteMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: { round_number: 1, has_voted: true, votes_cast_in_round: 2, round_completed: false },
    });

    renderPage();

    await user.click(await screen.findByRole('button', { name: /Kandidat A/i }));
    await user.click(await screen.findByRole('button', { name: /Kirim Suara/i }));

    expect(await screen.findByText('Suara berhasil dikirim.')).toBeInTheDocument();
    expect(voteMock).toHaveBeenCalledTimes(1);
    expect(voteMock).toHaveBeenCalledWith(1);
  });
});
