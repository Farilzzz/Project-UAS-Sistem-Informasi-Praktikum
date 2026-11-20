import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditLogPage } from './AuditLogPage';
import { ApiError } from '@/services/api';
import type { AuditLog, AuditLogsResponse } from '@/types';

const getAuditLogsMock = vi.fn();

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return {
    ...actual,
    api: {
      getAuditLogs: (...args: unknown[]) => getAuditLogsMock(...args),
    },
  };
});

const makeLog = (id: number, overrides: Partial<AuditLog> = {}): AuditLog => ({
  id,
  session_id: 1,
  user_id: 1,
  action: 'LOGIN',
  details: 'Login berhasil',
  ip_address: '127.0.0.1',
  created_at: '2026-01-02T09:00:00Z',
  user_name: 'Ketua Panel',
  user_role: 'chair',
  ...overrides,
});

const pageResponse = (logs: AuditLog[], total: number): AuditLogsResponse => ({
  logs,
  total,
  limit: 25,
  offset: 0,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuditLogPage />
    </QueryClientProvider>
  );
}

describe('AuditLogPage', () => {
  beforeEach(() => {
    getAuditLogsMock.mockReset();
  });

  it('menampilkan tabel log beserta waktu, aktor, aksi, detail, dan IP', async () => {
    getAuditLogsMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: pageResponse(
        [makeLog(1), makeLog(2, { action: 'VOTE', details: 'Suara tercatat', user_name: 'Anggota', user_role: 'member', ip_address: '127.0.0.2' })],
        2
      ),
    });

    renderPage();

    expect(await screen.findByTestId('audit-table')).toBeInTheDocument();
    expect(screen.getByTestId('audit-row-1')).toHaveTextContent('Login berhasil');
    expect(screen.getByTestId('audit-row-2')).toHaveTextContent('VOTE');
    expect(screen.getByTestId('audit-row-2')).toHaveTextContent('127.0.0.2');
    expect(screen.getByTestId('audit-total')).toHaveTextContent('dari 2 log');
  });

  it('menampilkan state kosong bila tidak ada log', async () => {
    getAuditLogsMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: pageResponse([], 0),
    });

    renderPage();

    expect(await screen.findByTestId('audit-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('audit-table')).not.toBeInTheDocument();
  });

  it('menampilkan error dengan tombol coba lagi', async () => {
    getAuditLogsMock.mockRejectedValue(new ApiError(403, 'Akses ditolak.'));

    renderPage();

    expect(await screen.findByTestId('audit-error')).toHaveTextContent('Akses ditolak.');
  });

  it('meneruskan filter ke API dan mengatur ulang halaman', async () => {
    getAuditLogsMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: pageResponse([makeLog(1)], 1),
    });

    renderPage();
    await screen.findByTestId('audit-table');

    await userEvent.type(screen.getByTestId('audit-filter-user'), '2');
    await userEvent.type(screen.getByTestId('audit-filter-action'), 'VOTE');
    fireEvent.change(screen.getByTestId('audit-filter-date-from'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByTestId('audit-filter-date-to'), { target: { value: '2026-01-31' } });
    await userEvent.click(screen.getByTestId('audit-apply-filter'));

    await waitFor(() => {
      const calls = getAuditLogsMock.mock.calls;
      const lastCall = calls[calls.length - 1] ?? [];
      expect(lastCall[3]).toBe(2);
      expect(lastCall[4]).toBe('VOTE');
      expect(lastCall[5]).toBe('2026-01-01');
      expect(lastCall[6]).toBe('2026-01-31 23:59:59');
    });
  });

  it('mengubah offset saat halaman berikutnya diklik', async () => {
    const logs = Array.from({ length: 25 }, (_, i) => makeLog(i + 1));
    getAuditLogsMock.mockResolvedValue({
      success: true,
      message: 'ok',
      data: { logs, total: 40, limit: 25, offset: 0 },
    });

    renderPage();
    await screen.findByTestId('audit-table');
    expect(screen.getByTestId('audit-page')).toHaveTextContent('Halaman 1 / 2');

    await userEvent.click(screen.getByTestId('audit-next'));

    await waitFor(() => {
      const calls = getAuditLogsMock.mock.calls;
      const lastCall = calls[calls.length - 1] ?? [];
      expect(lastCall[2]).toBe(25);
    });
    expect(screen.getByTestId('audit-page')).toHaveTextContent('Halaman 2 / 2');
  });
});
