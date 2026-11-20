import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ElectionHistoryPage } from './ElectionHistoryPage';
import { ToastProvider } from '@/components/ui/Toast';
import { ElectionDetail, ElectionSummary } from '@/types';

const getElectionsMock = vi.fn();
const getElectionMock = vi.fn();
const authState = vi.hoisted(() => ({ role: 'chair' }));
const createElectionMock = vi.fn();

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return {
    ...actual,
    api: {
      getElections: () => getElectionsMock(),
      getElection: (id: number) => getElectionMock(id),
      createElection: (title: string, description: string | null) =>
        createElectionMock(title, description),
    },
  };
});

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'dm1', name: 'Ketua Panel', role: authState.role },
  }),
}));

function summary(overrides: Partial<ElectionSummary> = {}): ElectionSummary {
  return {
    id: 1,
    title: 'Pemilihan 2026',
    description: 'Sesi perdana',
    status: 'ratified',
    current_round: 1,
    created_by: null,
    previous_session_id: null,
    created_at: '2026-11-04T14:11:17',
    updated_at: '2026-11-19T13:47:40',
    electorate_count: 3,
    round_count: 1,
    is_active: true,
    final_candidate: 'Kandidat A',
    can_create_election: true,
    ...overrides,
  };
}

function detail(): ElectionDetail {
  return {
    session: {
      id: 1,
      title: 'Pemilihan 2026',
      description: 'Sesi perdana',
      status: 'ratified',
      current_round: 1,
      created_by: null,
      previous_session_id: null,
      created_at: '2026-11-04T14:11:17',
      updated_at: '2026-11-19T13:47:40',
      is_active: true,
      can_create_election: true,
    },
    voting_status: {
      session_id: 1,
      session_status: 'ratified',
      current_round: 1,
      round_id: 1,
      is_voting_open: false,
      has_voted_this_round: true,
      votes_cast_in_round: 3,
      eligible_voters: 3,
      required_votes: 3,
      majority_threshold: 2,
      is_eligible: true,
      evaluation: null,
      ratified_decision: null,
      can_chair_open: false,
      can_chair_approve: false,
      electorate: [
        { user_id: 1, username: 'dm1', name: 'Ketua Panel', role: 'chair', has_voted: true, voted_at: '2026-11-04 21:57:57' },
        { user_id: 2, username: 'dm2', name: 'Anggota Panel 1', role: 'member', has_voted: true, voted_at: '2026-11-19 13:15:59' },
        { user_id: 3, username: 'dm3', name: 'Anggota Panel 2', role: 'member', has_voted: true, voted_at: '2026-11-19 13:46:15' },
      ],
    },
    voting_results: {
      session_status: 'ratified',
      round_number: 1,
      round_status: 'completed',
      results: {
        status: 'majority',
        is_completed: true,
        total_votes_cast: 3,
        winner: { candidate_id: 1, candidate_name: 'Kandidat A', votes: 2, percentage: 66.67 },
        tallies: [],
      },
    },
    history: {
      session_id: 1,
      rounds: [
        {
          id: 1,
          round_number: 1,
          status: 'completed',
          opened_at: '2026-11-19T13:00:00',
          closed_at: '2026-11-19T13:46:15',
          opened_by_name: 'Ketua Panel',
          evaluation: {
            status: 'majority',
            is_completed: true,
            total_votes_cast: 3,
            winner: { candidate_id: 1, candidate_name: 'Kandidat A', votes: 2, percentage: 66.67 },
            tallies: [],
          },
        },
      ],
      final_decision: null,
    },
    final_decision: {
      id: 1,
      session_id: 1,
      round_id: 1,
      candidate_id: 1,
      candidate_name: 'Kandidat A',
      total_votes: 2,
      percentage: '66.67',
      approved_by: 1,
      approved_by_name: 'Ketua Panel',
      reason: 'Mayoritas',
      approved_at: '2026-11-19T13:47:40',
    },
  };
}

function renderPage(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <ElectionHistoryPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('Phase 4 — Histori Siklus Pemilihan', () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'chair';
    getElectionsMock.mockResolvedValue({ success: true, message: 'ok', data: [summary()] });
    getElectionMock.mockResolvedValue({ success: true, message: 'ok', data: detail() });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => client.clear());

  it('1. Daftar siklus menampilkan status, active badge, dan tombol pemilihan baru untuk Ketua Panel', async () => {
    renderPage(client);

    expect(await screen.findByTestId('election-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('election-active-1')).toHaveTextContent('Aktif');
    expect(screen.getByTestId('election-status-1')).toHaveTextContent('Disahkan');
    expect(screen.getByText('Kandidat A')).toBeInTheDocument();
    expect(screen.getByTestId('history-create-election')).toBeInTheDocument();
  });

  it('2. Detail siklus lama menampilkan hasil voting + keputusan final tanpa mengubah data', async () => {
    const user = userEvent.setup();
    renderPage(client);

    await user.click(await screen.findByTestId('election-detail-button-1'));

    expect(await screen.findByTestId('election-detail-panel')).toBeInTheDocument();
    expect(getElectionMock).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('electorate-monitor')).toBeInTheDocument();
    expect(screen.getByTestId('electorate-monitor-fraction')).toHaveTextContent('3/3 Suara');
    expect(screen.getByTestId('election-detail-winner')).toHaveTextContent('Kandidat A');
    expect(screen.getByTestId('election-detail-final')).toHaveTextContent('66.67%');
    expect(screen.getByTestId('election-detail-rounds')).toHaveTextContent('Putaran #1');
    expect(createElectionMock).not.toHaveBeenCalled();
  });

  it('3. Anggota Panel tidak melihat tombol pemilihan baru', async () => {
    authState.role = 'member';
    renderPage(client);
    await screen.findByTestId('election-card-1');
    expect(screen.queryByTestId('history-create-election')).not.toBeInTheDocument();
  });

  it('4. Sesi aktif bukan ratified → tombol pemilihan baru tidak muncul', async () => {
    getElectionsMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: [summary({ status: 'voting', final_candidate: null, can_create_election: false })],
    });
    renderPage(client);
    await screen.findByTestId('election-card-1');
    expect(screen.queryByTestId('history-create-election')).not.toBeInTheDocument();
  });
});
