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
  wallet?: WalletBinding;
}

export interface WalletAuthIntent {
  chain_id: string;
  wallet_address: string | null;
  nonce: string;
  payload: string;
  domain: string;
  expires_at: string;
  intent_token: string;
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
  controls?: Record<string, { enabled: boolean; reason: string | null }>;
  ops?: {
    runtime_path?: 'production-chain' | 'staging-mvp' | 'future-disabled';
    receipt_verifier?: {
      configured: boolean;
      status: string;
      mode: string;
      receipt_verification_enabled: boolean;
    };
    merkle_claim_verifier?: {
      configured: boolean;
      status: string;
      model: string;
    };
  };
}

export type SeasonWarRoundStatus = 'pending' | 'active' | 'success' | 'failed' | 'settling' | 'finalized';
export type SeasonWarRouteTarget = 'SeasonClaim' | 'FundVesting' | 'pending';
export type SeasonWarRiskStatus = 'clear' | 'review' | 'quarantined';
export type SeasonWarProofStatus = 'not_ready' | 'ready' | 'submitted' | 'invalid' | 'disabled';
export type SeasonWarClaimContractVersion = 'SeasonClaim' | 'SeasonClaimV2' | 'none';
export type SeasonWarClaimWindowStatus = 'not_open' | 'open' | 'closed';

export interface SeasonWarProvenance {
  sourceFreshnessSeconds: number | null;
  indexerWatermark: string | null;
  updatedAt: string;
}

export interface SeasonWarCurrent extends SeasonWarProvenance {
  seasonId: string;
  waveId: string;
  roundNumber: number;
  chainRoundId: string | null;
  status: SeasonWarRoundStatus;
  timeLeftSeconds: number;
}

export interface SeasonWarRadarRound {
  waveId: string;
  roundNumber: number;
  chainRoundId: string | null;
  status: SeasonWarRoundStatus;
  inventoryAtomic: string;
  routeTarget: SeasonWarRouteTarget;
  evidenceHash: string | null;
}

export interface SeasonWarRadar extends SeasonWarProvenance {
  seasonId: string;
  rounds: SeasonWarRadarRound[];
}

export interface SeasonWarSquadRow {
  squadId: string;
  name: string;
  rank: number;
  activatedMembers: number;
  contributionAtomic: string;
  riskSignal: SeasonWarRiskStatus;
}

export interface SeasonWarSquads extends SeasonWarProvenance {
  seasonId: string;
  squads: SeasonWarSquadRow[];
}

export interface SeasonWarMe extends SeasonWarProvenance {
  wallet: string;
  verifiedWalletBinding: boolean;
  eligible: boolean;
  eligibilityReason: string;
  qualifyingPositions: Array<{ positionId: string; waveId: string; amountAtomic: string; createdAt: string }>;
  myLockAtomic: string;
  squadId: string | null;
  squadRank: number | null;
  referralContributionAtomic: string;
  rewardEstimateAtomic: string;
  riskStatus: SeasonWarRiskStatus;
  riskReason: string | null;
  nextAction: string;
}

export interface SeasonWarClaimPreview extends SeasonWarProvenance {
  snapshotId: string | null;
  merkleRoot: string | null;
  rootPublishable: boolean;
  proofStatus: SeasonWarProofStatus;
  claimContractVersion: SeasonWarClaimContractVersion;
  claimContractAddress: string | null;
  claimWindowStatus: SeasonWarClaimWindowStatus;
  unlockedBps: number;
  pools: {
    individualAtomic: string;
    squadAtomic: string;
    referralAtomic: string;
    leaderboardAtomic: string;
  };
  pendingAtomic: string;
  claimableAtomic: string;
  claimedAtomic: string;
  disabledReason: string;
}

export interface SeasonWarExportManifest extends SeasonWarProvenance {
  manifestHash: string | null;
  evidenceHash: string | null;
  generatedAt: string | null;
  successfulWaveIds: string[];
  quarantineSummary: Record<string, unknown>;
  rootPublishable: boolean;
}

export type AppControlKey =
  | 'pause_deposits'
  | 'pause_reward_claims'
  | 'pause_referral_rewards'
  | 'pause_deposit_streak_rewards'
  | 'maintenance_banner';

