import React, { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/services/api';
import { AssessmentStatusResponse, VotingStatusResponse, BordaResponse } from '@/types';
import { CheckCircle2, Clock, Check, RefreshCw } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [assessmentStatus, setAssessmentStatus] = useState<AssessmentStatusResponse | null>(null);
  const [votingStatus, setVotingStatus] = useState<VotingStatusResponse | null>(null);
  const [bordaResults, setBordaResults] = useState<BordaResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const isVoter = user?.role === 'voter';

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setIsLoading(true);
        setError('');

        // Only load assessment status and borda for chair/member
        if (!isVoter) {
          try {
            const assRes = await api.getAssessmentStatus();
            if (assRes.success) {
              setAssessmentStatus(assRes.data);
            }
          } catch {
            // Assessment status may not be ready yet
          }

          try {
            const bordRes = await api.getBordaResults();
            if (bordRes.success) {
              setBordaResults(bordRes.data);
            }
          } catch {
            // Borda not ready yet
          }
        }

        // Load voting status for all roles
        try {
          const votRes = await api.getVotingStatus();
          if (votRes.success) {
            setVotingStatus(votRes.data);
          }
        } catch {
          // Voting may not be started yet
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat dashboard');
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboard();
  }, [isVoter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-navy-800 border-t-gold-accent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Memuat dashboard...</p>
        </div>
      </div>
    );
  }

  const getRoleDesc = (role?: string) => {
    switch (role) {
      case 'chair':
        return 'Anda berperan sebagai Ketua Panel';
      case 'member':
        return 'Anda berperan sebagai Anggota Panel';
      case 'voter':
        return 'Anda terdaftar sebagai Pemilih Publik';
      default:
        return 'Pengguna Terdaftar';
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="bg-gradient-to-r from-navy-800 to-navy-900 text-white rounded-xl p-6 shadow-lg">
        <h1 className="text-3xl font-bold mb-2">Selamat Datang, {user?.name}</h1>
        <p className="text-slate-300">{getRoleDesc(user?.role)}</p>
      </div>

      {error && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800 text-sm">{error}</p>
        </div>
      )}

      {/* Voter-specific view or general status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Assessment Status - only for chair/member */}
        {!isVoter && assessmentStatus && (
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
            <h3 className="text-sm font-semibold text-slate-600 mb-2">Status Penilaian</h3>
            <p className="text-2xl font-bold text-navy-800">
              {assessmentStatus.panel.filter((p) => p.is_finalized).length}/{assessmentStatus.total_panelists}
            </p>
            <p className="text-xs text-slate-500 mt-1">Selesai</p>
            <div className="mt-4 bg-slate-100 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(assessmentStatus.panel.filter((p) => p.is_finalized).length / assessmentStatus.total_panelists) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Voting Status */}
        {votingStatus && (
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
            <h3 className="text-sm font-semibold text-slate-600 mb-2">Status Voting</h3>
            <p className="text-2xl font-bold text-navy-800 capitalize">
              {votingStatus.session_status === 'assessment' ? 'Belum Dimulai' : votingStatus.session_status}
            </p>
            <p className="text-xs text-slate-500 mt-1">Putaran {votingStatus.current_round}</p>
          </div>
        )}

        {/* Session Status */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-gold-accent">
          <h3 className="text-sm font-semibold text-slate-600 mb-2">Kondisi Sesi</h3>
          <p className="text-2xl font-bold text-navy-800 flex items-center gap-2">
            {votingStatus?.ratified_decision ? (
              <>
                <CheckCircle2 className="w-6 h-6 text-green-600" />
                <span>Selesai</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5 text-blue-600" />
                <span>Berlangsung</span>
              </>
            )}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {votingStatus?.ratified_decision ? 'Keputusan sudah disahkan' : 'Keputusan belum disahkan'}
          </p>
        </div>
      </div>

      {/* Assessment Panel Table - only for chair/member */}
      {!isVoter && assessmentStatus && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-navy-800">Daftar Panel Penilaian</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 text-left font-semibold text-slate-600">Nama</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-600">Jabatan</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-600">Waktu Finalisasi</th>
                </tr>
              </thead>
              <tbody>
                {assessmentStatus.panel.map((p) => (
                  <tr key={p.user_id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="px-6 py-3">{p.name}</td>
                    <td className="px-6 py-3 text-slate-600">
                      {p.role === 'chair' ? 'Ketua Panel' : 'Anggota Panel'}
                    </td>
                    <td className="px-6 py-3">
                      {p.is_finalized ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                          <Check className="w-3.5 h-3.5" /> Selesai
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">
                          <Clock className="w-3.5 h-3.5" /> Draft
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {p.finalized_at ? new Date(p.finalized_at).toLocaleString('id-ID') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Borda Preview - only for chair/member */}
      {!isVoter && bordaResults && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-navy-800">Ringkas Hasil Borda</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {bordaResults.rankings.map((r) => (
                <div key={r.candidate_id} className="p-4 bg-slate-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-navy-800 mb-1">{r.rank}</div>
                  <p className="font-semibold text-slate-700">{r.candidate_name}</p>
                  <p className="text-sm text-slate-600 mt-1">
                    {r.borda_points} poin ({r.percentage}%)
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Final Decision Display */}
      {votingStatus?.ratified_decision && (
        <div className="bg-gradient-to-r from-gold-accent to-gold-hover text-navy-800 rounded-lg shadow p-6">
          <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-800" />
            <span>Keputusan Konsensus Akhir</span>
          </h3>
          <p className="mb-2">
            Calon terpilih: <span className="font-bold">{votingStatus.ratified_decision.candidate_name}</span>
          </p>
          <p className="text-sm">
            Disahkan oleh {votingStatus.ratified_decision.approved_by_name} pada{' '}
            {new Date(votingStatus.ratified_decision.approved_at).toLocaleString('id-ID')}
          </p>
        </div>
      )}
    </div>
  );
};
