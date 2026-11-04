import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, describeApiError, isApiError } from '@/services/api';
import { useAuth } from '@/features/auth/AuthContext';
import { Candidate } from '@/types';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Lock,
  BarChart3,
  FileText,
  CheckCircle,
  LoaderCircle,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

export const VotingPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const openModalRef = useRef<HTMLDivElement>(null);
  const voteModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showOpenModal) openModalRef.current?.focus();
  }, [showOpenModal]);

  useEffect(() => {
    if (showVoteModal) voteModalRef.current?.focus();
  }, [showVoteModal]);

  const { data: statusData, isLoading: statusLoading, error: statusError } = useQuery({
    queryKey: ['voting', 'status'],
    queryFn: async () => {
      const res = await api.getVotingStatus();
      if (res.success && res.data) return res.data;
      throw new Error(res.message || 'Gagal memuat status voting');
    },
    refetchInterval: 5000,
  });

  const { data: candidates, isLoading: candidatesLoading } = useQuery({
    queryKey: ['candidates'],
    queryFn: async () => {
      const res = await api.getCandidates();
      if (res.success && res.data) return res.data as Candidate[];
      throw new Error(res.message || 'Gagal memuat kandidat');
    },
  });

  const openVotingMut = useMutation({
    mutationFn: async () => {
      const res = await api.openVoting();
      if (res.success) return res.data;
      throw new Error(res.message || 'Gagal membuka voting');
    },
    onSuccess: (data) => {
      // Selaraskan seluruh tampilan dengan status sesi terbaru dari backend.
      queryClient.invalidateQueries({ queryKey: ['voting', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['voting', 'results'] });
      queryClient.invalidateQueries({ queryKey: ['assessments', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['decisions', 'final'] });
      setShowOpenModal(false);
      toast.success(
        'Sesi voting berhasil dibuka.',
        data?.message || `Putaran voting #${data?.round_number ?? 1} kini berlangsung.`
      );
    },
    onError: (err) => {
      // Modal tetap terbuka agar pengguna membaca alasan kegagalan dan dapat mencoba lagi.
      toast.error('Sesi voting gagal dibuka.', describeApiError(err, 'Gagal membuka sesi voting.'));
    },
  });

  const voteMut = useMutation({
    mutationFn: async (candidateId: number) => {
      const res = await api.vote(candidateId);
      if (res.success) return res.data;
      throw new Error(res.message || 'Gagal mengirim suara');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voting', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['voting', 'results'] });
      queryClient.invalidateQueries({ queryKey: ['decisions', 'final'] });
      setShowVoteModal(false);
      setSelectedCandidate(null);
      toast.success('Suara berhasil dikirim.', 'Menunggu pemilih lain menyelesaikan putaran ini.');
    },
    onError: (err) => {
      toast.error('Suara gagal dikirim.', describeApiError(err, 'Gagal mengirim suara.'));
    },
  });

  const handleOpenVoting = async () => {
    if (openVotingMut.isPending) return;
    try {
      await openVotingMut.mutateAsync();
    } catch {
      // Ditangani oleh onError: modal tetap terbuka dengan pesan error inline.
    }
  };

  const handleVote = async () => {
    if (!selectedCandidate || voteMut.isPending) return;
    try {
      await voteMut.mutateAsync(selectedCandidate.id);
    } catch {
      // Ditangani oleh onError: modal tetap terbuka dengan pesan error inline.
    }
  };

  const openVotingErrorMessage = openVotingMut.error
    ? isApiError(openVotingMut.error) && openVotingMut.error.status === 409
      ? `Sesi voting belum dapat dibuka. ${describeApiError(
          openVotingMut.error,
          'Seluruh Decision Maker harus memfinalisasi penilaiannya terlebih dahulu.'
        )}`
      : describeApiError(openVotingMut.error, 'Gagal membuka sesi voting.')
    : '';

  // Escape menutup modal, kecuali saat permintaan sedang diproses.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showVoteModal && !voteMut.isPending) {
        setShowVoteModal(false);
        setSelectedCandidate(null);
      } else if (showOpenModal && !openVotingMut.isPending) {
        setShowOpenModal(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showOpenModal, showVoteModal, openVotingMut.isPending, voteMut.isPending]);

  /* ─── Loading ─── */
  if (statusLoading || candidatesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-navy-800 border-t-gold-accent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Memuat status voting...</p>
        </div>
      </div>
    );
  }

  /* ─── Error ─── */
  if (statusError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-navy-800">Voting</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700 font-medium">
            {statusError instanceof Error ? statusError.message : 'Gagal memuat'}
          </p>
        </div>
      </div>
    );
  }

  if (!statusData) return null;

  const isChair = user?.role === 'chair';
  const canOpenVoting = isChair && statusData.can_chair_open;
  const canApprove = isChair && statusData.can_chair_approve;
  const isEligible = statusData.is_eligible;
  const canVote = statusData.is_voting_open && !statusData.has_voted_this_round && isEligible;
  const hasVoted = statusData.has_voted_this_round;
  const totalVoters = statusData.eligible_voters;
  const threshold = statusData.majority_threshold;

  /* ─── Status badge ─── */
  const getStatusBadge = () => {
    const status = statusData.session_status;
    if (status === 'ratified') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4 text-green-700" /> Keputusan Disahkan
        </span>
      );
    }
    if (status === 'voting_completed') {
      return <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">Voting Selesai</span>;
    }
    if (status === 'tie_revote') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-semibold">
          <AlertTriangle className="w-4 h-4 text-amber-700" /> Hasil Seri
        </span>
      );
    }
    if (status === 'voting' && statusData.is_voting_open) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-semibold">
          <Clock className="w-4 h-4 text-purple-700" /> Voting Berlangsung
        </span>
      );
    }
    if (status === 'assessment') {
      return <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-semibold">Voting Belum Dibuka</span>;
    }
    return <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-semibold">{status}</span>;
  };

  const getStatusMessage = () => {
    if (statusData.session_status === 'ratified') {
      return 'Keputusan final telah disahkan oleh Ketua Panel.';
    }
    if (statusData.session_status === 'voting_completed' && statusData.evaluation?.status === 'majority') {
      return 'Voting selesai dengan hasil mayoritas. Menunggu pengesahan.';
    }
    if (statusData.session_status === 'tie_revote') {
      return 'Hasil voting seri (1-1-1). Ketua Panel dapat membuka putaran ulang.';
    }
    if (statusData.is_voting_open && !hasVoted) {
      return 'Voting sedang berlangsung. Silakan pilih kandidat Anda.';
    }
    if (statusData.is_voting_open && hasVoted) {
      return 'Anda sudah memberikan suara pada putaran ini. Menunggu panelis lainnya.';
    }
    if (statusData.can_chair_open) {
      return 'Voting belum dibuka. Ketua Panel dapat membuka sesi voting.';
    }
    return 'Menunggu persiapan voting.';
  };

  const votesCast = statusData.votes_cast_in_round;
  const remainingVotes = totalVoters - votesCast;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-navy-800 to-navy-900 text-white rounded-xl p-6 shadow-lg">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold mb-1">Voting Konsensus</h1>
            <p className="text-slate-300 text-sm">{getStatusMessage()}</p>
          </div>
          {getStatusBadge()}
        </div>
        <div className="flex items-center gap-4 mt-4 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Putaran:</span>
            <span className="font-bold text-gold-accent text-lg">#{statusData.current_round}</span>
          </div>
          <span className="text-slate-400">·</span>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Suara Masuk:</span>
            <span className="font-bold text-white">{votesCast}/{totalVoters}</span>
          </div>
          {threshold > 0 && (
            <>
              <span className="text-slate-400">·</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Ambang Mayoritas:</span>
                <span className="font-bold text-white">{threshold} suara</span>
              </div>
            </>
          )}
          {remainingVotes > 0 && (
            <>
              <span className="text-slate-400">·</span>
              <span className="text-amber-300 flex items-center gap-1">
                <Clock className="w-4 h-4" /> {remainingVotes} pemilih belum voting
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Ineligible Notice ── */}
      {!isEligible && statusData.session_status === 'voting' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-amber-800 font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Anda tidak terdaftar sebagai pemilih pada sesi ini.
          </p>
          <p className="text-sm text-amber-700 mt-1">
            Hanya pemilih yang terdaftar saat voting dibuka yang dapat memberikan suara.
          </p>
        </div>
      )}

      {/* ── Chair Actions ── */}
      {isChair && (
        <div className="flex gap-3 flex-wrap">
          {canOpenVoting && (
            <button
              onClick={() => setShowOpenModal(true)}
              className="inline-flex items-center gap-2 px-5 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition shadow-md"
            >
              <Lock className="w-4 h-4" />
              Buka Sesi Voting
            </button>
          )}
          {canApprove && (
            <button
              onClick={() => navigate('/decisions/final')}
              className="inline-flex items-center gap-2 px-5 py-3 bg-gold-accent text-navy-800 font-semibold rounded-lg hover:bg-gold-hover transition shadow-md"
            >
              <CheckCircle className="w-4 h-4" />
              Sahkan Keputusan
            </button>
          )}
          {statusData.session_status === 'tie_revote' && (
            <button
              onClick={() => navigate('/voting/revote')}
              className="inline-flex items-center gap-2 px-5 py-3 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 transition shadow-md"
            >
              <Clock className="w-4 h-4" />
              Kelola Putaran Ulang
            </button>
          )}
        </div>
      )}

      {/* ── Vote Actions ── */}
      {canVote && candidates && (
        <div className="bg-white rounded-xl shadow border border-slate-100 p-6">
          <h2 className="font-bold text-navy-800 mb-4">Pilih Kandidat</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedCandidate(c);
                  setShowVoteModal(true);
                }}
                className="text-left bg-slate-50 border-2 border-slate-200 rounded-xl p-5 hover:border-gold-accent hover:bg-gold-50 transition group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-navy-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-navy-800 font-bold text-lg">{c.name[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-navy-800 group-hover:text-gold-accent transition">{c.name}</p>
                    {c.vision && <p className="text-xs text-slate-500 line-clamp-2 mt-1">{c.vision}</p>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Already Voted ── */}
      {hasVoted && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 font-medium flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Anda sudah memberikan suara pada putaran ini.</p>
          <p className="text-sm text-green-700 mt-1">Menunggu panelis lainnya menyelesaikan voting.</p>
        </div>
      )}

      {/* ── Quick Links ── */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => navigate('/voting/results')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-navy-800 font-medium rounded-lg hover:bg-slate-50 transition text-sm"
        >
          <BarChart3 className="w-4 h-4" />
          Lihat Hasil Voting
        </button>
        <button
          onClick={() => navigate('/decisions/history')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-navy-800 font-medium rounded-lg hover:bg-slate-50 transition text-sm"
        >
          <FileText className="w-4 h-4" />
          Riwayat Keputusan
        </button>
        {statusData.ratified_decision && (
          <button
            onClick={() => navigate('/decisions/final')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition text-sm"
          >
            <CheckCircle className="w-4 h-4" />
            Lihat Keputusan Final
          </button>
        )}
      </div>

      {/* ── Open Voting Modal ── */}
      {showOpenModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => {
            if (!openVotingMut.isPending) setShowOpenModal(false);
          }}
        >
          <div
            ref={openModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="open-voting-title"
            aria-busy={openVotingMut.isPending}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 focus:outline-none"
          >
            <h3 id="open-voting-title" className="text-xl font-bold text-navy-800 mb-2">Buka Sesi Voting?</h3>
            <p className="text-slate-600 mb-4">
              Pastikan seluruh persiapan telah selesai sebelum membuka proses voting. Semua panelis akan dapat memberikan suara mereka.
            </p>
            {openVotingErrorMessage && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3" role="alert">
                <p className="flex items-start gap-2 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  <span>{openVotingErrorMessage}</span>
                </p>
                <p className="mt-1 pl-6 text-xs text-red-600">
                  Periksa kembali prasyaratnya, lalu tekan tombol di bawah untuk mencoba lagi.
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowOpenModal(false)}
                disabled={openVotingMut.isPending}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-lg hover:bg-slate-300 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleOpenVoting}
                disabled={openVotingMut.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {openVotingMut.isPending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Membuka...
                  </>
                ) : (
                  'Ya, Buka Voting'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vote Confirmation Modal ── */}
      {showVoteModal && selectedCandidate && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => {
            if (voteMut.isPending) return;
            setShowVoteModal(false);
            setSelectedCandidate(null);
          }}
        >
          <div
            ref={voteModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="vote-confirm-title"
            aria-busy={voteMut.isPending}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 focus:outline-none"
          >
            <h3 id="vote-confirm-title" className="text-xl font-bold text-navy-800 mb-2">Konfirmasi Pilihan Anda</h3>
            <div className="bg-slate-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-slate-600 mb-2">Kandidat yang Anda pilih:</p>
              <p className="font-bold text-navy-800 text-lg">{selectedCandidate.name}</p>
              {selectedCandidate.vision && (
                <p className="text-sm text-slate-600 mt-2">{selectedCandidate.vision}</p>
              )}
            </div>
            <p className="text-slate-600 text-sm mb-4">
              Apakah Anda yakin memilih kandidat ini? Pastikan pilihan sudah benar sebelum mengirimkan suara. Suara tidak dapat diubah setelah dikirim.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowVoteModal(false);
                  setSelectedCandidate(null);
                }}
                disabled={voteMut.isPending}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-lg hover:bg-slate-300 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleVote}
                disabled={voteMut.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-gold-accent text-navy-800 font-semibold rounded-lg hover:bg-gold-hover transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {voteMut.isPending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Mengirim...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" aria-hidden="true" />
                    Kirim Suara
                  </>
                )}
              </button>
            </div>
            {voteMut.error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3" role="alert">
                <p className="text-sm text-red-700">
                  {describeApiError(voteMut.error, 'Gagal mengirim suara.')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
