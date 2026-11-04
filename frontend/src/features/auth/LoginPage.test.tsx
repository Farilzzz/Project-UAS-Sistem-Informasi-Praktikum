import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';

const loginMock = vi.fn();

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    login: loginMock,
    isLoading: false,
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    loginMock.mockReset();
  });

  it('menampilkan validasi jika username/password kosong', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /masuk/i }));

    expect(await screen.findByText('Username dan password wajib diisi.')).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('memanggil login dengan kredensial yang diisi', async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Username'), 'dm1');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /masuk/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith('dm1', 'password123');
    });
  });

  it('menampilkan pesan error dari backend saat login gagal', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue(new Error('Username atau password salah.'));

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Username'), 'dm1');
    await user.type(screen.getByLabelText('Password'), 'salah');
    await user.click(screen.getByRole('button', { name: /masuk/i }));

    expect(await screen.findByText('Username atau password salah.')).toBeInTheDocument();
  });
});
