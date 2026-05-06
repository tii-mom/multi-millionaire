import type { DecodedChainEvent, RawChainLog, ReceiptSnapshot } from '../parsers';
import {
  TEST_CHAIN_ID,
  TEST_LOCK_VAULT_ADDRESS,
  TEST_TOKEN_ADDRESS,
  TEST_USER_ID,
  TEST_WALLET_ADDRESS,
} from './shared';

export const depositRawLog: RawChainLog = {
  chainId: TEST_CHAIN_ID,
  contractAddress: TEST_LOCK_VAULT_ADDRESS,
  txHash: '0xdeposit000000000000000000000000000000000000000000000000000000000001',
  logIndex: 0,
  blockNumber: 100000,
  topics: ['0xdeposit-topic'],
  data: '0xdeposit-data',
  blockTime: '2026-04-23T00:00:00.000Z',
  finalized: false,
};

export const depositDecodedEvent: DecodedChainEvent<{
  positionId: string;
  walletAddress: string;
  userId: string | null;
  waveId: number;
  amountRaw: string;
  entryPrice: string;
  unlockMultiplierBps: number;
}> = {
  chainId: TEST_CHAIN_ID,
  contractRole: 'lock_vault',
  contractAddress: TEST_LOCK_VAULT_ADDRESS,
  eventName: 'Deposited',
  txHash: depositRawLog.txHash,
  logIndex: depositRawLog.logIndex,
  blockNumber: depositRawLog.blockNumber,
  blockTime: depositRawLog.blockTime ?? null,
  finalized: false,
  payload: {
    positionId: 'pos-001',
    walletAddress: TEST_WALLET_ADDRESS,
    userId: TEST_USER_ID,
    waveId: 1,
    amountRaw: '1000',
    entryPrice: '142000000',
    unlockMultiplierBps: 15000,
  },
};

export const depositReceiptSnapshot: ReceiptSnapshot = {
  chainId: TEST_CHAIN_ID,
  txHash: depositRawLog.txHash,
  contractAddress: TEST_LOCK_VAULT_ADDRESS,
  walletAddress: TEST_WALLET_ADDRESS,
  waveId: 1,
  amountRaw: '1000',
  positionId: 'pos-001',
  logIndex: depositRawLog.logIndex,
  blockNumber: depositRawLog.blockNumber,
  finalized: true,
};

export const depositTokenAddress = TEST_TOKEN_ADDRESS;

