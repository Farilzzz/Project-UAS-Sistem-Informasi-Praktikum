import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssessmentInputPage } from './AssessmentInputPage';
import type { Candidate, Criterion } from '@/types';

const state = {
  candidates: [] as Candidate[],
  criteria: [] as Criterion[],
};

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 2, username: 'dm2', name: 'Anggota', role: 'member' } }),
}));

vi.mock('./useAssessmentData', () => ({
  useCandidates: () => ({ data: state.candidates, isLoading: false, error: null }),
  useCriteria: () => ({ data: state.criteria, isLoading: false, error: null }),
  useMyAssessments: () => ({ data: { items: [], is_finalized: false }, isLoading: false, error: null }),
  useSaveAssessments: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const criterion = (id: number, finalized = true): Criterion => ({
  id,
  session_id: 1,
  code: `C${id}`,
  name: `Kriteria ${id}`,
  description: '',
  weight: 25,
  type: 'benefit',
  is_finalized: finalized,
});

const candidate = (id: number, finalized = true): Candidate => ({
  id,
  session_id: 1,
  name: `Kandidat ${id}`,
  vision: null,
  mission: null,
  profile: null,
  is_finalized: finalized,
});

describe('AssessmentInputPage — empty state', () => {
  beforeEach(() => {
    state.candidates = [];
    state.criteria = [];
  });

  it('menjelaskan kriteria belum tersedia dan kandidat belum tersedia', () => {
    render(<AssessmentInputPage />);
    const empty = screen.getByTestId('assessment-empty-state');
    expect(empty).toHaveTextContent('Kriteria belum tersedia');
    expect(empty).toHaveTextContent('Kandidat belum tersedia');
    expect(screen.queryByRole('button', { name: /Tambah|Finalisasi/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Simpan Penilaian')).not.toBeInTheDocument();
  });

  it('membedakan kriteria/kandidat yang belum difinalisasi', () => {
    state.criteria = [criterion(1, false)];
    state.candidates = [candidate(1, false)];
    render(<AssessmentInputPage />);
    const empty = screen.getByTestId('assessment-empty-state');
    expect(empty).toHaveTextContent('Kriteria belum difinalisasi');
    expect(empty).toHaveTextContent('Kandidat belum difinalisasi');
  });

  it('menampilkan matriks ketika master data sudah final', () => {
    state.criteria = [criterion(1), criterion(2)];
    state.candidates = [candidate(1), candidate(2)];
    render(<AssessmentInputPage />);
    expect(screen.queryByTestId('assessment-empty-state')).not.toBeInTheDocument();
    expect(screen.getByText('Simpan Penilaian')).toBeInTheDocument();
  });
});
