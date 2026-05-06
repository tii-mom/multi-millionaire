import {
  buildChainEventApplyPlan,
  buildDryRunParseReport,
  buildOraclePriceRoundIngestPlan,
  buildReceiptToPositionPlan,
  buildRewardDistributorClaimPlan,
  resolveContractRole,
} from '../../src/services/indexers/parsers';
import { loadContractIntegrationConfig } from '../../src/services/contracts/config';
import {
  depositDecodedEvent,
  depositRawLog,
  depositReceiptSnapshot,
  priceDecodedEvent,
  priceRawLog,
  rewardBatchDecodedEvent,
  rewardBatchRawLog,
  rewardClaimDecodedEvent,
  rewardClaimRawLog,
  TEST_CHAIN_ID,
  TEST_LOCK_VAULT_ADDRESS,
  TEST_ORACLE_ADDRESS,
  TEST_REWARD_DISTRIBUTOR_ADDRESS,
  TEST_TOKEN_ADDRESS,
} from '../../src/services/indexers/fixtures';

const config = loadContractIntegrationConfig({
  CHAIN_READ_ONLY_ENABLED: 'true',
  CHAIN_RPC_URL: 'https://rpc.example.invalid',
  CHAIN_ID: TEST_CHAIN_ID,
  TOKEN_ADDRESS: TEST_TOKEN_ADDRESS,
  LOCK_VAULT_ADDRESS: TEST_LOCK_VAULT_ADDRESS,
  ORACLE_ADDRESS: TEST_ORACLE_ADDRESS,
  REWARD_DISTRIBUTOR_ADDRESS: TEST_REWARD_DISTRIBUTOR_ADDRESS,
});

describe('chain parser dry-run utilities', () => {
  it('resolves the configured contract role for a deposit log', () => {
    expect(resolveContractRole(config, depositRawLog.contractAddress)).toBe('lock_vault');
  });

  it('builds a deposit apply plan that resolves wallet ownership before a position write', () => {
    const report = buildDryRunParseReport(config, depositRawLog, depositDecodedEvent);

    expect(report.contractRole).toBe('lock_vault');
    expect(report.eventName).toBe('Deposited');
    expect(report.status).toBe('needs_wallet_resolution');
    expect(report.steps.map((step) => step.target)).toEqual(['chain_events', 'wallet_bindings', 'positions']);
    expect(report.steps[1].fields.wallet_address).toBe(depositDecodedEvent.payload.walletAddress);
  });

  it('builds the price round ingest plan without touching business tables', () => {
    const report = buildDryRunParseReport(config, priceRawLog, priceDecodedEvent);
    const explicitPlan = buildOraclePriceRoundIngestPlan(priceDecodedEvent);

    expect(report.contractRole).toBe('oracle');
    expect(report.status).toBe('ready');
    expect(report.steps.map((step) => step.target)).toEqual(['chain_events', 'price_rounds', 'unlock_state']);
    expect(explicitPlan).toHaveLength(3);
    expect(explicitPlan[1].fields.status).toBe('confirmed');
  });

  it('builds the reward claim plan and keeps claimant resolution separate', () => {
    const report = buildDryRunParseReport(config, rewardClaimRawLog, rewardClaimDecodedEvent);
    const explicitPlan = buildRewardDistributorClaimPlan(rewardClaimDecodedEvent);

    expect(report.contractRole).toBe('reward_distributor');
    expect(report.eventName).toBe('RewardClaimed');
    expect(report.status).toBe('needs_wallet_resolution');
    expect(report.steps.map((step) => step.target)).toEqual(['chain_events', 'wallet_bindings', 'reward_ledgers']);
    expect(explicitPlan[2].fields.status).toBe('claimed');
  });

  it('routes unsupported contract logs into review', () => {
    const report = buildDryRunParseReport(
      config,
      {
        ...depositRawLog,
        contractAddress: 'UNCONFIGURED_CONTRACT_ADDRESS',
      },
      undefined
    );

    expect(report.status).toBe('unsupported_contract');
    expect(report.steps[0].target).toBe('review_queue');
  });

  it('builds the receipt to position plan as a pure plan object', () => {
    const plan = buildReceiptToPositionPlan(depositReceiptSnapshot);

    expect(plan.map((step) => step.target)).toEqual(['chain_events', 'wallet_bindings', 'positions']);
    expect(plan[2].fields.onchain_position_id).toBe(depositReceiptSnapshot.positionId);
  });

  it('uses the reward batch event in the generic apply plan too', () => {
    const plan = buildChainEventApplyPlan(rewardBatchDecodedEvent);

    expect(plan[0].target).toBe('chain_events');
    expect(plan[1].target).toBe('reward_batches');
    expect(plan[1].fields.merkle_root).toBe(rewardBatchDecodedEvent.payload.merkleRoot);
  });
});

