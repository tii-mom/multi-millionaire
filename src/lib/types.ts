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

export type ApiErrorCode = string;

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

export interface Squad {
  id: number;
  wave_id: number;
  name: string;
  captain_user_id: string;
  status: 'open' | 'frozen' | 'archived';
  invite_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface SquadMember {
  id: number;
  wave_id: number;
  squad_id: number;
  user_id: string;
  role: 'captain' | 'member';
  status: 'joined_pending' | 'activated' | 'removed';
  joined_at: string;
  activated_at: string | null;
}

export interface CreateSquadResult {
  squad: Squad;
  member: SquadMember;
}

export interface Referral {
  id: string;
  invitee_user_id: string;
  inviter_user_id: string | null;
  status: 'pending' | 'locked' | string;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
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

export interface AdminWave extends Wave {
  unlock_multiplier_bps: number;
  price_freshness_ttl_seconds: number;
  reward_budget: string;
  inviter_wave_cap: string;
  claim_min_amount: string;
  counted_member_cap: number | null;
  settle_delay_seconds: number;
  deposits_disabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminDashboard {
  current_wave: AdminWave | null;
  total_users: number;
  total_positions: number;
  total_rewards_pending: string;
  total_rewards_claimed: string;
  open_risk_flags: number;
}

export interface AdminRiskFlag {
  id: string;
  entity_type: string;
  entity_id: string;
  flag_type: string;
  severity: string;
  status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminReward {
  id: string;
  beneficiary_user_id: string;
  beneficiary_email: string | null;
  source_user_id: string;
  source_email: string | null;
  source_position_id: string;
  wave_id: number;
  reward_type: string;
  gross_amount: string;
  final_amount: string;
  status: RewardLedger["status"];
  created_at: string;
  updated_at: string;
}

export interface AdminSquad {
  id: number;
  wave_id: number;
  name: string;
  captain_user_id: string;
  captain_email: string | null;
  status: string;
  invite_code: string | null;
  member_count: number;
  activated_member_count: number;
  total_locked: string;
  created_at: string;
  updated_at: string;
}
