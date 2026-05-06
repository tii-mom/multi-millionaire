import type { DecodedChainEvent, RawChainLog } from '../parsers';
import { TEST_CHAIN_ID, TEST_ORACLE_ADDRESS } from './shared';

export const priceRawLog: RawChainLog = {
  chainId: TEST_CHAIN_ID,
  contractAddress: TEST_ORACLE_ADDRESS,
  txHash: '0xprice000000000000000000000000000000000000000000000000000000000001',
  logIndex: 1,
  blockNumber: 100001,
  topics: ['0xprice-topic'],
  data: '0xprice-data',
  blockTime: '2026-04-23T00:05:00.000Z',
  finalized: true,
};

export const priceDecodedEvent: DecodedChainEvent<{
  roundId: number;
  price: string;
  observedAt: string;
  confirmedAt: string;
}> = {
  chainId: TEST_CHAIN_ID,
  contractRole: 'oracle',
  contractAddress: TEST_ORACLE_ADDRESS,
  eventName: 'PriceConfirmed',
  txHash: priceRawLog.txHash,
  logIndex: priceRawLog.logIndex,
  blockNumber: priceRawLog.blockNumber,
  blockTime: priceRawLog.blockTime ?? null,
  finalized: true,
  payload: {
    roundId: 17,
    price: '142500000',
    observedAt: '2026-04-23T00:00:00.000Z',
    confirmedAt: '2026-04-23T00:05:00.000Z',
  },
};

