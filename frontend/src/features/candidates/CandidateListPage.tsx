import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ClipboardList } from 'lucide-react';

export const CandidateListPage: React.FC = () => {
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['candidates'],
    queryFn: async () => {
      const res = await api.getCandidates();
      if (res.success && res.data) return res.data;
      throw new Error(res.message || 'Gagal memuat kandidat');
    },
    placeholderData: (prev) => prev,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-navy-800 mb-4">Kandidat Calon Presiden</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-5 animate-pulse">
              <div className="w-12 h-12 rounded-full bg-navy-100 mb-3"></div>
              <div className="h-5 w-3/4 bg-navy-100 rounded mb-2"></div>
              <div className="h-4 w-1/2 bg-navy-100 rounded mb-2"></div>
              <div className="h-3 w-full bg-navy-100 rounded mt-2 mb-2"></div>
              <div className="h-3 w-2/3 bg-navy-100 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-navy-800 mb-4">Kandidat Calon Presiden</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700 font-medium">{error instanceof Error ? error.message : 'Gagal memuat'}</p>
          <button onClick={() => refetch()} className="mt-4 px-4 py-2 bg-navy-800 text-white rounded-lg hover:bg-navy-900 transition text-sm font-medium">
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const candidates = data ?? [];

  if (candidates.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-navy-800 mb-4">Kandidat Calon Presiden</h2>
        <div className="text-center py-12">
         <div className="flex justify-center mb-4">
            <ClipboardList className="w-16 h-16 text-slate-400" />
          </div>
          <p className="text-slate-600 font-medium text-lg">Belum ada kandidat yang tersedia</p>
          <p className="text-slate-400 text-sm mt-1">Silakan hubungi administrator sistem.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-navy-800">Kandidat Calon Presiden</h2>
        <span className="text-sm text-slate-500">Total: {candidates.length} kandidat</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {candidates.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/candidates/${c.id}`)}
            className="w-full text-left bg-white rounded-xl shadow-md hover:shadow-lg hover:shadow-md transition-all p-5 group"
          >
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="flex-shrink-0 pt-1">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-navy-100 to-navy-200 flex items-center justify-center">
                  <span className="text-navy-800 font-bold text-2xl">
                    {(c.name[0] || '?').toUpperCase()}
                  </span>
                </div>
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-bold text-navy-800 truncate group-hover:text-gold-accent transition-colors">
                    {c.name}
                  </h3>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-navy-50 text-navy-700 border border-navy-200">
                    #{c.id}
                  </span>
                </div>
                {c.vision && (
                  <p className="mt-1 text-sm text-slate-500 line-clamp-2">{c.vision}</p>
                )}
                {c.mission && (
                  <p className="text-sm text-slate-600 mt-2 line-clamp-2">{c.mission}</p>
                )}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Lihat Detail</span>
              <span className="text-navy-800 group-hover:rotate-90 transition-transform inline-flex items-center gap-1 text-sm font-semibold">
                →
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
