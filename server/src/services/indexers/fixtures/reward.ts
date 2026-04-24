import type { DecodedChainEvent, RawChainLog } from '../parsers';
import { TEST_CHAIN_ID, TEST_REWARD_DISTRIBUTOR_ADDRESS, TEST_WALLET_ADDRESS } from './shared';

export const rewardBatchRawLog: RawChainLog = {
  chainId: TEST_CHAIN_ID,
  contractAddress: TEST_REWARD_DISTRIBUTOR_ADDRESS,
  txHash: '0xrewardbatch000000000000000000000000000000000000000000000000000001',
  logIndex: 2,
  blockNumber: 100002,
  topics: ['0xreward-batch-topic'],
  data: '0xreward-batch-data',
  blockTime: '2026-04-23T00:10:00.000Z',
  finalized: true,
};

export const rewardBatchDecodedEvent: DecodedChainEvent<{
  batchId: number;
  waveId: number;
  merkleRoot: string;
  totalAmountRaw: string;
}> = {
  chainId: TEST_CHAIN_ID,
  contractRole: 'reward_distributor',
  contractAddress: TEST_REWARD_DISTRIBUTOR_ADDRESS,
  eventName: 'RewardBatchPublished',
  txHash: rewardBatchRawLog.txHash,
  logIndex: rewardBatchRawLog.logIndex,
  blockNumber: rewardBatchRawLog.blockNumber,
  blockTime: rewardBatchRawLog.blockTime ?? null,
  finalized: true,
  payload: {
    batchId: 9,
    waveId: 1,
    merkleRoot: '0xreward-merkle-root',
    totalAmountRaw: '2500',
  },
};

export const rewardClaimRawLog: RawChainLog = {
  chainId: TEST_CHAIN_ID,
  contractAddress: TEST_REWARD_DISTRIBUTOR_ADDRESS,
  txHash: '0xrewardclaim00000000000000000000000000000000000000000000000000001',
  logIndex: 3,
  blockNumber: 100003,
  topics: ['0xreward-claim-topic'],
  data: '0xreward-claim-data',
  blockTime: '2026-04-23T00:12:00.000Z',
  finalized: true,
};

export const rewardClaimDecodedEvent: DecodedChainEvent<{
  batchId: number | null;
  ledgerId: string | null;
  claimantAddress: string;
  amountRaw: string;
}> = {
  chainId: TEST_CHAIN_ID,
  contractRole: 'reward_distributor',
  contractAddress: TEST_REWARD_DISTRIBUTOR_ADDRESS,
  eventName: 'RewardClaimed',
  txHash: rewardClaimRawLog.txHash,
  logIndex: rewardClaimRawLog.logIndex,
  blockNumber: rewardClaimRawLog.blockNumber,
  blockTime: rewardClaimRawLog.blockTime ?? null,
  finalized: true,
  payload: {
    batchId: 9,
    ledgerId: 'ledger-009',
    claimantAddress: TEST_WALLET_ADDRESS,
    amountRaw: '250',
  },
};

