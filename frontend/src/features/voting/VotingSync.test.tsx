import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { VotingPage } from './VotingPage';
import { FinalDecisionPage } from './FinalDecisionPage';
import { ToastProvider } from '@/components/ui/Toast';
import { RatifiedDecision, VotingStatusResponse } from '@/types';

const statusMock = vi.fn();
const candidatesMock = vi.fn();
const voteMock = vi.fn();
const finalDecisionMock = vi.fn();
const approveMock = vi.fn();

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return {
    ...actual,
    api: {
      getVotingStatus: () => statusMock(),
      getCandidates: () => candidatesMock(),
      vote: (candidateId: number) => voteMock(candidateId),
      getFinalDecision: () => finalDecisionMock(),
      approveDecision: (reason: string) => approveMock(reason),
    },
  };
});

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 2, username: 'dm2', name: 'Anggota Panel 1', role: 'member' },
  }),
}));

function makeElectorate(overrides: Record<string, { has_voted: boolean; voted_at: string | null }> = {}): VotingStatusResponse['electorate'] {
  const base = [
    { user_id: 1, username: 'dm1', name: 'Ketua Panel', role: 'chair' as const },
    { user_id: 2, username: 'dm2', name: 'Anggota Panel 1', role: 'member' as const },
    { user_id: 3, username: 'dm3', name: 'Anggota Panel 2', role: 'member' as const },
  ];
  return base.map((b) => ({
    ...b,
    has_voted: overrides[b.username]?.has_voted ?? false,
    voted_at: overrides[b.username]?.voted_at ?? null,
  }));
}

function makeStatus(
  status: VotingStatusResponse['session_status'],
  votesCast: number,
  electorateOverrides: Parameters<typeof makeElectorate>[0] = {},
  extra: Partial<VotingStatusResponse> & { userHasVoted?: boolean } = {}
): VotingStatusResponse {
  const { userHasVoted, ...overrides } = extra;
  return {
    session_id: 1,
    session_status: status,
    current_round: 1,
    round_id: 1,
    is_voting_open: status === 'voting',
    has_voted_this_round: votesCast > 0 && userHasVoted !== false,
    votes_cast_in_round: votesCast,
    eligible_voters: 3,
    required_votes: 3,
    majority_threshold: 2,
    is_eligible: true,
    evaluation: null,
    ratified_decision: null,
    can_chair_open: false,
    can_chair_approve: false,
    electorate: makeElectorate(electorateOverrides),
    ...overrides,
  };
}

