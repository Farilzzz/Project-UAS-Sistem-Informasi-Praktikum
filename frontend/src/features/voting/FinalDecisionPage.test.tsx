import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { FinalDecisionPage } from './FinalDecisionPage';
import { ToastProvider } from '@/components/ui/Toast';
import { ApiError } from '@/services/api';
import { RatifiedDecision, VotingStatusResponse } from '@/types';

const statusMock = vi.fn();
const finalDecisionMock = vi.fn();
const approveMock = vi.fn();
const userState: { role: 'chair' | 'member' | 'voter' } = { role: 'chair' };

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return {
    ...actual,
    api: {
      getVotingStatus: () => statusMock(),
      getFinalDecision: () => finalDecisionMock(),
      approveDecision: (reason: string) => approveMock(reason),
    },
  };
});

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'dm1', name: 'DM Satu', role: userState.role },
  }),
}));

const baseStatus: VotingStatusResponse = {
  session_status: 'assessment',
  current_round: 0,
  is_voting_open: false,
  has_voted_this_round: false,
  votes_cast_in_round: 0,
  eligible_voters: 0,
  required_votes: 0,
  majority_threshold: 0,
  is_eligible: false,
  evaluation: null,
  ratified_decision: null,
  can_chair_open: false,
  can_chair_approve: false,
};

