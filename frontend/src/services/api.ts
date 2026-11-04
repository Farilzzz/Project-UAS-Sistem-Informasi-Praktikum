import {
  ApiResponse,
  LoginResponseData,
  User,
  Candidate,
  Criterion,
  MyAssessmentsResponse,
  AssessmentStatusResponse,
  SawResponse,
  BordaResponse,
  VotingStatusResponse,
  VotingResultsResponse,
  RatifiedDecision,
  DecisionHistoryResponse,
} from '@/types';

/** Error HTTP dari backend. `status` memungkinkan UI membedakan prasyarat bisnis (409) dari kegagalan server. */
export class ApiError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Terjemahkan error menjadi pesan aman untuk pengguna.
 * Pesan backend dipakai bila tersedia; selain itu dipakai pesan sesuai kode status.
 */
export function describeApiError(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    if (error.message) return error.message;
    switch (error.status) {
      case 401:
        return 'Sesi Anda telah berakhir. Silakan masuk kembali.';
      case 403:
        return 'Anda tidak memiliki hak akses untuk tindakan ini.';
      case 409:
        return 'Tindakan ini belum dapat dilakukan karena prasyaratnya belum terpenuhi.';
      case 422:
        return 'Data yang dikirim tidak valid. Periksa kembali isian Anda.';
      case 500:
        return 'Terjadi kesalahan pada server. Silakan coba lagi.';
      default:
        return fallback;
    }
  }
  if (error instanceof TypeError) {
    return 'Tidak dapat terhubung ke server. Periksa koneksi jaringan Anda lalu coba lagi.';
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private onUnauthorizedCallback: (() => void) | null = null;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || '/api';
    // Initialize token from sessionStorage (stateless tab session)
    this.token = sessionStorage.getItem('gdss_token');
  }

  public setUnauthorizedHandler(callback: () => void) {
    this.onUnauthorizedCallback = callback;
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      sessionStorage.setItem('gdss_token', token);
    } else {
      sessionStorage.removeItem('gdss_token');
    }
  }

  public getToken(): string | null {
    if (!this.token) {
      this.token = sessionStorage.getItem('gdss_token');
    }
    return this.token;
  }

  public clearSession() {
    this.token = null;
    sessionStorage.removeItem('gdss_token');
    sessionStorage.removeItem('gdss_user');
  }

  public getStoredUser(): User | null {
    const raw = sessionStorage.getItem('gdss_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public setStoredUser(user: User | null) {
    if (user) {
      sessionStorage.setItem('gdss_user', JSON.stringify(user));
    } else {
      sessionStorage.removeItem('gdss_user');
    }
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config: RequestInit = {
      method,
      headers,
    };

    if (body !== undefined && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, config);
    } catch {
      throw new Error('Tidak dapat terhubung ke server backend. Pastikan server PHP aktif.');
    }

    let jsonResult: ApiResponse<T>;
    try {
      jsonResult = await response.json();
    } catch {
      throw new Error(`Respons server tidak valid (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      if (response.status === 401) {
        this.clearSession();
        if (this.onUnauthorizedCallback) {
          this.onUnauthorizedCallback();
        }
      }
      const errorMsg = jsonResult.message || `Terjadi kesalahan (Kode status: ${response.status})`;
      throw new ApiError(response.status, errorMsg);
    }

    return jsonResult;
  }

  // --- Auth APIs ---
  async login(username: string, password: string): Promise<ApiResponse<LoginResponseData>> {
    const res = await this.request<LoginResponseData>('POST', '/login', { username, password });
    if (res.success && res.data.token) {
      this.setToken(res.data.token);
      this.setStoredUser(res.data.user);
    }
    return res;
  }

  async getMe(): Promise<ApiResponse<User>> {
    return this.request<User>('GET', '/auth/me');
  }

  async logout(): Promise<ApiResponse<null>> {
    try {
      return await this.request<null>('POST', '/logout');
    } finally {
      this.clearSession();
    }
  }

  async register(name: string, username: string, password: string): Promise<ApiResponse<{ id: number; username: string; name: string; role: string; message: string }>> {
    return this.request<{ id: number; username: string; name: string; role: string; message: string }>('POST', '/register', { name, username, password });
  }

  // --- Master Data APIs ---
  async getCandidates(): Promise<ApiResponse<Candidate[]>> {
    return this.request<Candidate[]>('GET', '/candidates');
  }

  async getCandidate(id: number): Promise<ApiResponse<Candidate>> {
    return this.request<Candidate>('GET', `/candidates/${id}`);
  }

  async getCriteria(): Promise<ApiResponse<Criterion[]>> {
    return this.request<Criterion[]>('GET', '/criteria');
  }

  // --- Assessment APIs ---
  async getMyAssessments(): Promise<ApiResponse<MyAssessmentsResponse>> {
    return this.request<MyAssessmentsResponse>('GET', '/assessments/me');
  }

  async saveAssessments(items: { candidate_id: number; criterion_id: number; score: number }[]): Promise<ApiResponse<{ saved_items: number }>> {
    return this.request<{ saved_items: number }>('PUT', '/assessments/me', { items });
  }

  async finalizeAssessments(): Promise<ApiResponse<{ is_finalized: boolean; finalized_at: string }>> {
    return this.request<{ is_finalized: boolean; finalized_at: string }>('POST', '/assessments/me/finalize');
  }

  async getAssessmentStatus(): Promise<ApiResponse<AssessmentStatusResponse>> {
    return this.request<AssessmentStatusResponse>('GET', '/assessments/status');
  }

  // --- Results APIs ---
  async getSawResults(): Promise<ApiResponse<SawResponse>> {
    return this.request<SawResponse>('GET', '/results/saw/me');
  }

  async getBordaResults(): Promise<ApiResponse<BordaResponse>> {
    return this.request<BordaResponse>('GET', '/results/borda');
  }

  // --- Voting APIs ---
  async getVotingStatus(): Promise<ApiResponse<VotingStatusResponse>> {
    return this.request<VotingStatusResponse>('GET', '/voting/status');
  }

  async openVoting(): Promise<ApiResponse<{ round_number: number; status: string; message: string }>> {
    return this.request<{ round_number: number; status: string; message: string }>('POST', '/voting/open');
  }

  async vote(candidateId: number): Promise<ApiResponse<{ round_number: number; has_voted: boolean; votes_cast_in_round: number; round_completed: boolean }>> {
    return this.request<{ round_number: number; has_voted: boolean; votes_cast_in_round: number; round_completed: boolean }>('POST', '/voting/vote', { candidate_id: candidateId });
  }

  async getVotingResults(): Promise<ApiResponse<VotingResultsResponse>> {
    return this.request<VotingResultsResponse>('GET', '/voting/results');
  }

  async nextRoundVoting(): Promise<ApiResponse<{ round_number: number; status: string; message: string }>> {
    return this.request<{ round_number: number; status: string; message: string }>('POST', '/voting/next-round');
  }

  // --- Decision Approval APIs ---
  async approveDecision(reason: string): Promise<ApiResponse<RatifiedDecision>> {
    return this.request<RatifiedDecision>('POST', '/decisions/approve', { reason });
  }

  async getFinalDecision(): Promise<ApiResponse<RatifiedDecision>> {
    return this.request<RatifiedDecision>('GET', '/decisions/final');
  }

  async getDecisionsHistory(): Promise<ApiResponse<DecisionHistoryResponse>> {
    return this.request<DecisionHistoryResponse>('GET', '/decisions/history');
  }
}

export const api = new ApiClient();
