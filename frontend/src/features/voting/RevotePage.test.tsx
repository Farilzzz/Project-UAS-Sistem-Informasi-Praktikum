import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { RevotePage } from './RevotePage';
import { ToastProvider } from '@/components/ui/Toast';
import { ApiError } from '@/services/api';
import { VotingResultsResponse, VotingStatusResponse } from '@/types';

const statusMock = vi.fn();
const resultsMock = vi.fn();
const nextRoundMock = vi.fn();
const userState: { role: 'chair' | 'member' | 'voter' } = { role: 'chair' };

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return {
    ...actual,
    api: {
      getVotingStatus: () => statusMock(),
      getVotingResults: () => resultsMock(),
      nextRoundVoting: () => nextRoundMock(),
    },
  };
});

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'dm1', name: 'DM Satu', role: userState.role },
  }),
}));

const tieStatus: VotingStatusResponse = {
  session_status: 'tie_revote',
  current_round: 1,
  is_voting_open: false,
  has_voted_this_round: false,
  votes_cast_in_round: 3,
  eligible_voters: 3,
  required_votes: 3,
  majority_threshold: 2,
  is_eligible: true,
  evaluation: {
    status: 'tie_revote',
    is_completed: true,
    requires_revote: true,
    total_votes_cast: 3,
    required_votes: 3,
    eligible_voters: 3,
    majority_threshold: 2,
    winner: null,
    tallies: [
      { candidate_id: 1, candidate_name: 'Kandidat A', votes: 1, percentage: 33.33 },
      { candidate_id: 2, candidate_name: 'Kandidat B', votes: 1, percentage: 33.33 },
      { candidate_id: 3, candidate_name: 'Kandidat C', votes: 1, percentage: 33.33 },
    ],
  },
  ratified_decision: null,
  can_chair_open: false,
  can_chair_approve: false,
};

const results: VotingResultsResponse = {
  session_status: 'tie_revote',
  round_number: 1,
  round_status: 'tie_revote',
  results: tieStatus.evaluation!,
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <RevotePage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('RevotePage', () => {
  beforeEach(() => {
    statusMock.mockReset();
    resultsMock.mockReset();
    nextRoundMock.mockReset();
    userState.role = 'chair';
    statusMock.mockResolvedValue({ success: true, message: 'ok', data: tieStatus });
    resultsMock.mockResolvedValue({ success: true, message: 'ok', data: results });
  });

  it('menampilkan hasil seri dan tombol putaran ulang untuk Ketua Panel', async () => {
    renderPage();

    expect(await screen.findByText('Hasil Seri (1-1-1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Buka Putaran Ulang/i })).toBeInTheDocument();
    expect(screen.getByText('Kandidat A')).toBeInTheDocument();
  });

  it('anggota panel melihat pesan menunggu, tanpa tombol putaran ulang', async () => {
    userState.role = 'member';
    renderPage();

    expect(
      await screen.findByText(/Menunggu Ketua Panel membuka putaran voting ulang/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Buka Putaran Ulang/i })).not.toBeInTheDocument();
  });

  it('membuka putaran ulang sekali dan menampilkan notifikasi sukses', async () => {
    const user = userEvent.setup();
    nextRoundMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: { round_number: 2, status: 'voting', message: 'Putaran voting ulang dibuka.' },
    });

    renderPage();

    await user.click(await screen.findByRole('button', { name: /Buka Putaran Ulang/i }));
    await user.click(await screen.findByRole('button', { name: /Ya, Buka Putaran Ulang/i }));

    expect(
      await screen.findByText('Putaran voting ulang berhasil dibuka.')
    ).toBeInTheDocument();
    expect(nextRoundMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('menampilkan error backend di dalam modal dan menjaga modal tetap terbuka', async () => {
    const user = userEvent.setup();
    nextRoundMock.mockRejectedValue(new ApiError(409, 'Putaran ulang belum dapat dibuka.'));

    renderPage();

    await user.click(await screen.findByRole('button', { name: /Buka Putaran Ulang/i }));
    await user.click(await screen.findByRole('button', { name: /Ya, Buka Putaran Ulang/i }));

    expect((await screen.findAllByText('Putaran ulang belum dapat dibuka.')).length).toBeGreaterThan(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ya, Buka Putaran Ulang/i })).toBeEnabled();
  });

  it('menampilkan error pemuatan hasil dengan tombol coba lagi', async () => {
    resultsMock.mockRejectedValue(new ApiError(500, 'Gagal memuat hasil putaran.'));

    renderPage();

    expect(await screen.findByText('Gagal memuat hasil putaran.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Coba Lagi/i })).toBeInTheDocument();
  });
});
