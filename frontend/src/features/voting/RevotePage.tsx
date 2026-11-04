import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, describeApiError } from '@/services/api';
import { useAuth } from '@/features/auth/AuthContext';
import { AlertTriangle, Shuffle, LoaderCircle, RefreshCw, ChevronLeft } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

export const RevotePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Load current status
  const { data: statusData, isLoading: statusLoading, error: statusError, refetch: refetchStatus } = useQuery({
    queryKey: ['voting', 'status'],
    queryFn: async () => {
      const res = await api.getVotingStatus();
      if (res.success && res.data) return res.data;
      throw new Error(res.message || 'Gagal memuat status');
    },
    refetchInterval: 5000,
  });

  // Load voting results (previous round)
  const { data: resultsData, isLoading: resultsLoading, error: resultsError, refetch: refetchResults } = useQuery({
    queryKey: ['voting', 'results'],
    queryFn: async () => {
      const res = await api.getVotingResults();
      if (res.success && res.data) return res.data;
      throw new Error(res.message || 'Gagal memuat hasil');
    },
    retry: false,
  });

  // Next round mutation
  const nextRoundMut = useMutation({
    mutationFn: async () => {
      const res = await api.nextRoundVoting();
      if (res.success) return res.data;
      throw new Error(res.message || 'Gagal membuka putaran baru');
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['voting', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['voting', 'results'] });
      queryClient.invalidateQueries({ queryKey: ['decisions', 'final'] });
      setShowConfirmModal(false);
      toast.success(
        'Putaran voting ulang berhasil dibuka.',
        data?.message || `Putaran #${data?.round_number ?? ''} kini berlangsung.`.trim()
      );
      navigate('/voting');
    },
    onError: (err) => {
      // Modal tetap terbuka agar pengguna dapat membaca alasan dan mencoba lagi.
      toast.error('Gagal membuka putaran ulang.', describeApiError(err, 'Gagal membuka putaran baru.'));
    },
  });

  const handleNextRound = async () => {
    if (nextRoundMut.isPending) return;
    try {
      await nextRoundMut.mutateAsync();
    } catch {
      // onError menampilkan pesan; modal tetap terbuka.
    }
  };

  /* ─── Loading ─── */
  if (statusLoading || resultsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-navy-800 border-t-gold-accent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Memuat data putaran...</p>
        </div>
      </div>
    );
  }

  /* ─── Error ─── */
  if (statusError || resultsError) {
    const loadError = statusError ?? resultsError;
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-navy-800">Kelola Putaran Ulang</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center" role="alert">
          <p className="text-red-700 font-medium mb-4">
            {describeApiError(loadError, 'Gagal memuat data putaran voting.')}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => {
                if (statusError) void refetchStatus();
                if (resultsError) void refetchResults();
              }}
              className="px-4 py-2 bg-navy-800 text-white rounded-lg text-sm font-medium hover:bg-navy-900 transition"
            >
              Coba Lagi
            </button>
            <button
              onClick={() => navigate('/voting')}
              className="px-4 py-2 bg-white border border-slate-200 text-navy-800 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
            >
              Kembali ke Voting
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!statusData || !resultsData) return null;

  const isChair = user?.role === 'chair';
  const isTieStatus = statusData.session_status === 'tie_revote';
  const results = resultsData.results;
  const tallies = results.tallies ?? [];
  const currentRound = statusData.current_round;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl p-6 shadow-lg">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6" /> Kelola Putaran Ulang
            </h1>
            <p className="text-amber-100 text-sm">
              Hasil voting putaran {currentRound} menghasilkan seri. Ketua Panel dapat membuka putaran ulang.
            </p>
          </div>
        </div>
      </div>

      {/* ─ Alert: Not a tie ─── */}
      {!isTieStatus && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
          <p className="text-blue-900 font-medium">
            Status sesi bukan seri (tie_revote). Tidak perlu membuka putaran ulang.
          </p>
        </div>
      )}

      {/* ── Previous Round Results ── */}
      <div className="bg-white rounded-xl shadow border border-slate-100 p-6">
        <h2 className="font-bold text-navy-800 mb-4">Hasil Putaran #{currentRound}</h2>
        
        {/* Tie Alert */}
        <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <Shuffle className="w-8 h-8 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-bold text-amber-900 mb-1">Hasil Seri (1-1-1)</p>
              <p className="text-sm text-amber-800">
                Setiap kandidat memperoleh tepat 1 suara. Tidak ada pemenang mayoritas. Diperlukan putaran ulang untuk 
                menentukan pemenang definitif.
              </p>
            </div>
          </div>
        </div>

        {/* Vote Tally */}
        <div className="space-y-3">
          {tallies.map((t, idx) => (
            <div key={t.candidate_id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="font-bold text-lg text-navy-800 w-8 text-center">#{idx + 1}</div>
                <div>
                  <p className="font-semibold text-slate-800">{t.candidate_name}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-navy-800">{t.votes}</p>
                <p className="text-xs text-slate-500">{t.percentage.toFixed(2)}%</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-500 text-center mt-4">
          Total suara: {results.total_votes_cast}/{results.required_votes}
        </p>
      </div>

      {/* ── Chair Actions ── */}
      {isChair && isTieStatus && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-6">
          <h3 className="font-bold text-navy-800 mb-3">Tindakan Ketua Panel</h3>
          <p className="text-sm text-slate-700 mb-4">
            Sebagai Ketua Panel, Anda dapat membuka putaran voting ulang. Setiap Decision Maker akan memberikan suara 
            baru pada putaran berikutnya. Suara putaran sebelumnya tetap tersimpan dalam riwayat.
          </p>
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={nextRoundMut.isPending}
            className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            {nextRoundMut.isPending ? (
              <span className="inline-flex items-center gap-2"><LoaderCircle className="w-4 h-4 animate-spin" /> Membuka Putaran...</span>
            ) : (
              <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Buka Putaran Ulang</span>
            )}
          </button>
        </div>
      )}

      {/* ── Member View ── */}
      {!isChair && isTieStatus && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
          <p className="text-blue-900 font-medium">
            Menunggu Ketua Panel membuka putaran voting ulang. Anda dapat kembali ke halaman Voting untuk melihat status 
            terbaru.
          </p>
        </div>
      )}

      {/* ── Back Button ── */}
      <button
        type="button"
        onClick={() => navigate('/voting')}
        className="inline-flex items-center gap-1 rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-300"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Kembali ke Voting
      </button>

      {/* ── Confirmation Modal ── */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => {
            if (!nextRoundMut.isPending) setShowConfirmModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="revote-confirm-title"
            aria-busy={nextRoundMut.isPending}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6"
          >
            <h2 id="revote-confirm-title" className="text-xl font-bold text-navy-800 mb-3">Konfirmasi Putaran Ulang</h2>
            <p className="text-slate-700 mb-4">
              Apakah Anda yakin ingin membuka putaran voting ulang? Setiap Decision Maker akan diminta memberikan suara 
              baru. Suara putaran sebelumnya tetap tersimpan.
            </p>
            {nextRoundMut.error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3" role="alert">
                <p className="text-sm text-red-700">
                  {describeApiError(nextRoundMut.error, 'Gagal membuka putaran baru.')}
                </p>
                <p className="mt-1 text-xs text-red-600">
                  Periksa kembali status sesi, lalu tekan tombol di bawah untuk mencoba lagi.
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={nextRoundMut.isPending}
                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg font-medium hover:bg-slate-300 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleNextRound}
                disabled={nextRoundMut.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {nextRoundMut.isPending ? (
                  <>
                    <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" /> Memproses...
                  </>
                ) : (
                  'Ya, Buka Putaran Ulang'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
