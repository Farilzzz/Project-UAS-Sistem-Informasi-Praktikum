import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api';
import { LoaderCircle, UserRound, Lock, Eye, EyeOff } from 'lucide-react';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Password dan konfirmasi tidak cocok.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.register(name, username, password);
      if (res.success) {
        alert('Pendaftaran berhasil! Silakan login.');
        navigate('/login', { state: { username } });
      } else {
        setError(res.message || 'Gagal mendaftar.');
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Gagal mendaftar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md border border-slate-200">
        <h2 className="text-2xl font-bold text-navy-900 mb-2">Buat Akun Pilpress</h2>
        <p className="text-slate-600 mb-6">Daftarkan diri Anda sebagai pemilih.</p>
        {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}
        <form onSubmit={handleRegister}>
          <div className="mb-4">
            <label htmlFor="reg-name" className="block text-sm font-medium mb-1">Nama Lengkap</label>
            <div className="relative">
              <UserRound className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" aria-hidden="true" />
              <input id="reg-name" name="name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full pl-10 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-gold-accent" required />
            </div>
          </div>
          <div className="mb-4">
            <label htmlFor="reg-username" className="block text-sm font-medium mb-1">Username</label>
            <input id="reg-username" name="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-gold-accent" required />
          </div>
          <div className="mb-4">
            <label htmlFor="reg-password" className="block text-sm font-medium mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" aria-hidden="true" />
              <input id="reg-password" name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 pr-10 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-gold-accent" required />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 focus:outline-none focus:ring-2 focus:ring-gold-accent rounded"
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="h-5 w-5 text-slate-400" aria-hidden="true" /> : <Eye className="h-5 w-5 text-slate-400" aria-hidden="true" />}
              </button>
            </div>
          </div>
          <div className="mb-6">
            <label htmlFor="reg-confirm-password" className="block text-sm font-medium mb-1">Konfirmasi Password</label>
            <input id="reg-confirm-password" name="confirm_password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-gold-accent" required />
          </div>
          <button disabled={loading} className="w-full bg-navy-900 text-white py-2 rounded font-semibold hover:bg-navy-800 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gold-accent disabled:opacity-60">
            {loading ? <LoaderCircle className="animate-spin h-5 w-5" aria-hidden="true" /> : 'Daftar'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm">Sudah punya akun? <Link to="/login" className="text-gold-600 font-bold">Masuk</Link></p>
      </div>
    </div>
  );
}
