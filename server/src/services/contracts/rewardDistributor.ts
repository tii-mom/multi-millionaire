import {
  ChainEventEnvelope,
  ContractClientConfig,
  ContractStubState,
  RawChainLog,
  RewardBatchPublishedPayload,
  RewardClaimedPayload,
  UnsignedContractCall,
  raiseChainIntegrationStub,
} from './types';

export interface RewardBatchPublishInput {
  waveId: number;
  merkleRoot: string;
  totalAmountRaw: string;
}

export interface RewardClaimSnapshot {
  batchId: number | null;
  ledgerId: string | null;
  claimantAddress: string;
  amountRaw: string;
  txHash: string;
}

export interface RewardDistributorService {
  getState(): ContractStubState;
  buildPublishBatchCall(input: RewardBatchPublishInput): Promise<UnsignedContractCall>;
  readClaim(txHash: string, logIndex: number): Promise<RewardClaimSnapshot | null>;
  parseRewardBatchPublishedLog(rawLog: RawChainLog): Promise<ChainEventEnvelope<RewardBatchPublishedPayload>>;
  parseRewardClaimedLog(rawLog: RawChainLog): Promise<ChainEventEnvelope<RewardClaimedPayload>>;
}

class StubRewardDistributorService implements RewardDistributorService {
  constructor(private readonly config: ContractClientConfig) {}

  getState(): ContractStubState {
    return {
      kind: 'stub',
      role: 'reward_distributor',
      chainId: this.config.chainId,
      address: this.config.address,
      message: 'RewardDistributor service is a Sprint 2 boundary and is not connected to reward flow.',
    };
  }

  async buildPublishBatchCall(_input: RewardBatchPublishInput): Promise<UnsignedContractCall> {
    raiseChainIntegrationStub('RewardDistributor.buildPublishBatchCall');
  }

  async readClaim(_txHash: string, _logIndex: number): Promise<RewardClaimSnapshot | null> {
    raiseChainIntegrationStub('RewardDistributor.readClaim');
  }

  async parseRewardBatchPublishedLog(
    _rawLog: RawChainLog
  ): Promise<ChainEventEnvelope<RewardBatchPublishedPayload>> {
    raiseChainIntegrationStub('RewardDistributor.parseRewardBatchPublishedLog');
  }

  async parseRewardClaimedLog(_rawLog: RawChainLog): Promise<ChainEventEnvelope<RewardClaimedPayload>> {
    raiseChainIntegrationStub('RewardDistributor.parseRewardClaimedLog');
  }
}

export function createRewardDistributorService(config: ContractClientConfig): RewardDistributorService {
  return new StubRewardDistributorService(config);
}
