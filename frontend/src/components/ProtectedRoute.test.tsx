import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { UserRole } from '@/types';

const authState: { user: { id: number; username: string; name: string; role: UserRole } | null; isLoading: boolean } = {
  user: null,
  isLoading: false,
};

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    isAuthenticated: authState.user !== null,
    isLoading: authState.isLoading,
  }),
}));

function renderAt(path: string, allowedRoles?: UserRole[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Halaman Login</div>} />
        <Route path="/dashboard" element={<div>Halaman Dashboard</div>} />
        <Route
          path="/protected"
          element={
            <ProtectedRoute allowedRoles={allowedRoles}>
              <div>Konten Terlindungi</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    authState.user = null;
    authState.isLoading = false;
  });

  it('mengalihkan pengguna tanpa sesi ke halaman login', () => {
    renderAt('/protected');
    expect(screen.getByText('Halaman Login')).toBeInTheDocument();
  });

  it('mengizinkan role yang sesuai mengakses halaman', () => {
    authState.user = { id: 1, username: 'dm1', name: 'Ketua', role: 'chair' };
    renderAt('/protected', ['chair', 'member']);
    expect(screen.getByText('Konten Terlindungi')).toBeInTheDocument();
  });

  it('mengalihkan voter dari halaman khusus panel ke dashboard', () => {
    authState.user = { id: 4, username: 'voter1', name: 'Pemilih', role: 'voter' };
    renderAt('/protected', ['chair', 'member']);
    expect(screen.getByText('Halaman Dashboard')).toBeInTheDocument();
  });
});
