import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DashboardPage } from './DashboardPage';
import { VotingStatusResponse, AssessmentStatusResponse, BordaResponse, ElectionSummary } from '@/types';

// Mock AuthContext
const mockUserState = {
  id: 1,
  username: 'dm1',
  name: 'Ketua Panel',
  role: 'chair' as 'chair' | 'member' | 'voter',
};

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUserState }),
}));

// Mock api
const mockGetAssessmentStatus = vi.fn();
const mockGetBordaResults = vi.fn();
const mockGetVotingStatus = vi.fn();
const mockGetActiveElection = vi.fn();

vi.mock('@/services/api', () => ({
  isApiError: (err: unknown): err is { status: number } =>
    typeof err === 'object' && err !== null && 'status' in err,
  api: {
    getAssessmentStatus: () => mockGetAssessmentStatus(),
    getBordaResults: () => mockGetBordaResults(),
    getVotingStatus: () => mockGetVotingStatus(),
    getActiveElection: () => mockGetActiveElection(),
  },
}));

const mockActiveElection: ElectionSummary = {
  id: 1,
  title: 'Pemilihan Presiden 2026',
  description: 'Siklus aktif',
  status: 'voting',
  current_round: 1,
  created_by: 1,
  previous_session_id: null,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-02 00:00:00',
  electorate_count: 3,
  round_count: 1,
  is_active: true,
  final_candidate: null,
  can_create_election: false,
};

const mockAssessmentData: AssessmentStatusResponse = {
  all_finalized: true,
  total_panelists: 3,
  panel: [
    { user_id: 1, username: 'dm1', name: 'Ketua Panel', role: 'chair', is_finalized: true, finalized_at: '2026-11-04 14:30:00' },
    { user_id: 2, username: 'dm2', name: 'Anggota 1', role: 'member', is_finalized: true, finalized_at: '2026-11-04 14:35:00' },
    { user_id: 3, username: 'dm3', name: 'Anggota 2', role: 'member', is_finalized: true, finalized_at: '2026-11-04 14:38:00' },
  ],
};

const mockBordaData: BordaResponse = {
  total_points_distributed: 18,
  rankings: [
    { candidate_id: 1, candidate_name: 'Kandidat A', borda_points: 8, borda_value: 0.4444, percentage: 44.44, rank: 1 },
    { candidate_id: 2, candidate_name: 'Kandidat B', borda_points: 6, borda_value: 0.3333, percentage: 33.33, rank: 2 },
    { candidate_id: 3, candidate_name: 'Kandidat C', borda_points: 4, borda_value: 0.2222, percentage: 22.22, rank: 3 },
  ],
  dm_breakdown: {},
};

function makeVotingStatus(overrides: Partial<VotingStatusResponse>): VotingStatusResponse {
  return {
    session_status: 'voting',
    current_round: 1,
    is_voting_open: true,
    has_voted_this_round: false,
    votes_cast_in_round: 0,
    eligible_voters: 3,
    required_votes: 3,
    majority_threshold: 2,
    is_eligible: true,
    evaluation: null,
    ratified_decision: null,
    can_chair_open: false,
    can_chair_approve: false,
    electorate: [
      { user_id: 1, username: 'dm1', name: 'Ketua Panel', role: 'chair', has_voted: false },
      { user_id: 2, username: 'dm2', name: 'Anggota 1', role: 'member', has_voted: false },
      { user_id: 3, username: 'dm3', name: 'Anggota 2', role: 'member', has_voted: false },
    ],
    ...overrides,
  };
}

