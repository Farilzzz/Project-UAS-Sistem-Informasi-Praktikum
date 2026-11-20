import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CandidateListPage } from './CandidateListPage';
import { ToastProvider } from '@/components/ui/Toast';
import { Candidate } from '@/types';

const mocks = vi.hoisted(() => ({
  authState: { role: 'chair' as 'chair' | 'member' | 'voter' },
  getCandidates: vi.fn(),
  createCandidate: vi.fn(),
  updateCandidate: vi.fn(),
  deleteCandidate: vi.fn(),
  verifyCandidate: vi.fn(),
  finalizeCandidates: vi.fn(),
}));

vi.mock('@/services/api', () => ({
  api: {
    getCandidates: () => mocks.getCandidates(),
    createCandidate: (body: unknown) => mocks.createCandidate(body),
    updateCandidate: (id: number, body: unknown) => mocks.updateCandidate(id, body),
    deleteCandidate: (id: number) => mocks.deleteCandidate(id),
    verifyCandidate: (id: number) => mocks.verifyCandidate(id),
    finalizeCandidates: () => mocks.finalizeCandidates(),
  },
}));

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'dm1', name: 'Ketua Panel', role: mocks.authState.role },
  }),
}));

function candidates(finalized = false): Candidate[] {
  return [
    {
      id: 1,
      name: 'Calon A',
      description: 'Deskripsi A',
      vision: 'Visi A',
      mission: 'Misi A',
      work_program: 'Program A',
      profile: 'Profil A',
      is_finalized: finalized ? 1 : 0,
    },
    {
      id: 2,
      name: 'Calon B',
      vision: 'Visi B',
      mission: 'Misi B',
      profile: 'Profil B',
      is_finalized: finalized ? 1 : 0,
    },
  ];
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <CandidateListPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.role = 'chair';
  mocks.getCandidates.mockResolvedValue({ success: true, data: candidates() });
  mocks.createCandidate.mockResolvedValue({ success: true, message: 'Kandidat berhasil diajukan' });
  mocks.updateCandidate.mockResolvedValue({ success: true, message: 'Kandidat berhasil diperbarui' });
  mocks.deleteCandidate.mockResolvedValue({ success: true, message: 'Kandidat berhasil dihapus' });
  mocks.verifyCandidate.mockResolvedValue({ success: true, message: 'Kandidat berhasil diverifikasi' });
  mocks.finalizeCandidates.mockResolvedValue({ success: true, message: 'Semua kandidat berhasil difinalisasi' });
});

describe('Phase 5 — Pencalonan Kandidat', () => {
  it('1. Chair melihat tombol ajukan, verifikasi, dan finalisasi saat draft', async () => {
    renderPage();
    expect(await screen.findByText('Calon A')).toBeTruthy();
    expect(screen.getByText('Ajukan Kandidat')).toBeTruthy();
    expect(screen.getByText('Finalisasi Semua Kandidat')).toBeTruthy();
    expect(screen.getAllByTitle('Verifikasi kandidat ini').length).toBe(2);
    expect(screen.getAllByTitle('Ubah kandidat').length).toBe(2);
  });

  it('2. Menampilkan deskripsi dan program kerja kandidat', async () => {
    renderPage();
    expect(await screen.findByText('Deskripsi A')).toBeTruthy();
    expect(screen.getAllByText((_, el) => (el?.textContent ?? '').includes('Program A')).length).toBeGreaterThan(0);
  });

  it('3. Anggota hanya melihat daftar tanpa kontrol', async () => {
    mocks.authState.role = 'member';
    renderPage();
    expect(await screen.findByText('Calon A')).toBeTruthy();
    expect(screen.queryByText('Ajukan Kandidat')).toBeNull();
    expect(screen.queryByText('Finalisasi Semua Kandidat')).toBeNull();
    expect(screen.queryByTitle('Verifikasi kandidat ini')).toBeNull();
  });

  it('4. Kandidat terfinalisasi mengunci kontrol', async () => {
    mocks.getCandidates.mockResolvedValue({ success: true, data: candidates(true) });
    renderPage();
    expect(await screen.findByText('Terfinalisasi')).toBeTruthy();
    expect(screen.getAllByText('Terverifikasi').length).toBe(2);
    expect(screen.queryByText('Ajukan Kandidat')).toBeNull();
    expect(screen.queryByTitle('Hapus kandidat')).toBeNull();
  });

  it('5. Form pencalonan mengirim seluruh field', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Ajukan Kandidat'));
    const nameInput = screen.getByPlaceholderText('Nama calon presiden');
    await user.type(nameInput, 'Calon Baru');
    await user.type(screen.getByPlaceholderText('Visi kepemimpinan...'), 'Visi Baru');
    await user.click(screen.getByText('Ajukan Kandidat', { selector: 'button[type="submit"]' }));

    await waitFor(() => {
      expect(mocks.createCandidate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Calon Baru', vision: 'Visi Baru' })
      );
    });
  });

  it('6. Klik verifikasi memanggil API dengan id yang benar', async () => {
    const user = userEvent.setup();
    renderPage();
    const verifyButtons = await screen.findAllByTitle('Verifikasi kandidat ini');
    await user.click(verifyButtons[0]);
    await waitFor(() => expect(mocks.verifyCandidate).toHaveBeenCalledWith(1));
  });

  it('7. Konfirmasi finalisasi semua kandidat memanggil API', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Finalisasi Semua Kandidat'));
    expect(await screen.findByText('Konfirmasi Finalisasi Kandidat')).toBeTruthy();
    await user.click(screen.getByText('Ya, Finalisasi Kandidat'));
    await waitFor(() => expect(mocks.finalizeCandidates).toHaveBeenCalled());
  });
});
