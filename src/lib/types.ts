export interface ApiEnvelope<T> {
  request_id: string;
  data: T;
}

export interface ApiErrorEnvelope {
  request_id: string;
  error: {
    code: string;
    message: string;
  };
}

export interface User {
  id: string;
  email: string;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface Wave {
  wave_id: number;
  code: string;
  name: string;
  status: string;
  start_time: string;
  end_time: string;
  min_lock_amount: string;
  direct_reward_rate_bps: number;
  per_invite_cap: string;
}

export interface BootstrapData {
  server_time: string;
  contracts: Record<string, string>;
  current_wave: Wave | null;
  latest_price: unknown;
  me: User | null;
  feature_flags: Record<string, boolean>;
}

export interface Position {
  id: string;
  user_id: string;
  wave_id: number;
  amount_raw: string;
  onchain_position_id: string;
  qualifies_for_activation: boolean;
  is_first_qualifying_for_user: boolean;
}

export interface SquadLeaderboardRow {
  id: number;
  name: string;
  captain_user_id: string;
  activated_member_count: number;
  total_locked: string;
  rank: number;
}

export interface RewardSummary {
  pending_amount: string;
  approved_amount: string;
  claimed_amount: string;
}

export interface RewardLedger {
  id: string;
  beneficiary_user_id: string;
  source_user_id: string;
  source_position_id: string;
  wave_id: number;
  reward_type: string;
  gross_amount: string;
  final_amount: string;
  status: 'pending' | 'approved' | 'claimed' | 'rejected';
  created_at: string;
  updated_at: string;
}
