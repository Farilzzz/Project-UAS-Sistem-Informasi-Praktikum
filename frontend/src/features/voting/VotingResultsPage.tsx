import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Cell,
} from 'recharts';
import { api } from '@/services/api';
import { Trophy, AlertTriangle, Clock, CheckCircle } from 'lucide-react';

const VOTE_COLORS = ['#F59E0B', '#6B7280', '#92400E'];

export const VotingResultsPage: React.FC = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['voting', 'results'],
    queryFn: async () => {
      const res = await api.getVotingResults();
      if (res.success && res.data) return res.data;
      throw new Error(res.message || 'Gagal memuat hasil voting');
    },
    refetchInterval: 5000,
  });

  /* ─── Loading ─── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-navy-800 border-t-gold-accent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Memuat hasil voting...</p>
        </div>
      </div>
    );
  }

  /* ─── Error ─── */
  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-navy-800">Hasil Voting</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700 font-medium mb-4">
            {error instanceof Error ? error.message : 'Gagal memuat'}
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-navy-800 text-white rounded-lg text-sm font-medium hover:bg-navy-900 transition"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  if (!data || !data.results) return null;

  const results = data.results;
  const tallies = results.tallies ?? [];
  const totalVotes = results.total_votes_cast ?? 0;
  const requiredVotes = results.eligible_voters ?? results.required_votes ?? 0;
  const participation = requiredVotes > 0 ? (totalVotes / requiredVotes) * 100 : 0;
  const winner = results.winner;
  const isCompleted = results.is_completed;
  const status = results.status;

  /* ─── Chart data ─── */
  const chartData = tallies.map((t, idx) => ({
    name: t.candidate_name,
    suara: t.votes,
    percentage: t.percentage,
    rank: idx + 1,
  }));

  /* ─── Status badge ─── */
  const getStatusBadge = () => {
    if (status === 'majority' && isCompleted) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
          <CheckCircle className="w-4 h-4 text-green-700" /> Mayoritas
        </span>
      );
    }
    if (status === 'tie_revote') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-semibold">
          <AlertTriangle className="w-4 h-4 text-amber-700" /> Seri
        </span>
      );
    }
    if (status === 'waiting') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
          <Clock className="w-4 h-4 text-blue-700" /> Menunggu
        </span>
      );
    }
    return <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-semibold">{status}</span>;
  };

  const getStatusMessage = () => {
    if (status === 'majority' && winner) {
      return `${winner.candidate_name} memperoleh mayoritas suara (${winner.percentage.toFixed(2)}%).`;
    }
    if (status === 'tie_revote') {
      return 'Hasil voting seri. Setiap kandidat memperoleh 1 suara. Putaran ulang diperlukan.';
    }
    if (status === 'waiting') {
      return `Menunggu ${requiredVotes - totalVotes} panelis lagi untuk menyelesaikan voting.`;
    }
    return 'Hasil voting sedang dihitung.';
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-navy-800">Hasil Voting</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Putaran #{data.round_number} · {getStatusMessage()}
        </p>
        <div className="flex items-center gap-3 mt-3">
          {getStatusBadge()}
          <span className="text-sm text-slate-600">
            {totalVotes}/{requiredVotes} suara terkumpul
          </span>
        </div>
      </div>

      {/* ── Winner Card (if majority) ── */}
      {winner && status === 'majority' && (
        <div className="bg-gradient-to-r from-gold-accent to-amber-500 text-navy-800 rounded-xl p-6 shadow-lg border-2 border-gold-accent">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide mb-1">Pemenang Mayoritas</p>
              <h2 className="text-3xl font-bold">{winner.candidate_name}</h2>
              <p className="text-lg font-semibold mt-2">{winner.votes} suara ({winner.percentage.toFixed(2)}%)</p>
            </div>
            <Trophy className="w-12 h-12 text-navy-800" />
          </div>
        </div>
      )}

      {/* ── Voting Summary ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow border border-slate-100 p-4">
          <p className="text-sm text-slate-600 mb-1">Total Suara</p>
          <p className="text-3xl font-bold text-navy-800">{totalVotes}</p>
          <p className="text-xs text-slate-400 mt-1">Dari {requiredVotes} panelis</p>
        </div>
        <div className="bg-white rounded-lg shadow border border-slate-100 p-4">
          <p className="text-sm text-slate-600 mb-1">Status Putaran</p>
          <p className="text-lg font-bold text-navy-800 capitalize">{data.round_status}</p>
          <p className="text-xs text-slate-400 mt-1">Putaran #{data.round_number}</p>
        </div>
        <div className="bg-white rounded-lg shadow border border-slate-100 p-4">
          <p className="text-sm text-slate-600 mb-1">Partisipasi</p>
          <p className="text-3xl font-bold text-navy-800">{participation.toFixed(0)}%</p>
          <p className="text-xs text-slate-400 mt-1">{requiredVotes - totalVotes} belum voting</p>
        </div>
      </div>

      {/* ── Results Table ── */}
      <div className="bg-white rounded-xl shadow border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-navy-800">Perolehan Suara per Kandidat</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[28rem]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-5 py-3 font-semibold text-slate-600">Posisi</th>
                <th className="px-5 py-3 font-semibold text-slate-600">Kandidat</th>
                <th className="px-5 py-3 font-semibold text-slate-600 text-right">Suara</th>
                <th className="px-5 py-3 font-semibold text-slate-600 text-right">Persentase</th>
              </tr>
            </thead>
            <tbody>
              {tallies.map((t, idx) => (
                <tr
                  key={t.candidate_id}
                  className={`border-b border-slate-100 ${
                    winner && t.candidate_id === winner.candidate_id ? 'bg-amber-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="px-5 py-3 font-bold text-navy-800">#{idx + 1}</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{t.candidate_name}</td>
                  <td className="px-5 py-3 text-right font-bold text-navy-800">{t.votes}</td>
                  <td className="px-5 py-3 text-right font-mono text-slate-700">{t.percentage.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="bg-white rounded-xl shadow border border-slate-100 p-6">
        <h2 className="font-bold text-navy-800 mb-4">Visualisasi Perolehan Suara</h2>
        <div className="w-full" style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 48, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis
                type="number"
                domain={[0, requiredVotes]}
                tick={{ fontSize: 11, fill: '#6B7280' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 12, fill: '#1A2332', fontWeight: 600 }}
                width={100}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value: number) => [`${value} suara`, 'Perolehan']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
              <Bar dataKey="suara" radius={[0, 4, 4, 0]} maxBarSize={36}>
                {chartData.map((entry, idx) => (
                  <Cell key={entry.name} fill={VOTE_COLORS[idx % VOTE_COLORS.length]} />
                ))}
                <LabelList
                  dataKey="suara"
                  position="right"
                  formatter={(v: number) => `${v} suara`}
                  style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-slate-400 text-center mt-3">
          Maksimal: {requiredVotes} suara · Data dari API backend
        </p>
      </div>

      {/* ── Tie Warning ── */}
      {status === 'tie_revote' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-amber-900 mb-1">Hasil Seri (1-1-1)</p>
              <p className="text-sm text-amber-800">
                Setiap kandidat memperoleh tepat 1 suara. Ketua Panel perlu membuka putaran voting ulang untuk
                menentukan pemenang.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Waiting Notice ── */}
      {status === 'waiting' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <Clock className="w-6 h-6 text-blue-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-blue-900 mb-1">Voting Belum Selesai</p>
              <p className="text-sm text-blue-800">
                Menunggu {requiredVotes - totalVotes} panelis lagi untuk menyelesaikan voting putaran ini.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