describe('DashboardPage — Voting Status & Data Synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserState.id = 1;
    mockUserState.username = 'dm1';
    mockUserState.name = 'Ketua Panel';
    mockUserState.role = 'chair';
    mockGetAssessmentStatus.mockResolvedValue({ success: true, data: mockAssessmentData });
    mockGetBordaResults.mockResolvedValue({ success: true, data: mockBordaData });
    mockGetActiveElection.mockResolvedValue({ success: true, data: mockActiveElection });
  });

  // Skenario A: Belum ada suara (0/3)
  it('A: Menampilkan 0/3 suara masuk, semua panelis belum voting, dan status berlangsung', async () => {
    mockGetVotingStatus.mockResolvedValue({
      success: true,
      data: makeVotingStatus({
        votes_cast_in_round: 0,
        electorate: [
          { user_id: 1, username: 'dm1', name: 'Ketua Panel', role: 'chair', has_voted: false },
          { user_id: 2, username: 'dm2', name: 'Anggota 1', role: 'member', has_voted: false },
          { user_id: 3, username: 'dm3', name: 'Anggota 2', role: 'member', has_voted: false },
        ],
      }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('votes-fraction')).toHaveTextContent('0/3');
    });

    expect(screen.getByTestId('collection-pending')).toHaveTextContent('3 panelis belum memberikan suara');
    expect(screen.getByTestId('not-voted-dm1')).toBeInTheDocument();
    expect(screen.getByTestId('not-voted-dm2')).toBeInTheDocument();
    expect(screen.getByTestId('not-voted-dm3')).toBeInTheDocument();
    expect(screen.getByTestId('session-status-label')).toHaveTextContent('Voting Berlangsung');
  });

  // Skenario B: Satu suara (1/3 — kondisi aktual database Pilpress saat ini)
  it('B: Menampilkan 1/3 suara, dm1 sudah voting, dm2 & dm3 belum voting', async () => {
    mockGetVotingStatus.mockResolvedValue({
      success: true,
      data: makeVotingStatus({
        votes_cast_in_round: 1,
        electorate: [
          { user_id: 1, username: 'dm1', name: 'Ketua Panel', role: 'chair', has_voted: true },
          { user_id: 2, username: 'dm2', name: 'Anggota 1', role: 'member', has_voted: false },
          { user_id: 3, username: 'dm3', name: 'Anggota 2', role: 'member', has_voted: false },
        ],
      }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('votes-fraction')).toHaveTextContent('1/3');
    });

    expect(screen.getByTestId('collection-pending')).toHaveTextContent('2 panelis belum memberikan suara');
    expect(screen.getByTestId('voted-dm1')).toHaveTextContent('Sudah voting');
    expect(screen.getByTestId('not-voted-dm2')).toHaveTextContent('Belum voting');
    expect(screen.getByTestId('not-voted-dm3')).toHaveTextContent('Belum voting');
    expect(screen.queryByTestId('collection-done')).not.toBeInTheDocument();
  });

  // Skenario C: Dua suara (2/3)
  it('C: Menampilkan 2/3 suara, pengumpulan masih berlangsung', async () => {
    mockGetVotingStatus.mockResolvedValue({
      success: true,
      data: makeVotingStatus({
        votes_cast_in_round: 2,
        electorate: [
          { user_id: 1, username: 'dm1', name: 'Ketua Panel', role: 'chair', has_voted: true },
          { user_id: 2, username: 'dm2', name: 'Anggota 1', role: 'member', has_voted: true },
          { user_id: 3, username: 'dm3', name: 'Anggota 2', role: 'member', has_voted: false },
        ],
      }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('votes-fraction')).toHaveTextContent('2/3');
    });

    expect(screen.getByTestId('collection-pending')).toHaveTextContent('1 panelis belum memberikan suara');
    expect(screen.getByTestId('voted-dm1')).toBeInTheDocument();
    expect(screen.getByTestId('voted-dm2')).toBeInTheDocument();
    expect(screen.getByTestId('not-voted-dm3')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-done')).not.toBeInTheDocument();
  });

  // Skenario D: Tiga suara (3/3 — selesai)
  it('D: Menampilkan 3/3 suara dan pesan pengumpulan suara selesai', async () => {
    mockGetVotingStatus.mockResolvedValue({
      success: true,
      data: makeVotingStatus({
        session_status: 'voting_completed',
        votes_cast_in_round: 3,
        electorate: [
          { user_id: 1, username: 'dm1', name: 'Ketua Panel', role: 'chair', has_voted: true },
          { user_id: 2, username: 'dm2', name: 'Anggota 1', role: 'member', has_voted: true },
          { user_id: 3, username: 'dm3', name: 'Anggota 2', role: 'member', has_voted: true },
        ],
      }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('votes-fraction')).toHaveTextContent('3/3');
    });

    expect(screen.getByTestId('collection-done')).toHaveTextContent('Pengumpulan suara selesai.');
    expect(screen.getByTestId('session-status-label')).toHaveTextContent('Voting Selesai');
    expect(screen.queryByTestId('collection-pending')).not.toBeInTheDocument();
  });

  // Skenario E: API Error — tidak memakai data dummy, menampilkan pesan error
  it('E: Menampilkan error state saat API gagal dan tidak menghasilkan data otomatis', async () => {
    mockGetVotingStatus.mockRejectedValue(new Error('Koneksi ke backend gagal'));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('voting-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Koneksi ke backend gagal')).toBeInTheDocument();
    expect(screen.queryByTestId('votes-fraction')).not.toBeInTheDocument();
    expect(screen.queryByTestId('electorate-list')).not.toBeInTheDocument();
  });

  // Skenario F: Pergantian akun — role voter melihat view terbatas (tanpa tabel panel/borda)
  it('F: Akun voter hanya melihat progres voting umum tanpa akses matriks panel atau borda', async () => {
    mockUserState.id = 4;
    mockUserState.username = 'voter1';
    mockUserState.name = 'Pemilih Satu';
    mockUserState.role = 'voter';

    mockGetVotingStatus.mockResolvedValue({
      success: true,
      data: makeVotingStatus({
        votes_cast_in_round: 1,
        electorate: [
          { user_id: 1, username: 'dm1', name: 'Ketua Panel', role: 'chair', has_voted: true },
          { user_id: 2, username: 'dm2', name: 'Anggota 1', role: 'member', has_voted: false },
          { user_id: 3, username: 'dm3', name: 'Anggota 2', role: 'member', has_voted: false },
        ],
      }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Selamat Datang, Pemilih Satu')).toBeInTheDocument();
    });

    // Panel table dan Borda tidak boleh muncul untuk voter
    expect(screen.queryByTestId('panel-table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('borda-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assessment-status')).not.toBeInTheDocument();

    // Progres voting tetap dapat dilihat secara transparan
    expect(screen.getByTestId('votes-fraction')).toHaveTextContent('1/3');
  });
});
