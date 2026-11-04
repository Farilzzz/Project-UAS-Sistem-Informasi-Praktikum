import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Candidate, Criterion } from '@/types';

export const useMyAssessments = () => {
  return useQuery({
    queryKey: ['assessments', 'me'],
    queryFn: async () => {
      const res = await api.getMyAssessments();
      if (res.success && res.data) return res.data;
      throw new Error(res.message || 'Gagal memuat penilaian');
    },
    staleTime: 1000 * 60 * 1, // 1 minute
  });
};

export const useAssessmentStatus = () => {
  return useQuery({
    queryKey: ['assessments', 'status'],
    queryFn: async () => {
      const res = await api.getAssessmentStatus();
      if (res.success && res.data) return res.data;
      throw new Error(res.message || 'Gagal memuat status penilaian');
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
};

export const useSaveAssessments = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (items: { candidate_id: number; criterion_id: number; score: number }[]) => {
      const res = await api.saveAssessments(items);
      if (res.success && res.data) return res.data;
      throw new Error(res.message || 'Gagal menyimpan penilaian');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments', 'me'] });
    },
  });
};

export const useFinalizeAssessments = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.finalizeAssessments();
      if (res.success && res.data) return res.data;
      throw new Error(res.message || 'Gagal menyelesaikan penilaian');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['assessments', 'status'] });
    },
  });
};

export const useCandidates = () => {
  return useQuery({
    queryKey: ['candidates'],
    queryFn: async () => {
      const res = await api.getCandidates();
      if (res.success && res.data) return res.data as Candidate[];
      throw new Error(res.message || 'Gagal memuat kandidat');
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useCriteria = () => {
  return useQuery({
    queryKey: ['criteria'],
    queryFn: async () => {
      const res = await api.getCriteria();
      if (res.success && res.data) return res.data as Criterion[];
      throw new Error(res.message || 'Gagal memuat kriteria');
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
