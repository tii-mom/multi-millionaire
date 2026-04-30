import { query } from '../db';
import { getCurrentWave, getWaveById, Wave } from './waveModel';
import { listSquadsForWave } from './squadModel';
import { getRewardEstimate } from './rewardModel';
import { findVerifiedWalletBinding } from './walletBindingModel';

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

interface ProvenanceRow {
  updated_at: Date | string | null;
  indexer_watermark: string | null;
}

interface WaveRoundRow {
  wave_id: number;
  code: string;
  status: string;
  end_time: Date;
  reward_budget: string;
  updated_at: Date;
}

function iso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function freshnessSeconds(value: Date | string | null): number | null {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
}

function seasonIdForWave(wave: Pick<Wave, 'code' | 'wave_id'>): string {
  return wave.code || String(wave.wave_id);
}

function toRoundStatus(status: string): SeasonWarRoundStatus {
  switch (status) {
    case 'upcoming':
    case 'draft':
      return 'pending';
    case 'live':
      return 'active';
    case 'settling':
      return 'settling';
    case 'closed':
      return 'success';
    case 'archived':
      return 'finalized';
    case 'cancelled':
      return 'failed';
    default:
      return 'pending';
  }
}

function routeTarget(status: SeasonWarRoundStatus, rootPublishable: boolean): SeasonWarRouteTarget {
  if (rootPublishable && ['success', 'settling', 'finalized'].includes(status)) return 'SeasonClaim';
  if (status === 'failed') return 'FundVesting';
  return 'pending';
}

async function getProvenance(): Promise<SeasonWarProvenance> {
  const result = await query<ProvenanceRow>(
    `WITH latest AS (
       SELECT MAX(mark) AS updated_at
       FROM (
         SELECT MAX(updated_at) AS mark FROM waves
         UNION ALL SELECT MAX(updated_at) AS mark FROM positions
         UNION ALL SELECT MAX(updated_at) AS mark FROM reward_ledgers
         UNION ALL SELECT MAX(updated_at) AS mark FROM merkle_reward_batches
         UNION ALL SELECT MAX(updated_at) AS mark FROM merkle_reward_proofs
         UNION ALL SELECT MAX(updated_at) AS mark FROM chain_events
       ) marks
     ), watermark AS (
       SELECT MAX(block_number)::text AS indexer_watermark
       FROM chain_events
       WHERE finalized = TRUE OR apply_status = 'applied'
     )
     SELECT latest.updated_at, watermark.indexer_watermark
     FROM latest CROSS JOIN watermark`
  );
  const row = result.rows[0] || { updated_at: null, indexer_watermark: null };
  return {
    sourceFreshnessSeconds: freshnessSeconds(row.updated_at),
    indexerWatermark: row.indexer_watermark || null,
    updatedAt: iso(row.updated_at || new Date()),
  };
}

async function resolveSeasonWave(seasonId: string): Promise<Wave | null> {
  const numeric = Number(seasonId);
  if (Number.isInteger(numeric) && numeric > 0) {
    return getWaveById(numeric);
  }
  const result = await query<Wave>(
    `SELECT * FROM waves WHERE code = $1 ORDER BY start_time DESC LIMIT 1`,
    [seasonId]
  );
  return result.rows[0] || null;
}

