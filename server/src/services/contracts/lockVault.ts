import {
  ChainEventEnvelope,
  ContractClientConfig,
  ContractStubState,
  DepositedPayload,
  RawChainLog,
  UnsignedContractCall,
  WithdrawnPayload,
  raiseChainIntegrationStub,
} from './types';

export interface LockVaultDepositInput {
  userId: string;
  walletAddress: string;
  waveId: number;
  amountRaw: string;
}

export interface LockVaultPositionSnapshot {
  positionId: string;
  walletAddress: string;
  waveId: number;
  amountRaw: string;
  entryPrice: string;
  withdrawn: boolean;
}

export interface LockVaultService {
  getState(): ContractStubState;
  buildDepositCall(input: LockVaultDepositInput): Promise<UnsignedContractCall>;
  readPosition(positionId: string): Promise<LockVaultPositionSnapshot | null>;
  parseDepositedLog(rawLog: RawChainLog): Promise<ChainEventEnvelope<DepositedPayload>>;
  parseWithdrawnLog(rawLog: RawChainLog): Promise<ChainEventEnvelope<WithdrawnPayload>>;
}

class StubLockVaultService implements LockVaultService {
  constructor(private readonly config: ContractClientConfig) {}

  getState(): ContractStubState {
    return {
      kind: 'stub',
      role: 'lock_vault',
      chainId: this.config.chainId,
      address: this.config.address,
      message: 'LockVault service is a Sprint 2 boundary and is not connected to deposit flow.',
    };
  }

  async buildDepositCall(_input: LockVaultDepositInput): Promise<UnsignedContractCall> {
    raiseChainIntegrationStub('LockVault.buildDepositCall');
  }

  async readPosition(_positionId: string): Promise<LockVaultPositionSnapshot | null> {
    raiseChainIntegrationStub('LockVault.readPosition');
  }

  async parseDepositedLog(_rawLog: RawChainLog): Promise<ChainEventEnvelope<DepositedPayload>> {
    raiseChainIntegrationStub('LockVault.parseDepositedLog');
  }

  async parseWithdrawnLog(_rawLog: RawChainLog): Promise<ChainEventEnvelope<WithdrawnPayload>> {
    raiseChainIntegrationStub('LockVault.parseWithdrawnLog');
  }
}

export function createLockVaultService(config: ContractClientConfig): LockVaultService {
  return new StubLockVaultService(config);
}