const ratifiedDecision: RatifiedDecision = {
  id: 10,
  session_id: 1,
  round_id: 2,
  candidate_id: 1,
  candidate_name: 'Kandidat A',
  vision: 'Visi A',
  mission: 'Misi A',
  total_votes: 2,
  percentage: 66.67,
  approved_by: 1,
  approved_by_name: 'DM Satu',
  reason: 'Konsensus panel tercapai.',
  approved_at: '2026-01-02T10:00:00Z',
  round_number: 2,
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <FinalDecisionPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('FinalDecisionPage', () => {
  beforeEach(() => {
    statusMock.mockReset();
    finalDecisionMock.mockReset();
    approveMock.mockReset();
    userState.role = 'chair';
    finalDecisionMock.mockRejectedValue(new ApiError(404, 'Keputusan final belum tersedia.'));
  });

  it('menampilkan status voting belum dibuka dan aksi Ketua Panel', async () => {
    statusMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: { ...baseStatus, can_chair_open: true },
    });

    renderPage();

    expect((await screen.findAllByText('Voting Belum Dibuka')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Buka Halaman Voting/i })).toBeInTheDocument();
    expect(screen.getByText('Keputusan belum disahkan')).toBeInTheDocument();
  });

  it('anggota panel hanya melihat informasi menunggu saat voting belum dibuka', async () => {
    userState.role = 'member';
    statusMock.mockResolvedValue({ success: true, message: 'ok', data: baseStatus });

    renderPage();

    expect((await screen.findAllByText('Voting Belum Dibuka')).length).toBeGreaterThan(0);
    expect(screen.getByText('Menunggu Ketua Panel membuka sesi voting.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Buka Halaman Voting/i })).not.toBeInTheDocument();
  });

  it('menampilkan progres pengumpulan suara saat voting berlangsung', async () => {
    statusMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        ...baseStatus,
        session_status: 'voting',
        is_voting_open: true,
        current_round: 1,
        votes_cast_in_round: 1,
        eligible_voters: 4,
        required_votes: 4,
        majority_threshold: 3,
      },
    });

    renderPage();

    expect((await screen.findAllByText('Menunggu Suara Panelis')).length).toBeGreaterThan(0);
    expect(screen.getByText('Tersisa 3 suara')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
  });

  it('menampilkan aksi putaran ulang untuk Ketua Panel saat hasil seri', async () => {
    statusMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: { ...baseStatus, session_status: 'tie_revote', current_round: 1, eligible_voters: 3 },
    });

    renderPage();

    expect(
      (await screen.findAllByText('Hasil Voting Seri — Menunggu Putaran Berikutnya')).length
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Buka Putaran Ulang/i })).toBeInTheDocument();
  });

  it('menampilkan aksi pengesahan hanya untuk Ketua Panel saat menunggu pengesahan', async () => {
    statusMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        ...baseStatus,
        session_status: 'voting_completed',
        current_round: 1,
        votes_cast_in_round: 3,
        eligible_voters: 3,
        can_chair_approve: true,
      },
    });

    renderPage();

    expect((await screen.findAllByText('Menunggu Pengesahan Ketua Panel')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Periksa dan Sahkan Keputusan/i })).toBeInTheDocument();
  });

  it('menampilkan pesan menunggu pengesahan untuk peran non-Ketua', async () => {
    userState.role = 'voter';
    statusMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        ...baseStatus,
        session_status: 'voting_completed',
        current_round: 1,
        votes_cast_in_round: 3,
        eligible_voters: 3,
        can_chair_approve: false,
      },
    });

    renderPage();

    expect((await screen.findAllByText('Hasil Voting Selesai')).length).toBeGreaterThan(0);
    expect(screen.getByText('Keputusan belum disahkan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Periksa dan Sahkan Keputusan/i })).not.toBeInTheDocument();
  });

  it('menampilkan keputusan yang sudah disahkan dari backend beserta detail pengesahan', async () => {
    statusMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        ...baseStatus,
        session_status: 'ratified',
        current_round: 2,
        ratified_decision: ratifiedDecision,
      },
    });
    finalDecisionMock.mockResolvedValue({ success: true, message: 'ok', data: ratifiedDecision });

    renderPage();

    expect((await screen.findAllByText('Keputusan Telah Disahkan')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kandidat A').length).toBeGreaterThan(0);
    expect(screen.getByText('Detail Pengesahan')).toBeInTheDocument();
    expect(screen.getByText('DM Satu')).toBeInTheDocument();
    expect(screen.getByText('Konsensus panel tercapai.')).toBeInTheDocument();
    expect(screen.queryByText('Keputusan belum disahkan')).not.toBeInTheDocument();
  });

  it('memperlakukan 404 keputusan final sebagai kondisi kosong, bukan error', async () => {
    statusMock.mockResolvedValue({ success: true, message: 'ok', data: baseStatus });

    renderPage();

    expect(await screen.findByText('Keputusan belum disahkan')).toBeInTheDocument();
    expect(screen.queryByText('Data keputusan final gagal dimuat.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Kandidat A/i)).not.toBeInTheDocument();
  });

  it('menampilkan error nyata saat status voting gagal dimuat dan menyediakan coba lagi', async () => {
    statusMock.mockRejectedValue(new ApiError(500, 'Kesalahan internal server.'));

    renderPage();

    expect(await screen.findByText('Status proses pemilihan gagal dimuat.')).toBeInTheDocument();
    expect(screen.getByText('Kesalahan internal server.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Coba Lagi/i })).toBeEnabled();
  });

  it('mengesahkan keputusan sekali dengan alasan, menampilkan notifikasi sukses, lalu menutup modal', async () => {
    const user = userEvent.setup();
    statusMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        ...baseStatus,
        session_status: 'voting_completed',
        current_round: 1,
        votes_cast_in_round: 3,
        eligible_voters: 3,
        can_chair_approve: true,
      },
    });
    approveMock.mockResolvedValue({ success: true, message: 'ok', data: ratifiedDecision });

    renderPage();

    await user.click(await screen.findByRole('button', { name: /Periksa dan Sahkan Keputusan/i }));
    const reasonInput = await screen.findByLabelText(/Alasan Pengesahan/i);
    await user.type(reasonInput, 'Konsensus panel tercapai.');
    await user.click(screen.getByRole('button', { name: /^Sahkan Keputusan$/i }));

    expect(await screen.findByText('Keputusan final berhasil disahkan.')).toBeInTheDocument();
    expect(approveMock).toHaveBeenCalledTimes(1);
    expect(approveMock).toHaveBeenCalledWith('Konsensus panel tercapai.');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('menampilkan error pengesahan dan menjaga modal tetap terbuka', async () => {
    const user = userEvent.setup();
    statusMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        ...baseStatus,
        session_status: 'voting_completed',
        current_round: 1,
        votes_cast_in_round: 3,
        eligible_voters: 3,
        can_chair_approve: true,
      },
    });
    approveMock.mockRejectedValue(new ApiError(403, 'Hanya Ketua Panel yang dapat mengesahkan keputusan.'));

    renderPage();

    await user.click(await screen.findByRole('button', { name: /Periksa dan Sahkan Keputusan/i }));
    await user.type(await screen.findByLabelText(/Alasan Pengesahan/i), 'Alasan pengesahan.');
    await user.click(screen.getByRole('button', { name: /^Sahkan Keputusan$/i }));

    expect(
      (await screen.findAllByText('Hanya Ketua Panel yang dapat mengesahkan keputusan.')).length
    ).toBeGreaterThan(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(approveMock).toHaveBeenCalledTimes(1);
  });
});
