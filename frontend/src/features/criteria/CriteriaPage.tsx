import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Criterion } from '@/types';
import { AlertTriangle } from 'lucide-react';

export const CriteriaPage: React.FC = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['criteria'],
    queryFn: async () => {
      const res = await api.getCriteria();
      if (res.success && res.data) return res.data;
      throw new Error(res.message || 'Gagal memuat kriteria');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-navy-800 mb-4">Kriteria Penilaian</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-5 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-navy-100 mb-3"></div>
              <div className="h-5 w-3/4 bg-navy-100 rounded mb-2"></div>
              <div className="h-4 w-1/2 bg-navy-100 rounded mb-2"></div>
              <div className="h-3 w-full bg-navy-100 rounded mt-2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-navy-800 mb-4">Kriteria Penilaian</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <div className="flex justify-center mb-3">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
          <p className="text-red-700 font-medium">
            {error instanceof Error ? error.message : 'Gagal memuat'}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-navy-800 text-white rounded-lg hover:bg-navy-900 transition text-sm font-medium"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const criteria = (data ?? []) as Criterion[];
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-800">Kriteria Penilaian</h2>
          <p className="text-sm text-slate-500 mt-1">Hanya-baca. Bobot dari backend.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow border border-slate-200">
          <span className="text-sm font-medium text-slate-600">Total Bobot:</span>
          <span className={`text-sm font-bold ${totalWeight === 100 ? 'text-green-600' : 'text-red-600'}`}>
            {totalWeight}%
          </span>
        </div>
      </div>

      {/* Criteria Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {criteria.map((c) => {
          const isBenefit = c.type === 'benefit';
          const barWidth = `${c.weight}%`;
          return (
            <div key={c.id} className="bg-white rounded-xl shadow p-6 border border-slate-100">
              <div className="flex items-start gap-4 mb-4">
                {/* Code badge */}
                <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-navy-800 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">{c.code}</span>
                </div>
                {/* Name & type */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-navy-800 leading-tight">{c.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        isBenefit
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {isBenefit ? '↑ Benefit' : '↓ Cost'}
                    </span>
                  </div>
                </div>
                {/* Weight number */}
                <div className="flex-shrink-0 text-right">
                  <span className="text-2xl font-extrabold text-navy-800">{c.weight}</span>
                  <span className="text-sm text-slate-500">%</span>
                </div>
              </div>

              {/* Weight bar */}
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isBenefit ? 'bg-green-500' : 'bg-red-400'
                  }`}
                  style={{ width: barWidth }}
                />
              </div>

              {/* Info footer */}
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>ID: {c.id}</span>
                <span>Skala penilaian: 1 – 5</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary table */}
      <div className="bg-white rounded-xl shadow border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-navy-800 text-sm">Ringkasan Bobot Kriteria</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[26rem]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-left">
                <th className="px-5 py-3 font-semibold text-slate-600">Kode</th>
                <th className="px-5 py-3 font-semibold text-slate-600">Kriteria</th>
                <th className="px-5 py-3 font-semibold text-slate-600">Tipe</th>
                <th className="px-5 py-3 font-semibold text-slate-600 text-right">Bobot</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-mono font-semibold text-navy-700">{c.code}</td>
                  <td className="px-5 py-3 text-slate-700">{c.name}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        c.type === 'benefit'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {c.type === 'benefit' ? 'Benefit' : 'Cost'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-navy-800">{c.weight}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td colSpan={3} className="px-5 py-3 font-bold text-slate-700 text-right">Total</td>
                <td className={`px-5 py-3 font-bold text-right ${totalWeight === 100 ? 'text-green-600' : 'text-red-600'}`}>
                  {totalWeight}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