function renderPage(Component: React.ComponentType, client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <Component />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('Voting Sync — Cross-Page, Refresh, Round Change, No Duplicate', () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    candidatesMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: [
        { id: 1, name: 'Kandidat A', vision: null, mission: null, profile: null },
        { id: 2, name: 'Kandidat B', vision: null, mission: null, profile: null },
        { id: 3, name: 'Kandidat C', vision: null, mission: null, profile: null },
      ],
    });
    finalDecisionMock.mockResolvedValue({ success: false, data: null });
    approveMock.mockResolvedValue({ success: true });
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchInterval: false } },
    });
  });

  afterEach(() => {
    client.clear();
  });

  // 1) Skenario 2/3 — real Pilpress state: dm1 & dm2 sudah, dm3 belum.
  it('1. Skenario 2/3: monitor menampilkan dm1/dm2 Sudah, dm3 Belum — tanpa suara otomatis', async () => {
    statusMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: makeStatus('voting', 2, {
        dm1: { has_voted: true, voted_at: '2026-11-04 21:57:57' },
        dm2: { has_voted: true, voted_at: '2026-11-19 13:15:59' },
        dm3: { has_voted: false, voted_at: null },
      }),
    });

    renderPage(VotingPage, client);

    expect(await screen.findByTestId('electorate-monitor')).toBeInTheDocument();
    expect(screen.getByTestId('electorate-monitor-fraction')).toHaveTextContent('2/3 Suara');
    expect(screen.getByTestId('monitor-voted-dm1')).toHaveTextContent('Sudah Voting');
    expect(screen.getByTestId('monitor-voted-dm2')).toHaveTextContent('Sudah Voting');
    expect(screen.getByTestId('monitor-not-voted-dm3')).toHaveTextContent('Belum Voting');
    expect(screen.getByText('Tersisa 1 pemilih belum memberikan suara.')).toBeInTheDocument();
    expect(screen.getByText('Putaran #1')).toBeInTheDocument();
  });

  // 2) Setelah dm3 vote sukses → invalidate → refetch 3/3
  it('2. Setelah dm3 vote: invalidateQueries dipanggil, status refetch → 3/3, monitor update', async () => {
    // Initial 2/3 (dm2 is current user, has not voted yet in this mock)
    statusMock
      .mockResolvedValueOnce({
        success: true,
        message: 'ok',
        data: makeStatus('voting', 1, {
          dm1: { has_voted: true, voted_at: '2026-11-04 21:57:57' },
          dm2: { has_voted: false, voted_at: null },
          dm3: { has_voted: false, voted_at: null },
        }, { userHasVoted: false }),
      })
      // After invalidate + refetch → 3/3
      .mockResolvedValueOnce({
        success: true,
        message: 'ok',
        data: makeStatus('voting_completed', 3, {
          dm1: { has_voted: true, voted_at: '2026-11-04 21:57:57' },
          dm2: { has_voted: true, voted_at: '2026-11-19 13:15:59' },
          dm3: { has_voted: true, voted_at: '2026-11-19 13:46:15' },
        }, { userHasVoted: true }),
      });

    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    renderPage(VotingPage, client);

    // Initial 1/3 shown
    expect(await screen.findByTestId('electorate-monitor-fraction')).toHaveTextContent('1/3 Suara');
    expect(screen.getByTestId('monitor-not-voted-dm2')).toBeInTheDocument();
    expect(screen.getByTestId('monitor-not-voted-dm3')).toBeInTheDocument();

    // User votes
    voteMock.mockResolvedValueOnce({
      success: true,
      message: 'ok',
      data: { round_number: 1, has_voted: true, votes_cast_in_round: 3, round_completed: true },
    });

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Kandidat C/i }));
    await user.click(await screen.findByRole('button', { name: /Kirim Suara/i }));

    await waitFor(() => expect(screen.getByText('Suara berhasil dikirim.')).toBeInTheDocument());
    expect(voteMock).toHaveBeenCalledTimes(1);
    expect(voteMock).toHaveBeenCalledWith(3);

    // invalidateQueries called for voting status
    await waitFor(() => {
      const calls = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
      expect(calls).toContain(JSON.stringify(['voting', 'status']));
    });

    // Refetch shows 3/3
    expect(await screen.findByTestId('electorate-monitor-fraction')).toHaveTextContent('3/3 Suara');
    expect(screen.getByTestId('monitor-voted-dm2')).toHaveTextContent('Sudah Voting');
    expect(screen.getByTestId('monitor-voted-dm3')).toHaveTextContent('Sudah Voting');
    expect(screen.getByText('Seluruh panelis telah memberikan suara.')).toBeInTheDocument();
  });

  // 3) Refresh halaman (remount) → data fresh dari backend, bukan stale
  it('3. Refresh halaman: remount mengambil data backend terbaru, tidak stale', async () => {
    statusMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: makeStatus('voting_completed', 3, {
        dm1: { has_voted: true, voted_at: '2026-11-04 21:57:57' },
        dm2: { has_voted: true, voted_at: '2026-11-19 13:15:59' },
        dm3: { has_voted: true, voted_at: '2026-11-19 13:46:15' },
      }, { userHasVoted: true }),
    });

    const { unmount } = renderPage(VotingPage, client);
    expect(await screen.findByTestId('electorate-monitor-fraction')).toHaveTextContent('3/3 Suara');

    // Simulate refresh: unmount + remount with same client (cache fresh if < staleTime)
    // Our test client has refetchInterval: false, staleTime default 0 → refetch on mount
    unmount();
    statusMock.mockClear();
    statusMock.mockResolvedValueOnce({
      success: true,
      message: 'ok',
      data: makeStatus('voting_completed', 3, {
        dm1: { has_voted: true, voted_at: '2026-11-04 21:57:57' },
        dm2: { has_voted: true, voted_at: '2026-11-19 13:15:59' },
        dm3: { has_voted: true, voted_at: '2026-11-19 13:46:15' },
      }, { userHasVoted: true }),
    });

    renderPage(VotingPage, client);
    expect(await screen.findByTestId('electorate-monitor-fraction')).toHaveTextContent('3/3 Suara');
    expect(statusMock).toHaveBeenCalledTimes(1);
  });

  // 4) Perubahan ronde: round 1 selesai, round 2 baru → electorate reset semua has_voted=false
  it('4. Perubahan ronde: round 2 baru memulai electorate bersih (has_voted=false semua)', async () => {
    statusMock
      // Initial round 1: 2/3
      .mockResolvedValueOnce({
        success: true,
        message: 'ok',
        data: makeStatus('voting_completed', 2, {
          dm1: { has_voted: true, voted_at: '2026-11-04 21:57:57' },
          dm2: { has_voted: true, voted_at: '2026-11-19 13:15:59' },
          dm3: { has_voted: false, voted_at: null },
        }),
      })
      // After round change: round 2, electorate reset
      .mockResolvedValueOnce({
        success: true,
        message: 'ok',
        data: {
          ...makeStatus('voting', 0, {
            dm1: { has_voted: false, voted_at: null },
            dm2: { has_voted: false, voted_at: null },
            dm3: { has_voted: false, voted_at: null },
          }),
          current_round: 2,
          round_id: 2,
        },
      });

    renderPage(VotingPage, client);

    // Initial round 1
    expect(await screen.findByText('Putaran #1')).toBeInTheDocument();
    expect(screen.getByTestId('electorate-monitor-fraction')).toHaveTextContent('2/3 Suara');

    // Simulate refetch via client.invalidateQueries
    await client.invalidateQueries({ queryKey: ['voting', 'status'] });
    await waitFor(() => expect(screen.getByText('Putaran #2')).toBeInTheDocument());
    expect(screen.getByTestId('electorate-monitor-fraction')).toHaveTextContent('0/3 Suara');
    expect(screen.getByTestId('monitor-not-voted-dm1')).toBeInTheDocument();
    expect(screen.getByTestId('monitor-not-voted-dm2')).toBeInTheDocument();
    expect(screen.getByTestId('monitor-not-voted-dm3')).toBeInTheDocument();
  });

  // 5) Tidak ada duplikasi suara: tombol Kirim disabled saat loading (Mengirim...)
  it('5. Duplicate vote: tombol Kirim disabled saat loading (Mengirim...), mencegah double submit', async () => {
    statusMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: makeStatus('voting', 1, {
        dm1: { has_voted: true, voted_at: '2026-11-04 21:57:57' },
        dm2: { has_voted: false, voted_at: null },
        dm3: { has_voted: false, voted_at: null },
      }, { userHasVoted: false }),
    });

    let voteResolve: (v: unknown) => void = () => {};
    voteMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          voteResolve = resolve;
        })
    );

    renderPage(VotingPage, client);
    const user = userEvent.setup();

    // DM2 votes (not voted yet)
    await user.click(await screen.findByRole('button', { name: /Kandidat B/i }));
    await user.click(await screen.findByRole('button', { name: /Kirim Suara/i }));

    // Button disabled while pending, text becomes "Mengirim..."
    expect(screen.getByRole('button', { name: /Mengirim\.\.\./i })).toBeDisabled();

    // Resolve success
    voteResolve({
      success: true,
      message: 'ok',
      data: { round_number: 1, has_voted: true, votes_cast_in_round: 2, round_completed: false },
    });

    await waitFor(() => expect(screen.getByText('Suara berhasil dikirim.')).toBeInTheDocument());
    expect(voteMock).toHaveBeenCalledTimes(1);

    // Second click should not trigger second vote (modal closes after state change)
    await waitFor(() => expect(screen.queryByRole('button', { name: /Mengirim\.\.\./i })).not.toBeInTheDocument());
  });

  // 6) Navigasi VotingPage → FinalDecisionPage: queryKey sama, status konsisten
  it('6. Navigasi VotingPage -> FinalDecisionPage: status konsisten via shared queryKey', async () => {
    const sharedClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchInterval: false } },
    });

    statusMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: makeStatus('voting_completed', 3, {
        dm1: { has_voted: true, voted_at: '2026-11-04 21:57:57' },
        dm2: { has_voted: true, voted_at: '2026-11-19 13:15:59' },
        dm3: { has_voted: true, voted_at: '2026-11-19 13:46:15' },
      }, { userHasVoted: true }),
    });

    finalDecisionMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        id: 1,
        session_id: 1,
        round_id: 1,
        candidate_id: 1,
        candidate_name: 'Kandidat A',
        vision: 'Visi A',
        mission: 'Misi A',
        total_votes: 2,
        percentage: 66.67,
        approved_by: 1,
        approved_by_name: 'Ketua Panel',
        reason: 'Sah',
        approved_at: '2026-11-19 06:47:40',
        round_number: 1,
      } as RatifiedDecision,
    });

    // Render VotingPage first
    renderPage(VotingPage, sharedClient);
    expect(await screen.findByTestId('electorate-monitor-fraction')).toHaveTextContent('3/3 Suara');

    // Unmount VotingPage, render FinalDecisionPage with same client (cache shared)
    const { unmount } = renderPage(VotingPage, sharedClient);
    unmount();

    renderPage(FinalDecisionPage, sharedClient);
    expect(await screen.findByTestId('electorate-monitor')).toBeInTheDocument();
    expect(screen.getByTestId('electorate-monitor-fraction')).toHaveTextContent('3/3 Suara');
  });
});