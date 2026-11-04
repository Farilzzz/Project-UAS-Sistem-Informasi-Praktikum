export type UserRole = 'chair' | 'member' | 'voter';

export interface User {
  id: number;
  username: string;
  name: string;
  role: UserRole;
}

export interface LoginResponseData {
  token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface Candidate {
  id: number;
  name: string;
  vision: string | null;
  mission: string | null;
  profile: string | null;
}

export interface Criterion {
  id: number;
  code: string;
  name: string;
  weight: number;
  type: 'benefit' | 'cost';
  description?: string | null;
}

export interface AssessmentItem {
  candidate_id: number;
  criterion_id: number;
  score: number;
}

export interface MyAssessmentsResponse {
  user_id: number;
  is_finalized: boolean;
  finalized_at: string | null;
  items: AssessmentItem[];
}

export interface PanelistStatus {
  user_id: number;
  username: string;
  name: string;
  role: UserRole;
  is_finalized: boolean;
  finalized_at: string | null;
}

export interface AssessmentStatusResponse {
  all_finalized: boolean;
  total_panelists: number;
  panel: PanelistStatus[];
}

export interface CriterionBreakdown {
  criterion_id: number;
  code: string;
  raw_score: number;
  best_value: number;
  normalized: number;
  weight: number;
  weighted_score: number;
}

export interface SawRankingItem {
  candidate_id: number;
  candidate_name: string;
  final_score: number;
  rank: number;
  breakdown: Record<string, CriterionBreakdown>;
}

export interface SawResponse {
  dm_user_id: number;
  dm_name: string;
  rankings: SawRankingItem[];
}

export interface BordaRankingItem {
  candidate_id: number;
  candidate_name: string;
  borda_points: number;
  borda_value: number;
  percentage: number;
  rank: number;
}

export interface BordaDmBreakdownItem {
  score: number;
  rank_position: number;
  is_tied?: boolean;
  points: number;
}

export interface BordaResponse {
  total_points_distributed: number;
  rankings: BordaRankingItem[];
  dm_breakdown: Record<string, Record<string, BordaDmBreakdownItem>>;
}

export interface CandidateTally {
  candidate_id: number;
  candidate_name: string;
  votes: number;
  percentage: number;
}

export interface VotingWinner {
  candidate_id: number;
  candidate_name: string;
  votes: number;
  percentage: number;
}

export interface VotingEvaluation {
  status: 'waiting' | 'majority' | 'tie_revote';
  is_completed: boolean;
  requires_revote?: boolean;
  total_votes_cast: number;
  required_votes?: number;
  eligible_voters?: number;
  majority_threshold?: number;
  winner: VotingWinner | null;
  tallies: CandidateTally[];
}

export interface RatifiedDecision {
  id: number;
  session_id: number;
  round_id: number;
  candidate_id: number;
  candidate_name: string;
  vision?: string;
  mission?: string;
  total_votes: number;
  percentage: number;
  approved_by: number;
  approved_by_name: string;
  reason: string;
  approved_at: string;
  round_number?: number;
}

export interface VotingStatusResponse {
  session_status: 'assessment' | 'voting' | 'tie_revote' | 'voting_completed' | 'ratified';
  current_round: number;
  is_voting_open: boolean;
  has_voted_this_round: boolean;
  votes_cast_in_round: number;
  eligible_voters: number;
  required_votes: number;
  majority_threshold: number;
  is_eligible: boolean;
  evaluation: VotingEvaluation | null;
  ratified_decision: RatifiedDecision | null;
  can_chair_open: boolean;
  can_chair_approve: boolean;
}

export interface VotingResultsResponse {
  session_status: string;
  round_number: number;
  round_status: 'open' | 'completed' | 'tie_revote';
  results: VotingEvaluation;
}

export interface DecisionHistoryRound {
  id: number;
  round_number: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
  opened_by_name: string;
  evaluation: VotingEvaluation;
}

export interface DecisionHistoryResponse {
  session_id: number;
  rounds: DecisionHistoryRound[];
  final_decision: RatifiedDecision | null;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}
