import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, describeApiError } from '@/services/api';
import { Candidate } from '@/types';
import { useAuth } from '@/features/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import {
  PlusCircle,
  Pencil,
  Trash2,
  CheckCircle,
  Lock,
  UserCheck,
  AlertTriangle,
  FileText,
  Sparkles,
} from 'lucide-react';

interface CandidateFormState {
  id?: number;
  name: string;
  description: string;
  vision: string;
  mission: string;
  work_program: string;
  profile: string;
}

const emptyCandidateForm: CandidateFormState = {
  name: '',
  description: '',
  vision: '',
  mission: '',
  work_program: '',
  profile: '',
};

export const CandidateListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isChair = user?.role === 'chair';

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CandidateFormState>(emptyCandidateForm);
  const [confirmFinalize, setConfirmFinalize] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['candidates'],
    queryFn: async () => {
      const res = await api.getCandidates();
      if (res.success && res.data) return res.data;
      throw new Error(res.message || 'Gagal memuat kandidat');
    },
    placeholderData: (prev) => prev,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['candidates'] });
  };

  const createMutation = useMutation({
    mutationFn: async (payload: CandidateFormState) => {
      const res = await api.createCandidate({
        name: payload.name,
        description: payload.description || undefined,
        vision: payload.vision || undefined,
        mission: payload.mission || undefined,
        work_program: payload.work_program || undefined,
        profile: payload.profile || undefined,
      });
      if (!res.success) throw new Error(res.message);
      return res;
    },
    onSuccess: (res) => {
      toast.success(res.message || 'Kandidat berhasil diajukan');
      setFormOpen(false);
      setForm(emptyCandidateForm);
      invalidate();
    },
    onError: (err) => {
      toast.error(describeApiError(err, 'Gagal mengajukan kandidat'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: CandidateFormState) => {
      if (!payload.id) throw new Error('ID kandidat tidak valid');
      const res = await api.updateCandidate(payload.id, {
        name: payload.name,
        description: payload.description || undefined,
        vision: payload.vision || undefined,
        mission: payload.mission || undefined,
        work_program: payload.work_program || undefined,
        profile: payload.profile || undefined,
      });
      if (!res.success) throw new Error(res.message);
      return res;
    },
    onSuccess: (res) => {
      toast.success(res.message || 'Kandidat berhasil diperbarui');
      setFormOpen(false);
      setForm(emptyCandidateForm);
      invalidate();
    },
    onError: (err) => {
      toast.error(describeApiError(err, 'Gagal memperbarui kandidat'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.deleteCandidate(id);
      if (!res.success) throw new Error(res.message);
      return res;
    },
    onSuccess: (res) => {
      toast.success(res.message || 'Kandidat berhasil dihapus');
      invalidate();
    },
    onError: (err) => {
      toast.error(describeApiError(err, 'Gagal menghapus kandidat'));
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.verifyCandidate(id);
      if (!res.success) throw new Error(res.message);
      return res;
    },
    onSuccess: (res) => {
      toast.success(res.message || 'Kandidat berhasil diverifikasi');
      invalidate();
    },
    onError: (err) => {
      toast.error(describeApiError(err, 'Gagal memverifikasi kandidat'));
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await api.finalizeCandidates();
      if (!res.success) throw new Error(res.message);
      return res;
    },
    onSuccess: (res) => {
      toast.success(res.message || 'Semua kandidat berhasil difinalisasi');
      setConfirmFinalize(false);
      invalidate();
    },
    onError: (err) => {
      toast.error(describeApiError(err, 'Gagal memfinalisasi kandidat'));
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-navy-800 mb-4">Kandidat Calon Presiden</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-5 animate-pulse">
              <div className="w-12 h-12 rounded-full bg-navy-100 mb-3" />
              <div className="h-5 w-3/4 bg-navy-100 rounded mb-2" />
              <div className="h-4 w-1/2 bg-navy-100 rounded mb-4" />
              <div className="h-3 w-full bg-navy-100 rounded mb-2" />
              <div className="h-3 w-5/6 bg-navy-100 rounded" />
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
          <div className="flex justify-center mb-3">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
          <p className="text-red-700 font-medium">
            {error instanceof Error ? error.message : 'Gagal memuat kandidat'}
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

  const candidates = (data ?? []) as Candidate[];
  const allFinalized = candidates.length > 0 && candidates.every((c) => Boolean(c.is_finalized));
  const canManage = isChair && !allFinalized;

  const openCreate = () => {
    setForm(emptyCandidateForm);
    setFormOpen(true);
  };

  const openEdit = (c: Candidate) => {
    setForm({
      id: c.id,
      name: c.name,
      description: c.description || '',
      vision: c.vision || '',
      mission: c.mission || '',
      work_program: c.work_program || '',
      profile: c.profile || '',
    });
    setFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.id) {
      updateMutation.mutate(form);
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-navy-800">Kandidat Calon Presiden</h2>
            {allFinalized ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                <Lock className="w-3.5 h-3.5" /> Terfinalisasi
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                <Sparkles className="w-3.5 h-3.5" /> Tahap Pencalonan
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {isChair
              ? allFinalized
                ? 'Daftar kandidat telah diverifikasi & dikunci untuk proses penilaian.'
                : 'Ketua Panel: ajukan nama kandidat, visi, misi, program kerja, verifikasi, lalu finalisasi.'
              : 'Daftar kandidat resmi yang dinilai dalam simulasi pemilihan.'}
          </p>
        </div>

        {/* Chair actions */}
        {canManage && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-navy-800 text-white rounded-lg hover:bg-navy-900 transition text-sm font-medium shadow-sm"
            >
              <PlusCircle className="w-4 h-4" /> Ajukan Kandidat
            </button>
            <button
              type="button"
              disabled={candidates.length === 0 || finalizeMutation.isPending}
              onClick={() => setConfirmFinalize(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition text-sm font-medium shadow-sm disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" /> Finalisasi Semua Kandidat
            </button>
          </div>
        )}
      </div>

      {/* Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {candidates.map((c) => {
          const isVerified = Boolean(c.is_finalized);
          return (
            <div
              key={c.id}
              className="bg-white rounded-xl shadow border border-slate-100 flex flex-col justify-between overflow-hidden hover:shadow-md transition"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-navy-100 text-navy-800 font-bold flex items-center justify-center text-lg flex-shrink-0">
                    #{c.id}
                  </div>
                  <div>
                    {isVerified ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        <CheckCircle className="w-3 h-3" /> Terverifikasi
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                        Draft
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="font-bold text-navy-800 text-base mb-1">{c.name}</h3>

                {c.description && (
                  <p className="text-xs text-slate-600 line-clamp-2 mb-3">{c.description}</p>
                )}

                {c.vision && (
                  <div className="bg-slate-50 rounded-lg p-2.5 mb-2">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">
                      Visi
                    </span>
                    <p className="text-xs text-slate-700 line-clamp-2 italic">"{c.vision}"</p>
                  </div>
                )}

                {c.work_program && (
                  <div className="text-xs text-slate-600 line-clamp-2 mb-2">
                    <span className="font-semibold text-slate-700">Program:</span> {c.work_program}
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => navigate(`/candidates/${c.id}`)}
                  className="text-navy-700 hover:text-navy-900 font-medium inline-flex items-center gap-1"
                >
                  <FileText className="w-3.5 h-3.5" /> Lihat Detail
                </button>

                {canManage && (
                  <div className="flex items-center gap-1">
                    {!isVerified && (
                      <button
                        type="button"
                        onClick={() => verifyMutation.mutate(c.id)}
                        className="p-1.5 rounded hover:bg-green-100 text-green-700 transition"
                        title="Verifikasi kandidat ini"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="p-1.5 rounded hover:bg-slate-200 text-navy-700 transition"
                      title="Ubah kandidat"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Hapus kandidat "${c.name}"?`)) {
                          deleteMutation.mutate(c.id);
                        }
                      }}
                      className="p-1.5 rounded hover:bg-red-100 text-red-600 transition"
                      title="Hapus kandidat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {candidates.length === 0 && (
        <div className="bg-white rounded-xl shadow p-8 text-center text-slate-500">
          Belum ada kandidat diajukan untuk sesi ini.{' '}
          {canManage && 'Klik "Ajukan Kandidat" untuk mendaftarkan kandidat baru.'}
        </div>
      )}

      {/* Modal Form Kandidat */}
      {formOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 my-8">
            <h3 className="text-lg font-bold text-navy-800 mb-4">
              {form.id ? 'Ubah Kandidat' : 'Pencalonan Kandidat Baru'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nama calon presiden"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi Singkat</label>
                <input
                  type="text"
                  maxLength={500}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Ringkasan figur / latar belakang"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Visi</label>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={form.vision}
                  onChange={(e) => setForm({ ...form, vision: e.target.value })}
                  placeholder="Visi kepemimpinan..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Misi</label>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={form.mission}
                  onChange={(e) => setForm({ ...form, mission: e.target.value })}
                  placeholder="Misi kerja strategis..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Program Kerja</label>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={form.work_program}
                  onChange={(e) => setForm({ ...form, work_program: e.target.value })}
                  placeholder="Program prioritas utama..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Profil / Biografi</label>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={form.profile}
                  onChange={(e) => setForm({ ...form, profile: e.target.value })}
                  placeholder="Profil pengalaman, rekam jejak..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 bg-navy-800 text-white rounded-lg text-sm font-medium hover:bg-navy-900 transition disabled:opacity-50"
                >
                  {form.id ? 'Simpan Perubahan' : 'Ajukan Kandidat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Finalisasi Semua Kandidat */}
      {confirmFinalize && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-navy-800 mb-2">Konfirmasi Finalisasi Kandidat</h3>
            <p className="text-sm text-slate-600 mb-4">
              Setelah difinalisasi, seluruh ({candidates.length}) kandidat akan <strong>dikunci permanen</strong> dan
              masuk ke lembar penilaian resmi para panelis. Data tidak dapat ditambah atau diubah setelah tahap ini.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmFinalize(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={finalizeMutation.isPending}
                onClick={() => finalizeMutation.mutate()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
              >
                {finalizeMutation.isPending ? 'Memproses...' : 'Ya, Finalisasi Kandidat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