export interface AppControl {
  key: AppControlKey;
  enabled: boolean;
  reason: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface AdminOpsDiagnostics {
  runtime_path?: 'production-chain' | 'staging-mvp' | 'future-disabled';
  merkle_draft_writes_enabled?: boolean;
  season_vault?: string;
  season_claim?: string;
  contract_integration?: {
    readyForReads?: boolean;
    readyForIndexer?: boolean;
    readyForWrites?: boolean;
    issues?: Array<{ severity: string; key: string; message: string }>;
    abiArtifacts?: Array<{ role: string; path: string; resolvedPath: string; exists: boolean }>;
  };
  season_claim_v2?: string;
  current_tokenomics?: Record<string, unknown>;
  v3_tokenomics?: Record<string, unknown>;
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

export interface UserWavePositionTotal {
  user_id: string;
  wave_id: number;
  total_locked_raw: string;
  position_count: number;
}

export type WalletBindingStatus = 'pending' | 'verified' | 'revoked';
export type WalletBindIntentStatus = 'pending' | 'verified' | 'expired' | 'cancelled';

export interface WalletBindIntent {
  id: string;
  user_id: string;
  chain_id: string;
  wallet_address: string;
  normalized_address: string;
  nonce: string;
  message_domain: string;
  signable_message: string;
  status: WalletBindIntentStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface WalletBinding {
  id: string;
  user_id: string;
  chain_id: string;
  wallet_address: string;
  normalized_address: string;
  wallet_type: string | null;
  status: WalletBindingStatus;
  is_primary: boolean;
  verified_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChainEvent {
  id: string;
  chain_id: string;
  contract_address: string;
  contract_role: string;
  event_name: string;
  tx_hash: string;
  log_index: number;
  block_number: string;
  block_time: string;
  finalized: boolean;
  payload: Record<string, unknown>;
  apply_status: string;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DepositReceiptResult {
  position: Position;
  chain_event: ChainEvent;
}

export interface JettonWalletDerivation {
  owner: string;
  token: string;
  jetton_wallet: string;
  jetton_wallet_raw: string;
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
  status: string;
  invite_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface SquadMember {
  id: number;
  wave_id: number;
  squad_id: number;
  user_id: string;
  role: string;
  status: string;
  joined_at: string;
  activated_at: string | null;
}

export interface CreateSquadResult {
  squad: Squad;
  member: SquadMember;
}

export interface SquadMemberSummary {
  id: number;
  user_id: string;
  email: string | null;
  role: string;
  status: string;
  joined_at: string;
  activated_at: string | null;
  total_locked_raw: string;
  rank: number;
}

export interface SquadDetail {
  squad: Squad;
  rank: number | null;
  member_count: number;
  activated_member_count: number;
  total_locked_raw: string;
  members: SquadMemberSummary[];
}

export interface MySquadView extends SquadDetail {
  membership: SquadMember;
}

export interface PersonalLeaderboardRow {
  user_id: string;
  email: string | null;
  total_locked_raw: string;
  qualifying_position_count: number;
  first_qualified_at: string | null;
  rank: number;
}

export interface LeaderboardMe {
  wave_id: number;
  personal: PersonalLeaderboardRow | null;
  squad: MySquadView | null;
}

export type RewardEstimateCategoryKey = 'personal' | 'team' | 'referral' | 'leaderboard';

export interface RewardEstimateCategory {
  category: RewardEstimateCategoryKey;
  bps: number;
  pool_amount_raw: string;
  estimate_amount_raw: string;
  basis: string;
}

export interface RewardEstimate {
  wave_id: number;
  token_decimals: number;
  release_amount_raw: string;
  categories: RewardEstimateCategory[];
  total_estimate_raw: string;
  ledger_totals: {
    pending_amount_raw: string;
    approved_amount_raw: string;
    claimed_amount_raw: string;
  };
  context: {
    user_locked_raw: string;
    wave_locked_raw: string;
    squad_locked_raw: string;
    ranked_squad_count: number;
    squad_rank: number | null;
  };
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
  source_position_id: string | null;
  wave_id: number;
  reward_type: string;
  gross_amount: string;
  final_amount: string;
  status: 'pending' | 'approved' | 'claimed' | 'rejected';
  source_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface DepositStreakGoal {
  id: string;
  user_id: string;
  wave_id: number;
  target_usd9: string;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  started_at: string | null;
  completed_week_at: string | null;
  completed_month_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DepositStreakDay {
  day_index: number;
  start_at: string;
  end_at: string;
  required_usd9: string;
  deposited_usd9: string;
  completed: boolean;
  is_current: boolean;
}

export interface DepositStreakView {
  goal: DepositStreakGoal | null;
  daily_target_usd9: string;
  latest_price_raw: string | null;
  required_today_raw: string | null;
  current_day_index: number | null;
  week_completed: boolean;
  month_completed: boolean;
  current_consecutive_days: number;
  monthly_progress_days: number;
  claimed_week_rewards: number;
  next_week_reward_index: number | null;
  next_week_reward_days_remaining: number | null;
  weekly_reward_cap: number;
  reward_pool_sufficient: boolean;
  blocked_reward_reason: 'pool_exhausted' | 'paused' | null;
  streak_broken: boolean;
  last_missed_day_index: number | null;
  last_missed_day_start_at: string | null;
  last_missed_required_usd9: string | null;
  last_missed_deposited_usd9: string | null;
  days: DepositStreakDay[];
  pool: {
    total_raw: string;
    allocated_raw: string;
    remaining_raw: string;
  };
}

export type MerkleRewardBatchStatus = 'draft' | 'published' | 'active' | 'superseded' | 'settled';
export type MerkleRewardClaimStatus = 'proof_available' | 'claim_pending' | 'claimed' | 'rejected';

export interface MerkleRewardBatch {
  id: string;
  chain_id: string;
  token_address: string;
  merkle_root: string;
  total_amount_raw: string;
  status: MerkleRewardBatchStatus;
  published_tx_hash: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MerkleRewardProof {
  id: string;
  batch_id: string;
  reward_ledger_id: string;
  beneficiary_user_id: string;
  beneficiary_wallet: string;
  amount_raw: string;
  leaf_hash: string;
  proof: string[];
  claim_status: MerkleRewardClaimStatus;
  claim_tx_hash: string | null;
  claim_chain_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MerkleRewardProofWithBatch extends MerkleRewardProof {
  chain_id: string;
  token_address: string;
  merkle_root: string;
  batch_status: MerkleRewardBatchStatus;
  published_tx_hash: string | null;
  batch_metadata?: Record<string, unknown>;
  contract_batch_id?: string;
  ledger_id_hash?: string;
  proof_boc?: string;
}

export interface MerkleClaimReceiptResult {
  proof: MerkleRewardProof;
  reward: RewardLedger;
  chain_event: ChainEvent;
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

export interface AdminPaginatedResult<T> {
  rows: T[];
  page: number;
  page_size: number;
  total: number;
  page_count: number;
  search: string;
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
  source_ref: string | null;
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
  rank: number;
  created_at: string;
  updated_at: string;
}

export interface AdminAuditLog {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
