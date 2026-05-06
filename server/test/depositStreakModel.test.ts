import {
  calculateRequiredDepositRaw,
  DEPOSIT_STREAK_MONTH_REWARD_RAW,
  DEPOSIT_STREAK_WEEK_REWARD_RAW,
  evaluateDepositStreakRewards,
} from '../src/models/depositStreakModel';
import { QueryExecutor } from '../src/db';

function buildCompletedDays(count: number, pattern?: boolean[]) {
  return Array.from({ length: 30 }, (_, index) => ({
    day_index: index,
    start_at: `2026-05-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    end_at: `2026-05-${String(index + 2).padStart(2, '0')}T00:00:00.000Z`,
    required_usd9: '1000000000000',
    deposited_usd9: (pattern?.[index] ?? index < count) ? '1000000000000' : '0',
    completed: pattern?.[index] ?? index < count,
    is_current: index === count,
  }));
}

function createStreakExecutor(input: {
  completedDays: number;
  completedPattern?: boolean[];
  allocatedRaw?: string;
  existingSourceRefs?: Array<string | { source_ref: string; created_at: Date }>;
  rewardInsertSucceeds?: boolean;
}) {
  const rewardRows: any[] = [];
  const updates: string[] = [];
  const positionQueries: string[] = [];
  const existingRewardRefs = new Map<string, Date>();
  for (const item of input.existingSourceRefs || []) {
    if (typeof item === 'string') {
      existingRewardRefs.set(item, new Date('2026-05-03T00:00:00.000Z'));
    } else {
      existingRewardRefs.set(item.source_ref, item.created_at);
    }
  }
  const goal = {
    id: 'goal-1',
    user_id: 'user-1',
    wave_id: 1,
    target_usd9: (BigInt(100_000) * BigInt(1_000_000_000)).toString(),
    status: 'active',
    started_at: new Date('2026-05-01T00:00:00.000Z'),
    completed_week_at: null,
    completed_month_at: null,
    created_at: new Date('2026-05-01T00:00:00.000Z'),
    updated_at: new Date('2026-05-01T00:00:00.000Z'),
  };
  const executor: QueryExecutor & { rewardRows: any[]; updates: string[]; positionQueries: string[] } = {
    rewardRows,
    updates,
    positionQueries,
    async query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
      if (sql.includes('FROM deposit_streak_goals') && sql.includes('ORDER BY created_at')) {
        return { rows: [goal as T] };
      }
      if (sql.includes('FROM positions p') && sql.includes('generate_series')) {
        positionQueries.push(sql);
        return { rows: buildCompletedDays(input.completedDays, input.completedPattern) as T[] };
      }
      if (sql.includes('SELECT source_ref') && sql.includes('FROM reward_ledgers')) {
        return {
          rows: [...existingRewardRefs.entries()].map(([source_ref, created_at]) => ({ source_ref, created_at })) as T[],
        };
      }
      if (sql.includes('COALESCE(SUM(final_amount)') && sql.includes("deposit_streak_week")) {
        return { rows: [{ allocated_raw: input.allocatedRaw || '0' } as T] };
      }
      if (sql.includes('INSERT INTO reward_ledgers')) {
        if (input.rewardInsertSucceeds === false) {
          return { rows: [] };
        }
        const reward = {
          id: `reward-${rewardRows.length + 1}`,
          beneficiary_user_id: params?.[0],
          source_user_id: params?.[1],
          source_position_id: params?.[2],
          wave_id: params?.[3],
          reward_type: params?.[4],
          gross_amount: params?.[5],
          final_amount: params?.[6],
          status: params?.[7],
          source_ref: params?.[8],
          created_at: new Date(),
          updated_at: new Date(),
        };
        rewardRows.push(reward);
        if (typeof reward.source_ref === 'string') existingRewardRefs.set(reward.source_ref, new Date('2026-05-30T12:00:00.000Z'));
        return { rows: [reward as T] };
      }
      if (sql.includes('UPDATE deposit_streak_goals')) {
        updates.push(sql);
        return { rows: [] as T[] };
      }
      throw new Error(`Unexpected SQL in deposit streak test: ${sql}`);
    },
  };
  return executor;
}

describe('deposit streak calculations', () => {
  it('recalculates the daily 72H requirement from the live price', () => {
    const targetUsd9 = (BigInt(100_000) * BigInt(1_000_000_000)).toString();

    expect(calculateRequiredDepositRaw(targetUsd9, '100000000')).toBe((BigInt(10_000) * BigInt(1_000_000_000)).toString());
    expect(calculateRequiredDepositRaw(targetUsd9, '200000000')).toBe((BigInt(5_000) * BigInt(1_000_000_000)).toString());
  });

  it('does not produce a requirement when price is unavailable', () => {
    const targetUsd9 = (BigInt(100_000) * BigInt(1_000_000_000)).toString();

    expect(calculateRequiredDepositRaw(targetUsd9, null)).toBeNull();
    expect(calculateRequiredDepositRaw(targetUsd9, '0')).toBeNull();
  });

  it('awards the first weekly reward after 7 continuous completed days', async () => {
    const executor = createStreakExecutor({ completedDays: 7 });

    await evaluateDepositStreakRewards({
      userId: 'user-1',
      waveId: 1,
      depositCreatedAt: new Date('2026-05-07T12:00:00.000Z'),
      executor,
    });

    expect(executor.rewardRows).toHaveLength(1);
    expect(executor.rewardRows[0]).toMatchObject({
      reward_type: 'deposit_streak_week',
      final_amount: DEPOSIT_STREAK_WEEK_REWARD_RAW,
      source_ref: 'goal-1:week:1',
      status: 'approved',
    });
    expect(executor.positionQueries[0]).toContain('p.qualifies_for_activation = TRUE');
    expect(executor.updates).toHaveLength(1);
    expect(executor.updates[0]).toContain('completed_week_at');
  });

  it.each([
    [14, ['goal-1:week:1', 'goal-1:week:2']],
    [21, ['goal-1:week:1', 'goal-1:week:2', 'goal-1:week:3']],
    [28, ['goal-1:week:1', 'goal-1:week:2', 'goal-1:week:3', 'goal-1:week:4']],
  ])('awards weekly rewards for %i continuous completed days', async (completedDays, expectedRefs) => {
    const executor = createStreakExecutor({ completedDays });

    await evaluateDepositStreakRewards({
      userId: 'user-1',
      waveId: 1,
      depositCreatedAt: new Date('2026-05-28T12:00:00.000Z'),
      executor,
    });

    expect(executor.rewardRows.map((reward) => reward.source_ref)).toEqual(expectedRefs);
    expect(executor.rewardRows.every((reward) => reward.reward_type === 'deposit_streak_week')).toBe(true);
  });

  it('awards four weekly rewards and the monthly reward after 30 continuous daily targets are complete', async () => {
    const executor = createStreakExecutor({ completedDays: 30 });

    await evaluateDepositStreakRewards({
      userId: 'user-1',
      waveId: 1,
      depositCreatedAt: new Date('2026-05-30T12:00:00.000Z'),
      executor,
    });

    expect(executor.rewardRows.map((reward) => reward.source_ref)).toEqual([
      'goal-1:week:1',
      'goal-1:week:2',
      'goal-1:week:3',
      'goal-1:week:4',
      'goal-1:month',
    ]);
    expect(executor.rewardRows[4]).toMatchObject({
      reward_type: 'deposit_streak_month',
      final_amount: DEPOSIT_STREAK_MONTH_REWARD_RAW,
      status: 'approved',
    });
    expect(executor.updates[executor.updates.length - 1]).toContain("status = 'completed'");
  });

  it('resets the consecutive run after a missed day but keeps prior weekly rewards', async () => {
    const pattern = Array.from({ length: 30 }, (_, index) => index < 7 || (index >= 8 && index < 15));
    const executor = createStreakExecutor({
      completedDays: 15,
      completedPattern: pattern,
      existingSourceRefs: ['goal-1:week:1'],
    });

    await evaluateDepositStreakRewards({
      userId: 'user-1',
      waveId: 1,
      depositCreatedAt: new Date('2026-05-15T12:00:00.000Z'),
      executor,
    });

    expect(executor.rewardRows.map((reward) => reward.source_ref)).toEqual(['goal-1:week:2']);
    expect(executor.updates[executor.updates.length - 1]).toContain('completed_week_at');
  });

  it('does not duplicate rewards that already have source refs', async () => {
    const executor = createStreakExecutor({
      completedDays: 30,
      existingSourceRefs: ['goal-1:week:1', 'goal-1:week:2', 'goal-1:week:3', 'goal-1:week:4', 'goal-1:month'],
    });

    await evaluateDepositStreakRewards({
      userId: 'user-1',
      waveId: 1,
      depositCreatedAt: new Date('2026-05-30T12:00:00.000Z'),
      executor,
    });

    expect(executor.rewardRows).toHaveLength(0);
    expect(executor.updates[executor.updates.length - 1]).toContain("status = 'completed'");
  });

  it('does not promote the same 7-day segment into a second weekly reward on repeat evaluation', async () => {
    const executor = createStreakExecutor({
      completedDays: 7,
      existingSourceRefs: [{ source_ref: 'goal-1:week:1', created_at: new Date('2026-05-07T12:00:00.000Z') }],
    });

    await evaluateDepositStreakRewards({
      userId: 'user-1',
      waveId: 1,
      depositCreatedAt: new Date('2026-05-07T12:00:00.000Z'),
      executor,
    });

    expect(executor.rewardRows).toHaveLength(0);
  });

  it('does not mark the streak complete when reward insertion is skipped', async () => {
    const executor = createStreakExecutor({ completedDays: 30, rewardInsertSucceeds: false });

    await evaluateDepositStreakRewards({
      userId: 'user-1',
      waveId: 1,
      depositCreatedAt: new Date('2026-05-30T12:00:00.000Z'),
      executor,
    });

    expect(executor.rewardRows).toHaveLength(0);
    expect(executor.updates).toHaveLength(0);
  });

  it('does not award when the streak reward pool lacks enough remaining funds', async () => {
    const executor = createStreakExecutor({
      completedDays: 7,
      allocatedRaw: '99999999999999500',
    });

    await evaluateDepositStreakRewards({
      userId: 'user-1',
      waveId: 1,
      depositCreatedAt: new Date('2026-05-07T12:00:00.000Z'),
      executor,
    });

    expect(executor.rewardRows).toHaveLength(0);
    expect(executor.updates).toHaveLength(0);
  });
});
