export type ContractRole = 'lock_vault' | 'oracle' | 'reward_distributor';

export type ChainEventName =
  | 'Deposited'
  | 'Withdrawn'
  | 'PriceConfirmed'
  | 'RewardBatchPublished'
  | 'RewardClaimed';

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ContractClientConfig {
  chainId: number;
  address: string;
  rpcUrl?: string;
  startBlock?: number;
  confirmations?: number;
}

export interface ContractStubState {
  kind: 'stub';
  role: ContractRole;
  chainId: number;
  address: string;
  message: string;
}

export interface UnsignedContractCall {
  chainId: number;
  to: string;
  data: string;
  valueRaw?: string;
}

export interface RawChainLog {
  chainId: number;
  contractAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  topics: string[];
  data: string;
  blockTime?: Date;
  finalized?: boolean;
}

export interface ChainEventEnvelope<TPayload extends JsonObject = JsonObject> {
  chainId: number;
  contractAddress: string;
  eventName: ChainEventName;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  payload: TPayload;
  blockTime: Date;
  finalized: boolean;
}

export interface ChainEventDbRecord<TPayload extends JsonObject = JsonObject> {
  id: string;
  chain_id: number;
  contract_address: string;
  event_name: ChainEventName;
  tx_hash: string;
  log_index: number;
  block_number: number;
  payload_json: TPayload;
  block_time: Date;
  finalized: boolean;
  created_at: Date;
}

export interface DepositedPayload extends JsonObject {
  positionId: string;
  walletAddress: string;
  userId: string | null;
  waveId: number;
  amountRaw: string;
  entryPrice: string | null;
  unlockMultiplierBps: number | null;
}

export interface WithdrawnPayload extends JsonObject {
  positionId: string;
  walletAddress: string;
  amountRaw: string | null;
}

export interface PriceConfirmedPayload extends JsonObject {
  roundId: number;
  price: string;
  observedAt: string | null;
  confirmedAt: string | null;
}

export interface RewardBatchPublishedPayload extends JsonObject {
  batchId: number;
  waveId: number;
  merkleRoot: string;
  totalAmountRaw: string;
}

export interface RewardClaimedPayload extends JsonObject {
  batchId: number | null;
  ledgerId: string | null;
  claimantAddress: string;
  amountRaw: string;
}

export class ChainIntegrationNotWiredError extends Error {
  readonly code = 'CHAIN_INTEGRATION_NOT_WIRED';

  constructor(component: string) {
    super(`${component} is a Sprint 2 chain integration stub and is not wired to runtime logic.`);
    this.name = 'ChainIntegrationNotWiredError';
  }
}

export function raiseChainIntegrationStub(component: string): never {
  throw new ChainIntegrationNotWiredError(component);
}
