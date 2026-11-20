import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CriteriaPage } from './CriteriaPage';
import { ToastProvider } from '@/components/ui/Toast';
import { Criterion, CriteriaSummary } from '@/types';

const mocks = vi.hoisted(() => ({
  authState: { role: 'chair' as 'chair' | 'member' | 'voter' },
  getCriteria: vi.fn(),
  getCriteriaSummary: vi.fn(),
  createCriterion: vi.fn(),
  updateCriterion: vi.fn(),
  deleteCriterion: vi.fn(),
  finalizeCriteria: vi.fn(),
}));

vi.mock('@/services/api', () => ({
  api: {
    getCriteria: () => mocks.getCriteria(),
    getCriteriaSummary: () => mocks.getCriteriaSummary(),
    createCriterion: (body: unknown) => mocks.createCriterion(body),
    updateCriterion: (id: number, body: unknown) => mocks.updateCriterion(id, body),
    deleteCriterion: (id: number) => mocks.deleteCriterion(id),
    finalizeCriteria: () => mocks.finalizeCriteria(),
  },
}));

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'dm1', name: 'Ketua Panel', role: mocks.authState.role },
  }),
}));

function criteria(): Criterion[] {
  return [
    { id: 1, code: 'C1', name: 'Integritas', weight: 60, type: 'benefit', description: 'Teladan' },
    { id: 2, code: 'C2', name: 'Biaya', weight: 40, type: 'cost', description: 'Efisiensi' },
  ];
}

function summary(overrides: Partial<CriteriaSummary> = {}): CriteriaSummary {
  return {
    session_id: 1,
    count: 2,
    total_weight: 100,
    is_complete: true,
    is_finalized: false,
    can_manage: true,
    can_finalize: true,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <CriteriaPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.role = 'chair';
  mocks.getCriteria.mockResolvedValue({ success: true, data: criteria() });
  mocks.getCriteriaSummary.mockResolvedValue({ success: true, data: summary() });
  mocks.createCriterion.mockResolvedValue({ success: true, message: 'Kriteria berhasil ditambahkan' });
  mocks.updateCriterion.mockResolvedValue({ success: true, message: 'Kriteria berhasil diperbarui' });
  mocks.deleteCriterion.mockResolvedValue({ success: true, message: 'Kriteria berhasil dihapus' });
  mocks.finalizeCriteria.mockResolvedValue({ success: true, message: 'Kriteria berhasil difinalisasi' });
});

describe('Phase 5 — Kelola Kriteria', () => {
  it('1. Chair melihat tombol tambah, edit, hapus, dan finalisasi saat draft', async () => {
    renderPage();
    expect((await screen.findAllByText('Integritas')).length).toBeGreaterThan(0);
    expect(screen.getByText('Tambah Kriteria')).toBeTruthy();
    expect(screen.getByText('Finalisasi Kriteria')).toBeTruthy();
    // Tombol aksi ada di card (2) dan table tidak punya action
    expect(screen.getAllByTitle('Ubah kriteria').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByTitle('Hapus kriteria').length).toBeGreaterThanOrEqual(2);
  });

  it('2. Total bobot ditampilkan 100% dan tombol finalisasi aktif', async () => {
    renderPage();
    expect(await screen.findByText(/100% \/ 100%/)).toBeTruthy();
    const finalizeButton = screen.getByText('Finalisasi Kriteria').closest('button');
    expect(finalizeButton?.disabled).toBe(false);
  });

  it('3. Peringatan bobot tampil bila total bukan 100% dan finalisasi disabled', async () => {
    mocks.getCriteria.mockResolvedValue({
      success: true,
      data: criteria().map((c, i) => ({ ...c, weight: i === 0 ? 50 : 30 })),
    });
    mocks.getCriteriaSummary.mockResolvedValue({
      success: true,
      data: summary({ total_weight: 80, is_complete: false, can_finalize: false }),
    });
    renderPage();
    expect((await screen.findAllByText((_, el) => (el?.textContent ?? '').includes('Perhatian Bobot'))).length).toBeGreaterThan(0);
    const finalizeButton = screen.getByText('Finalisasi Kriteria').closest('button');
    expect(finalizeButton?.disabled).toBe(true);
  });

  it('4. Anggota hanya melihat data, tanpa kontrol pengelolaan', async () => {
    mocks.authState.role = 'member';
    mocks.getCriteriaSummary.mockResolvedValue({
      success: true,
      data: summary({ can_manage: false, can_finalize: false }),
    });
    renderPage();
    expect((await screen.findAllByText('Integritas')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Tambah Kriteria')).toBeNull();
    expect(screen.queryByText('Finalisasi Kriteria')).toBeNull();
    expect(screen.queryByTitle('Ubah kriteria')).toBeNull();
  });

  it('5. Kriteria terfinalisasi mengunci kontrol', async () => {
    mocks.getCriteria.mockResolvedValue({
      success: true,
      data: criteria().map((c) => ({ ...c, is_finalized: 1 })),
    });
    mocks.getCriteriaSummary.mockResolvedValue({
      success: true,
      data: summary({ is_finalized: true, can_manage: false, can_finalize: false }),
    });
    renderPage();
    expect(await screen.findByText('Terfinalisasi')).toBeTruthy();
    expect(screen.queryByText('Tambah Kriteria')).toBeNull();
    expect(screen.queryByTitle('Hapus kriteria')).toBeNull();
  });

  it('6. Submit form tambah kriteria mengirim payload yang benar', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Tambah Kriteria'));
    await user.type(screen.getByPlaceholderText('contoh: Integritas dan Rekam Jejak'), 'Kepemimpinan');
    const numberInput = screen.getByRole('spinbutton');
    await user.clear(numberInput);
    await user.type(numberInput, '15');
    await user.click(screen.getByText('Tambah', { selector: 'button' }));
    await waitFor(() => {
      expect(mocks.createCriterion).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Kepemimpinan', weight: 15, type: 'benefit' })
      );
    });
  });

  it('7. Klik finalisasi menampilkan konfirmasi lalu memanggil API', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Finalisasi Kriteria'));
    expect(await screen.findByText('Konfirmasi Finalisasi Kriteria')).toBeTruthy();
    await user.click(screen.getByText('Ya, Finalisasi Kriteria'));
    await waitFor(() => expect(mocks.finalizeCriteria).toHaveBeenCalled());
  });
});
