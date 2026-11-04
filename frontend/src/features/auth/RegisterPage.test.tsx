import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RegisterPage from './RegisterPage';

const registerMock = vi.fn();

vi.mock('../../services/api', () => ({
  api: {
    register: (...args: unknown[]) => registerMock(...args),
  },
}));

describe('RegisterPage', () => {
  beforeEach(() => {
    registerMock.mockReset();
  });

  it('menolak pendaftaran jika konfirmasi password tidak cocok', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Nama Lengkap'), 'Pemilih Satu');
    await user.type(screen.getByLabelText('Username'), 'pemilih1');
    await user.type(screen.getByLabelText('Password'), 'rahasia123');
    await user.type(screen.getByLabelText('Konfirmasi Password'), 'rahasia456');
    await user.click(screen.getByRole('button', { name: /daftar/i }));

    expect(await screen.findByText('Password dan konfirmasi tidak cocok.')).toBeInTheDocument();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('mengirim data registrasi ke API dengan role voter dari backend', async () => {
    const user = userEvent.setup();
    registerMock.mockResolvedValue({ success: true, message: 'ok', data: { role: 'voter' } });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Nama Lengkap'), 'Pemilih Satu');
    await user.type(screen.getByLabelText('Username'), 'pemilih1');
    await user.type(screen.getByLabelText('Password'), 'rahasia123');
    await user.type(screen.getByLabelText('Konfirmasi Password'), 'rahasia123');
    await user.click(screen.getByRole('button', { name: /daftar/i }));

    expect(registerMock).toHaveBeenCalledWith('Pemilih Satu', 'pemilih1', 'rahasia123');
    alertSpy.mockRestore();
  });

  it('menampilkan pesan error jika username sudah dipakai', async () => {
    const user = userEvent.setup();
    registerMock.mockRejectedValue(new Error('Username sudah terdaftar. Gunakan username lain.'));

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Nama Lengkap'), 'Pemilih Satu');
    await user.type(screen.getByLabelText('Username'), 'dm1');
    await user.type(screen.getByLabelText('Password'), 'rahasia123');
    await user.type(screen.getByLabelText('Konfirmasi Password'), 'rahasia123');
    await user.click(screen.getByRole('button', { name: /daftar/i }));

    expect(
      await screen.findByText('Username sudah terdaftar. Gunakan username lain.')
    ).toBeInTheDocument();
  });
});