async function getLatestBatchForWave(wave: Pick<Wave, 'wave_id' | 'code'>): Promise<{ id?: string; merkle_root: string | null; metadata: Record<string, unknown> | null; status: string; created_at?: Date } | null> {
  const waveId = String(wave.wave_id);
  const seasonId = seasonIdForWave(wave);
  const result = await query<{ id?: string; merkle_root: string | null; metadata: Record<string, unknown> | null; status: string; created_at?: Date }>(
    `SELECT id::text, merkle_root, metadata, status, created_at
     FROM merkle_reward_batches
     WHERE metadata->>'waveId' = $1
        OR metadata->>'seasonId' = $2
        OR metadata->>'season_id' = $2
        OR metadata->'successfulWaveIds' ? $1
        OR metadata->'successfulWaveIds' ? $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [waveId, seasonId]
  );
  return result.rows[0] || null;
}

function timeLeftSeconds(wave: Pick<Wave, 'end_time'>): number {
  const end = wave.end_time instanceof Date ? wave.end_time.getTime() : new Date(wave.end_time).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - Date.now()) / 1000));
}

export async function getSeasonWarCurrent(): Promise<SeasonWarCurrent | null> {
  const [wave, provenance] = await Promise.all([getCurrentWave(), getProvenance()]);
  if (!wave) return null;
  return {
    seasonId: seasonIdForWave(wave),
    waveId: String(wave.wave_id),
    roundNumber: wave.wave_id,
    chainRoundId: String(wave.wave_id),
    status: toRoundStatus(wave.status),
    timeLeftSeconds: timeLeftSeconds(wave),
    ...provenance,
  };
}

export async function getSeasonWarRadar(seasonId: string): Promise<SeasonWarRadar | null> {
  const wave = await resolveSeasonWave(seasonId);
  if (!wave) return null;
  const [waves, provenance, batch] = await Promise.all([
    query<WaveRoundRow>(
      `SELECT wave_id, code, status, end_time, reward_budget::text, updated_at
       FROM waves
       WHERE wave_id = $1 AND status <> 'archived'
       ORDER BY start_time ASC, wave_id ASC`,
      [wave.wave_id]
    ),
    getProvenance(),
    getLatestBatchForWave(wave),
  ]);
  const rootPublishable = batch?.status === 'published' || batch?.status === 'active';
  const evidenceHash = typeof batch?.metadata?.evidenceHash === 'string' ? batch.metadata.evidenceHash : null;
  return {
    seasonId: seasonIdForWave(wave),
    rounds: waves.rows.map((wave) => {
      const status = toRoundStatus(wave.status);
      return {
        waveId: String(wave.wave_id),
        roundNumber: wave.wave_id,
        chainRoundId: String(wave.wave_id),
        status,
        inventoryAtomic: String(wave.reward_budget || '0'),
        routeTarget: routeTarget(status, rootPublishable),
        evidenceHash,
      };
    }),
    ...provenance,
  };
}

export async function getSeasonWarSquads(seasonId: string): Promise<SeasonWarSquads | null> {
  const wave = await resolveSeasonWave(seasonId);
  if (!wave) return null;
  const [squads, provenance, riskRows] = await Promise.all([
    listSquadsForWave(wave.wave_id),
    getProvenance(),
    query<{ squad_id: string; risk_signal: SeasonWarRiskStatus }>(
      `SELECT sm.squad_id::text,
              CASE
                WHEN BOOL_OR(rf.severity = 'critical' AND rf.status IN ('open','reviewing')) THEN 'quarantined'
                WHEN BOOL_OR(rf.status IN ('open','reviewing')) THEN 'review'
                ELSE 'clear'
              END AS risk_signal
       FROM squad_members sm
       LEFT JOIN risk_flags rf ON rf.entity_type = 'user' AND rf.entity_id = sm.user_id::text
       WHERE sm.wave_id = $1 AND sm.status <> 'removed'
       GROUP BY sm.squad_id`,
      [wave.wave_id]
    ),
  ]);
  const riskBySquad = new Map(riskRows.rows.map((row) => [row.squad_id, row.risk_signal]));
  return {
    seasonId,
    squads: squads.map((squad) => ({
      squadId: String(squad.id),
      name: squad.name,
      rank: squad.rank,
      activatedMembers: squad.activated_member_count,
      contributionAtomic: squad.total_locked,
      riskSignal: riskBySquad.get(String(squad.id)) || 'clear',
    })),
    ...provenance,
  };
}

export async function getSeasonWarMe(wallet: string): Promise<SeasonWarMe> {
  const [wave, binding, provenance] = await Promise.all([
    getCurrentWave(),
    findVerifiedWalletBinding(process.env.CHAIN_ID || 'ton-mainnet', wallet).catch(() => null),
    getProvenance(),
  ]);
  if (!wave || !binding) {
    return {
      wallet,
      verifiedWalletBinding: false,
      eligible: false,
      eligibilityReason: binding ? 'NO_ACTIVE_WAVE' : 'WALLET_NOT_VERIFIED',
      qualifyingPositions: [],
      myLockAtomic: '0',
      squadId: null,
      squadRank: null,
      referralContributionAtomic: '0',
      rewardEstimateAtomic: '0',
      riskStatus: 'clear',
      riskReason: null,
      nextAction: binding ? 'WAIT_FOR_ACTIVE_WAVE' : 'VERIFY_WALLET_BINDING',
      ...provenance,
    };
  }

  const [positionRows, squadRows, riskRows, estimate] = await Promise.all([
    query<{ id: string; wave_id: number; amount_atomic: string; created_at: Date }>(
      `SELECT id::text, wave_id, amount_raw::text AS amount_atomic, created_at
       FROM positions
       WHERE user_id = $1 AND wave_id = $2 AND withdrawn = FALSE AND qualifies_for_activation = TRUE
       ORDER BY created_at ASC`,
      [binding.user_id, wave.wave_id]
    ),
    query<{ squad_id: string | null; squad_rank: number | null }>(
      `WITH my_squad AS (
         SELECT squad_id FROM squad_members
         WHERE user_id = $1 AND wave_id = $2 AND status <> 'removed'
         LIMIT 1
       ), ranked AS (
         SELECT s.id,
                ROW_NUMBER() OVER (ORDER BY COALESCE(COUNT(sm.id) FILTER (WHERE sm.status = 'activated'), 0) DESC, s.created_at ASC)::int AS rank
         FROM squads s
         LEFT JOIN squad_members sm ON sm.squad_id = s.id AND sm.wave_id = s.wave_id AND sm.status <> 'removed'
         WHERE s.wave_id = $2 AND s.status <> 'archived'
         GROUP BY s.id, s.created_at
       )
       SELECT my_squad.squad_id::text, ranked.rank AS squad_rank
       FROM my_squad LEFT JOIN ranked ON ranked.id = my_squad.squad_id`,
      [binding.user_id, wave.wave_id]
    ),
    query<{ risk_status: SeasonWarRiskStatus; risk_reason: string | null }>(
      `SELECT CASE
                WHEN BOOL_OR(severity = 'critical' AND status IN ('open','reviewing')) THEN 'quarantined'
                WHEN BOOL_OR(status IN ('open','reviewing')) THEN 'review'
                ELSE 'clear'
              END AS risk_status,
              STRING_AGG(flag_type, ', ' ORDER BY created_at DESC) FILTER (WHERE status IN ('open','reviewing')) AS risk_reason
       FROM risk_flags
       WHERE entity_type = 'user' AND entity_id = $1`,
      [binding.user_id]
    ),
    getRewardEstimate(wave.wave_id, binding.user_id).catch(() => null),
  ]);

  const myLockAtomic = positionRows.rows.reduce((sum, row) => sum + BigInt(row.amount_atomic || '0'), BigInt(0)).toString();
  const risk = riskRows.rows[0] || { risk_status: 'clear' as SeasonWarRiskStatus, risk_reason: null };
  const eligible = positionRows.rows.length > 0 && risk.risk_status !== 'quarantined';
  return {
    wallet,
    verifiedWalletBinding: true,
    eligible,
    eligibilityReason: eligible ? 'ELIGIBLE' : (risk.risk_status === 'quarantined' ? 'RISK_QUARANTINED' : 'NO_QUALIFYING_LOCK'),
    qualifyingPositions: positionRows.rows.map((row) => ({
      positionId: row.id,
      waveId: String(row.wave_id),
      amountAtomic: row.amount_atomic,
      createdAt: iso(row.created_at),
    })),
    myLockAtomic,
    squadId: squadRows.rows[0]?.squad_id || null,
    squadRank: squadRows.rows[0]?.squad_rank || null,
    referralContributionAtomic: estimate?.categories.find((category) => category.category === 'referral')?.estimate_amount_raw || '0',
    rewardEstimateAtomic: estimate?.total_estimate_raw || '0',
    riskStatus: risk.risk_status,
    riskReason: risk.risk_reason,
    nextAction: eligible ? 'TRACK_REWARD_PREVIEW' : (risk.risk_status === 'quarantined' ? 'WAIT_FOR_RISK_REVIEW' : 'MAKE_QUALIFYING_LOCK'),
    ...provenance,
  };
}

export async function getSeasonWarClaimPreview(seasonId: string, wallet: string): Promise<SeasonWarClaimPreview | null> {
  const wave = await resolveSeasonWave(seasonId);
  if (!wave) return null;
  const [binding, provenance] = await Promise.all([
    findVerifiedWalletBinding(process.env.CHAIN_ID || 'ton-mainnet', wallet).catch(() => null),
    getProvenance(),
  ]);
  const [batch, totals] = await Promise.all([
    getLatestBatchForWave(wave),
    binding ? getRewardEstimate(wave.wave_id, binding.user_id).catch(() => null) : Promise.resolve(null),
  ]);
  const rootPublishable = batch?.status === 'published' || batch?.status === 'active';
  const pools = {
    individualAtomic: totals?.categories.find((category) => category.category === 'personal')?.estimate_amount_raw || '0',
    squadAtomic: totals?.categories.find((category) => category.category === 'team')?.estimate_amount_raw || '0',
    referralAtomic: totals?.categories.find((category) => category.category === 'referral')?.estimate_amount_raw || '0',
    leaderboardAtomic: totals?.categories.find((category) => category.category === 'leaderboard')?.estimate_amount_raw || '0',
  };
  const pendingAtomic = totals?.ledger_totals.pending_amount_raw || '0';
  const claimedAtomic = totals?.ledger_totals.claimed_amount_raw || '0';
  return {
    snapshotId: batch?.id || null,
    merkleRoot: batch?.merkle_root || null,
    rootPublishable,
    proofStatus: rootPublishable ? 'not_ready' : 'disabled',
    claimContractVersion: 'none',
    claimContractAddress: null,
    claimWindowStatus: 'not_open',
    unlockedBps: 0,
    pools,
    pendingAtomic,
    claimableAtomic: '0',
    claimedAtomic,
    disabledReason: rootPublishable ? 'CLAIM_GATE_NOT_ENABLED' : 'ROOT_NOT_PUBLISHABLE',
    ...provenance,
  };
}

export async function getSeasonWarExportManifest(seasonId: string): Promise<SeasonWarExportManifest | null> {
  const wave = await resolveSeasonWave(seasonId);
  if (!wave) return null;
  const [batch, provenance] = await Promise.all([
    getLatestBatchForWave(wave),
    getProvenance(),
  ]);
  const metadata = batch?.metadata || {};
  return {
    manifestHash: typeof metadata.manifestHash === 'string' ? metadata.manifestHash : null,
    evidenceHash: typeof metadata.evidenceHash === 'string' ? metadata.evidenceHash : null,
    generatedAt: batch ? iso(batch.created_at) : null,
    successfulWaveIds: Array.isArray(metadata.successfulWaveIds) ? metadata.successfulWaveIds.map(String) : [],
    quarantineSummary: typeof metadata.quarantineSummary === 'object' && metadata.quarantineSummary !== null
      ? metadata.quarantineSummary as Record<string, unknown>
      : {},
    rootPublishable: batch?.status === 'published' || batch?.status === 'active',
    ...provenance,
  };
}
