import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import type { UserRole } from '@/types';

const authState: { user: { id: number; username: string; name: string; role: UserRole } | null } = {
  user: null,
};
const logoutMock = vi.fn();

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    isAuthenticated: authState.user !== null,
    isLoading: false,
    logout: logoutMock,
  }),
}));

describe('Akses Log Aktivitas (Phase 6)', () => {
  it('menu Log Aktivitas hanya muncul untuk Ketua Panel', () => {
    authState.user = { id: 1, username: 'dm1', name: 'Ketua', role: 'chair' };
    const { unmount } = render(
      <MemoryRouter initialEntries={['/audit-logs']}>
        <Layout><div>Halaman Audit</div></Layout>
      </MemoryRouter>
    );
    expect(screen.getAllByText('Log Aktivitas').length).toBeGreaterThan(0);
    unmount();

    authState.user = { id: 2, username: 'dm2', name: 'Anggota', role: 'member' };
    const memberView = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Layout><div>Dashboard</div></Layout>
      </MemoryRouter>
    );
    expect(screen.queryByText('Log Aktivitas')).not.toBeInTheDocument();
    memberView.unmount();

    authState.user = { id: 4, username: 'voter1', name: 'Pemilih', role: 'voter' };
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Layout><div>Dashboard</div></Layout>
      </MemoryRouter>
    );
    expect(screen.queryByText('Log Aktivitas')).not.toBeInTheDocument();
  });

  it('rute audit-logs menolak anggota dan pemilih', () => {
    const renderRoute = () => render(
      <MemoryRouter initialEntries={['/audit-logs']}>
        <Routes>
          <Route path="/dashboard" element={<div>Dashboard</div>} />
          <Route
            path="/audit-logs"
            element={
              <ProtectedRoute allowedRoles={['chair']}>
                <div>Halaman Audit</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    authState.user = { id: 1, username: 'dm1', name: 'Ketua', role: 'chair' };
    const chairView = renderRoute();
    expect(screen.getByText('Halaman Audit')).toBeInTheDocument();
    chairView.unmount();

    authState.user = { id: 2, username: 'dm2', name: 'Anggota', role: 'member' };
    const memberView = renderRoute();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Halaman Audit')).not.toBeInTheDocument();
    memberView.unmount();

    authState.user = { id: 4, username: 'voter1', name: 'Pemilih', role: 'voter' };
    renderRoute();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Halaman Audit')).not.toBeInTheDocument();
  });
});
