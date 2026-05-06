import { query, QueryExecutor } from '../db';
import { createRewardLedger } from './rewardModel';

export const DEPOSIT_STREAK_TOKEN_DECIMALS = 9;
export const DEPOSIT_STREAK_USD_SCALE = BigInt(1_000_000_000);
export const DEPOSIT_STREAK_DAYS = 30;
export const DEPOSIT_STREAK_WEEK_DAYS = 7;
export const DEPOSIT_STREAK_MAX_WEEK_REWARDS = 4;
export const DEPOSIT_STREAK_DAILY_BPS = 100;
export const DEPOSIT_STREAK_POOL_RAW = '100000000000000000';
export const DEPOSIT_STREAK_WEEK_REWARD_RAW = '1000000000000';
export const DEPOSIT_STREAK_MONTH_REWARD_RAW = '10000000000000';

export type DepositStreakRewardType = 'deposit_streak_week' | 'deposit_streak_month';
export type DepositStreakGoalStatus = 'active' | 'completed' | 'cancelled' | 'expired';

export interface DepositStreakGoal {
  id: string;
  user_id: string;
  wave_id: number;
  target_usd9: string;
  status: DepositStreakGoalStatus;
  started_at: Date | null;
  completed_week_at: Date | null;
  completed_month_at: Date | null;
  created_at: Date;
  updated_at: Date;
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

export interface DepositStreakPool {
  total_raw: string;
  allocated_raw: string;
  remaining_raw: string;
}

export type DepositStreakRewardBlockedReason = 'pool_exhausted' | 'paused' | null;

interface DepositStreakRewardRef {
  source_ref: string;
  created_at: Date;
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
  blocked_reward_reason: DepositStreakRewardBlockedReason;
  streak_broken: boolean;
  last_missed_day_index: number | null;
  last_missed_day_start_at: string | null;
  last_missed_required_usd9: string | null;
  last_missed_deposited_usd9: string | null;
  days: DepositStreakDay[];
  pool: DepositStreakPool;
}

const goalColumns = `
  id, user_id, wave_id, target_usd9::text, status, started_at,
  completed_week_at, completed_month_at, created_at, updated_at
`;

function normalizeGoal(row: DepositStreakGoal | undefined): DepositStreakGoal | null {
  return row?.id ? row : null;
}

function dailyTargetUsd9(targetUsd9: string): string {
  return (BigInt(targetUsd9) / BigInt(100)).toString();
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - BigInt(1)) / denominator;
}

export function calculateRequiredDepositRaw(targetUsd9: string, latestPriceRaw: string | null): string | null {
  if (!latestPriceRaw) return null;
  const price = BigInt(latestPriceRaw);
  if (price <= BigInt(0)) return null;
  return ceilDiv(BigInt(dailyTargetUsd9(targetUsd9)) * DEPOSIT_STREAK_USD_SCALE, price).toString();
}

