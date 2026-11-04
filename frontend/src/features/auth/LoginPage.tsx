import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (!username.trim() || !password.trim()) {
        setError('Username dan password wajib diisi.');
        return;
      }

      await login(username, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login gagal. Silakan coba lagi.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-navy-800 to-navy-900">
        <div className="text-center text-white">
          <div className="w-12 h-12 border-4 border-white border-t-gold-accent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Memuat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-800 to-navy-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="mb-8 text-center">
          <div className="inline-block bg-gold-accent px-4 py-2 rounded-lg mb-4">
            <h1 className="text-2xl font-bold text-navy-800 tracking-tight">PILPRESS</h1>
          </div>
          <p className="text-gold-accent text-sm font-medium">Sistem Pendukung Keputusan Kelompok</p>
          <p className="text-slate-300 text-sm mt-1">Pemilihan Calon Presiden</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-xl font-bold text-navy-800 mb-6 text-center">Masuk Ke Aplikasi</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-accent transition"
                placeholder="dm1"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-accent transition"
                placeholder="••••••••"
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-navy-800 text-white font-semibold py-2 rounded-lg hover:bg-navy-900 transition disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {isSubmitting ? 'Sedang Masuk...' : 'Masuk'}
            </button>
          </form>

          {/* Registration link */}
          <div className="mt-4 text-center">
            <p className="text-sm text-slate-600">
              Belum punya akun?{' '}
              <Link to="/register" className="text-gold-accent font-semibold hover:underline">
                Daftar sebagai pemilih
              </Link>
            </p>
          </div>

          {/* Demo Accounts */}
          <div className="mt-6 p-4 bg-slate-50 rounded-lg">
            <p className="text-xs font-semibold text-slate-600 mb-2">Akun Demonstrasi:</p>
            <div className="text-xs text-slate-600 space-y-1">
              <p><span className="font-medium">Ketua Panel:</span> dm1 / password123</p>
              <p><span className="font-medium">Anggota 1:</span> dm2 / password123</p>
              <p><span className="font-medium">Anggota 2:</span> dm3 / password123</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-400 text-xs mt-8">
          Simulasi GDSS untuk keperluan akademik 2026
        </p>
      </div>
    </div>
  );
};