export async function getLatestDepositStreakGoal(
  userId: string,
  waveId: number,
  executor?: QueryExecutor
): Promise<DepositStreakGoal | null> {
  const db = executor || { query };
  const result = await db.query<DepositStreakGoal>(
    `SELECT ${goalColumns}
     FROM deposit_streak_goals
     WHERE user_id = $1 AND wave_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, waveId]
  );
  return normalizeGoal(result?.rows?.[0]);
}

export async function setDepositStreakGoal(
  userId: string,
  waveId: number,
  targetUsd9: string,
): Promise<DepositStreakGoal> {
  const existing = await getLatestDepositStreakGoal(userId, waveId);
  if (existing?.status === 'active' && existing.started_at) {
    const error = new Error('Deposit streak goal is locked after the first qualifying deposit');
    (error as any).status = 409;
    (error as any).code = 'DEPOSIT_STREAK_GOAL_LOCKED';
    throw error;
  }

  const result = await query<DepositStreakGoal>(
    `INSERT INTO deposit_streak_goals (user_id, wave_id, target_usd9, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'active', NOW(), NOW())
     ON CONFLICT (user_id, wave_id) WHERE status = 'active'
     DO UPDATE SET target_usd9 = EXCLUDED.target_usd9, updated_at = NOW()
     RETURNING ${goalColumns}`,
    [userId, waveId, targetUsd9]
  );
  return result.rows[0];
}

export async function ensureDepositStreakStarted(input: {
  userId: string;
  waveId: number;
  startedAt: Date;
  executor: QueryExecutor;
}): Promise<DepositStreakGoal | null> {
  const existing = await getLatestDepositStreakGoal(input.userId, input.waveId, input.executor);
  if (!existing || existing.status !== 'active') return null;
  if (existing.started_at) return existing;

  const result = await input.executor.query<DepositStreakGoal>(
    `UPDATE deposit_streak_goals
     SET started_at = $3, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'active' AND started_at IS NULL
     RETURNING ${goalColumns}`,
    [existing.id, input.userId, input.startedAt]
  );
  return normalizeGoal(result.rows[0]) || existing;
}

async function getDepositStreakPool(executor?: QueryExecutor): Promise<DepositStreakPool> {
  const db = executor || { query };
  const result = await db.query<{ allocated_raw: string }>(
    `SELECT COALESCE(SUM(final_amount), 0)::text AS allocated_raw
     FROM reward_ledgers
     WHERE reward_type IN ('deposit_streak_week','deposit_streak_month')
       AND status <> 'rejected'`
  );
  const allocated = BigInt(result.rows[0]?.allocated_raw || '0');
  const total = BigInt(DEPOSIT_STREAK_POOL_RAW);
  const remaining = total > allocated ? total - allocated : BigInt(0);
  return {
    total_raw: DEPOSIT_STREAK_POOL_RAW,
    allocated_raw: allocated.toString(),
    remaining_raw: remaining.toString(),
  };
}

async function getDepositStreakDays(goal: DepositStreakGoal, executor?: QueryExecutor): Promise<DepositStreakDay[]> {
  if (!goal.started_at) return [];

  const db = executor || { query };
  const dailyTarget = dailyTargetUsd9(goal.target_usd9);
  const result = await db.query<DepositStreakDay>(
    `WITH day_windows AS (
       SELECT
         gs.day_index,
         ($2::timestamptz + (gs.day_index * INTERVAL '1 day')) AS start_at,
         ($2::timestamptz + ((gs.day_index + 1) * INTERVAL '1 day')) AS end_at
       FROM generate_series(0, $3::int - 1) AS gs(day_index)
     ),
     day_deposits AS (
       SELECT
         FLOOR(EXTRACT(EPOCH FROM (p.created_at - $2::timestamptz)) / 86400)::int AS day_index,
         COALESCE(SUM(FLOOR((p.amount_raw * p.entry_price) / $5::numeric)), 0)::text AS deposited_usd9
       FROM positions p
       WHERE p.user_id = $1
         AND p.wave_id = $4
         AND p.withdrawn = FALSE
         AND p.qualifies_for_activation = TRUE
         AND p.created_at >= $2::timestamptz
         AND p.created_at < ($2::timestamptz + ($3::int * INTERVAL '1 day'))
       GROUP BY 1
     )
     SELECT
       dw.day_index::int,
       dw.start_at::text,
       dw.end_at::text,
       $6::numeric::text AS required_usd9,
       COALESCE(dd.deposited_usd9, '0') AS deposited_usd9,
       (COALESCE(dd.deposited_usd9, '0')::numeric >= $6::numeric) AS completed,
       (NOW() >= dw.start_at AND NOW() < dw.end_at) AS is_current
     FROM day_windows dw
     LEFT JOIN day_deposits dd ON dd.day_index = dw.day_index
     ORDER BY dw.day_index ASC`,
    [goal.user_id, goal.started_at, DEPOSIT_STREAK_DAYS, goal.wave_id, DEPOSIT_STREAK_USD_SCALE.toString(), dailyTarget]
  );
  return result.rows;
}

async function getLatestPriceRaw(executor?: QueryExecutor): Promise<string | null> {
  const db = executor || { query };
  const result = await db.query<{ price: string }>(
    `SELECT price::text
     FROM price_rounds
     WHERE status = 'confirmed'
     ORDER BY confirmed_at DESC NULLS LAST, observed_at DESC, round_id DESC
     LIMIT 1`
  );
  return result.rows[0]?.price || null;
}

async function isDepositStreakRewardPaused(executor?: QueryExecutor): Promise<boolean> {
  const db = executor || { query };
  const result = await db.query<{ enabled: boolean }>(
    `SELECT enabled
     FROM app_controls
     WHERE key = 'pause_deposit_streak_rewards'
     LIMIT 1`
  );
  return result.rows[0]?.enabled === true;
}

function firstDaysCompleted(days: DepositStreakDay[], count: number): boolean {
  return days.length >= count && days.slice(0, count).every((day) => day.completed);
}

function currentConsecutiveDays(days: DepositStreakDay[]): number {
  const latestCompletedIndex = days.reduce((latest, day, index) => day.completed ? index : latest, -1);
  if (latestCompletedIndex < 0) return 0;

  let count = 0;
  for (let index = latestCompletedIndex; index >= 0; index -= 1) {
    if (!days[index].completed) break;
    count += 1;
  }
  return count;
}

function hasBrokenStreak(days: DepositStreakDay[]): boolean {
  const latestCompletedIndex = days.reduce((latest, day, index) => day.completed ? index : latest, -1);
  if (latestCompletedIndex <= 0) return false;
  return days.slice(0, latestCompletedIndex).some((day) => !day.completed);
}

function lastMissedDay(days: DepositStreakDay[]): DepositStreakDay | null {
  const latestIndex = latestCompletedDayIndex(days);
  if (latestIndex <= 0) return null;
  for (let index = latestIndex - 1; index >= 0; index -= 1) {
    const day = days[index];
    if (!day.completed) return day;
  }
  return null;
}

function latestCompletedDayIndex(days: DepositStreakDay[]): number {
  return days.reduce((latest, day, index) => day.completed ? index : latest, -1);
}

function currentSegmentStartAt(days: DepositStreakDay[], consecutiveDays: number): Date | null {
  const latestIndex = latestCompletedDayIndex(days);
  if (latestIndex < 0 || consecutiveDays <= 0) return null;
  const startIndex = latestIndex - consecutiveDays + 1;
  const startAt = days[startIndex]?.start_at;
  return startAt ? new Date(startAt) : null;
}

function weekSourceRef(goalId: string, weekIndex: number): string {
  return `${goalId}:week:${weekIndex}`;
}

function monthSourceRef(goalId: string): string {
  return `${goalId}:month`;
}

function legacyWeekSourceRef(goalId: string): string {
  return `${goalId}:deposit_streak_week`;
}

function legacyMonthSourceRef(goalId: string): string {
  return `${goalId}:deposit_streak_month`;
}

async function getClaimedDepositStreakRewardRefs(goal: DepositStreakGoal, executor: QueryExecutor): Promise<DepositStreakRewardRef[]> {
  const result = await executor.query<DepositStreakRewardRef>(
    `SELECT source_ref, created_at
     FROM reward_ledgers
     WHERE beneficiary_user_id = $1
       AND wave_id = $2
       AND reward_type IN ('deposit_streak_week','deposit_streak_month')
       AND source_ref IS NOT NULL
       AND status <> 'rejected'
       AND source_ref LIKE $3`,
    [goal.user_id, goal.wave_id, `${goal.id}:%`]
  );
  return result.rows;
}

function rewardRefSet(rewardRefs: DepositStreakRewardRef[]): Set<string> {
  return new Set(rewardRefs.map((row) => row.source_ref));
}

function claimedWeekRewardCount(sourceRefs: Set<string>, goalId: string): number {
  const claimed = new Set<number>();
  if (sourceRefs.has(legacyWeekSourceRef(goalId))) claimed.add(1);
  for (let index = 1; index <= DEPOSIT_STREAK_MAX_WEEK_REWARDS; index += 1) {
    if (sourceRefs.has(weekSourceRef(goalId, index))) claimed.add(index);
  }
  return claimed.size;
}

function claimedCurrentSegmentWeekRewardCount(input: {
  rewardRefs: DepositStreakRewardRef[];
  goalId: string;
  segmentStartAt: Date | null;
}): number {
  const segmentStartAt = input.segmentStartAt;
  if (!segmentStartAt) return 0;
  return input.rewardRefs.filter((reward) => {
    if (reward.created_at < segmentStartAt) return false;
    if (reward.source_ref === legacyWeekSourceRef(input.goalId)) return true;
    return /^.+:week:\d+$/.test(reward.source_ref);
  }).length;
}

function hasClaimedMonthReward(sourceRefs: Set<string>, goalId: string): boolean {
  return sourceRefs.has(monthSourceRef(goalId)) || sourceRefs.has(legacyMonthSourceRef(goalId));
}

async function awardDepositStreakReward(input: {
  goal: DepositStreakGoal;
  rewardType: DepositStreakRewardType;
  amountRaw: string;
  sourceRef: string;
  executor: QueryExecutor;
}): Promise<boolean> {
  const pool = await getDepositStreakPool(input.executor);
  if (BigInt(pool.remaining_raw) < BigInt(input.amountRaw)) return false;

  const reward = await createRewardLedger({
    beneficiaryUserId: input.goal.user_id,
    sourceUserId: input.goal.user_id,
    sourcePositionId: null,
    sourceRef: input.sourceRef,
    waveId: input.goal.wave_id,
    rewardType: input.rewardType,
    grossAmount: input.amountRaw,
    finalAmount: input.amountRaw,
    status: 'approved',
  }, input.executor);
  return !!reward;
}

export async function evaluateDepositStreakRewards(input: {
  userId: string;
  waveId: number;
  depositCreatedAt: Date;
  executor: QueryExecutor;
}): Promise<void> {
  const goal = await ensureDepositStreakStarted({
    userId: input.userId,
    waveId: input.waveId,
    startedAt: input.depositCreatedAt,
    executor: input.executor,
  });
  if (!goal || goal.status !== 'active') return;

  const days = await getDepositStreakDays(goal, input.executor);
  const consecutiveDays = currentConsecutiveDays(days);
  const rewardRefs = await getClaimedDepositStreakRewardRefs(goal, input.executor);
  const sourceRefs = rewardRefSet(rewardRefs);
  const claimedWeeks = claimedWeekRewardCount(sourceRefs, goal.id);
  const claimedWeeksInCurrentSegment = claimedCurrentSegmentWeekRewardCount({
    rewardRefs,
    goalId: goal.id,
    segmentStartAt: currentSegmentStartAt(days, consecutiveDays),
  });
  const eligibleWeekRewards = Math.min(
    DEPOSIT_STREAK_MAX_WEEK_REWARDS,
    claimedWeeks + Math.max(0, Math.floor(consecutiveDays / DEPOSIT_STREAK_WEEK_DAYS) - claimedWeeksInCurrentSegment)
  );

  for (let weekIndex = claimedWeeks + 1; weekIndex <= eligibleWeekRewards; weekIndex += 1) {
    const sourceRef = weekSourceRef(goal.id, weekIndex);
    if (sourceRefs.has(sourceRef)) continue;

    const awarded = await awardDepositStreakReward({
      goal,
      rewardType: 'deposit_streak_week',
      amountRaw: DEPOSIT_STREAK_WEEK_REWARD_RAW,
      sourceRef,
      executor: input.executor,
    });
    if (!awarded) break;

    sourceRefs.add(sourceRef);
    rewardRefs.push({ source_ref: sourceRef, created_at: new Date() });
    await input.executor.query(
      `UPDATE deposit_streak_goals
       SET completed_week_at = COALESCE(completed_week_at, NOW()), updated_at = NOW()
       WHERE id = $1`,
      [goal.id]
    );
  }

  if (consecutiveDays >= DEPOSIT_STREAK_DAYS && !hasClaimedMonthReward(sourceRefs, goal.id)) {
    const awarded = await awardDepositStreakReward({
      goal,
      rewardType: 'deposit_streak_month',
      amountRaw: DEPOSIT_STREAK_MONTH_REWARD_RAW,
      sourceRef: monthSourceRef(goal.id),
      executor: input.executor,
    });
    if (awarded) {
      sourceRefs.add(monthSourceRef(goal.id));
    }
  }

  if (hasClaimedMonthReward(sourceRefs, goal.id)) {
    await input.executor.query(
      `UPDATE deposit_streak_goals
       SET completed_month_at = COALESCE(completed_month_at, NOW()),
           status = 'completed',
           updated_at = NOW()
       WHERE id = $1`,
      [goal.id]
    );
  }
}

export async function getDepositStreakView(userId: string, waveId: number): Promise<DepositStreakView> {
  const goal = await getLatestDepositStreakGoal(userId, waveId);
  const [latestPriceRaw, pool, days, rewardPaused] = await Promise.all([
    getLatestPriceRaw(),
    getDepositStreakPool(),
    goal ? getDepositStreakDays(goal) : Promise.resolve([]),
    isDepositStreakRewardPaused(),
  ]);
  const dailyTarget = goal ? dailyTargetUsd9(goal.target_usd9) : '0';
  const currentDay = days.find((day) => day.is_current) || null;
  const rewardRefs = goal ? await getClaimedDepositStreakRewardRefs(goal, { query }) : [];
  const sourceRefs = rewardRefSet(rewardRefs);
  const claimedWeeks = goal ? claimedWeekRewardCount(sourceRefs, goal.id) : 0;
  const nextWeekRewardIndex = claimedWeeks >= DEPOSIT_STREAK_MAX_WEEK_REWARDS ? null : claimedWeeks + 1;
  const consecutiveDays = currentConsecutiveDays(days);
  const claimedWeeksInCurrentSegment = goal ? claimedCurrentSegmentWeekRewardCount({
    rewardRefs,
    goalId: goal.id,
    segmentStartAt: currentSegmentStartAt(days, consecutiveDays),
  }) : 0;
  const nextWeekProgressBase = consecutiveDays - (claimedWeeksInCurrentSegment * DEPOSIT_STREAK_WEEK_DAYS);
  const nextWeekRewardDaysRemaining = nextWeekRewardIndex === null
    ? null
    : Math.max(DEPOSIT_STREAK_WEEK_DAYS - nextWeekProgressBase, 0);
  const remainingPool = BigInt(pool.remaining_raw);
  const hasPendingWeekReward = nextWeekRewardIndex !== null && nextWeekRewardDaysRemaining === 0;
  const hasPendingMonthReward = goal !== null && consecutiveDays >= DEPOSIT_STREAK_DAYS && !hasClaimedMonthReward(sourceRefs, goal.id);
  const requiredRewardRaw = hasPendingMonthReward ? BigInt(DEPOSIT_STREAK_MONTH_REWARD_RAW) : hasPendingWeekReward ? BigInt(DEPOSIT_STREAK_WEEK_REWARD_RAW) : BigInt(0);
  const rewardPoolSufficient = requiredRewardRaw === BigInt(0) || remainingPool >= requiredRewardRaw;
  const blockedRewardReason: DepositStreakRewardBlockedReason = rewardPaused
    ? 'paused'
    : rewardPoolSufficient ? null : 'pool_exhausted';
  const missedDay = lastMissedDay(days);

  return {
    goal,
    daily_target_usd9: dailyTarget,
    latest_price_raw: latestPriceRaw,
    required_today_raw: goal ? calculateRequiredDepositRaw(goal.target_usd9, latestPriceRaw) : null,
    current_day_index: currentDay?.day_index ?? null,
    week_completed: claimedWeeks > 0 || firstDaysCompleted(days, DEPOSIT_STREAK_WEEK_DAYS),
    month_completed: (goal ? hasClaimedMonthReward(sourceRefs, goal.id) : false) || firstDaysCompleted(days, DEPOSIT_STREAK_DAYS),
    current_consecutive_days: consecutiveDays,
    monthly_progress_days: consecutiveDays,
    claimed_week_rewards: claimedWeeks,
    next_week_reward_index: nextWeekRewardIndex,
    next_week_reward_days_remaining: nextWeekRewardDaysRemaining,
    weekly_reward_cap: DEPOSIT_STREAK_MAX_WEEK_REWARDS,
    reward_pool_sufficient: rewardPoolSufficient,
    blocked_reward_reason: blockedRewardReason,
    streak_broken: hasBrokenStreak(days),
    last_missed_day_index: missedDay?.day_index ?? null,
    last_missed_day_start_at: missedDay?.start_at ?? null,
    last_missed_required_usd9: missedDay?.required_usd9 ?? null,
    last_missed_deposited_usd9: missedDay?.deposited_usd9 ?? null,
    days,
    pool,
  };
}
