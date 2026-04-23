import {
  ChainEventEnvelope,
  ContractClientConfig,
  ContractStubState,
  PriceConfirmedPayload,
  RawChainLog,
  UnsignedContractCall,
  raiseChainIntegrationStub,
} from './types';

export interface OraclePriceRoundSnapshot {
  roundId: number;
  price: string;
  observedAt: Date;
  confirmedAt: Date | null;
}

export interface OracleConfirmPriceInput {
  roundId: number;
  price: string;
  observedAt: Date;
}

export interface OracleService {
  getState(): ContractStubState;
  readLatestConfirmedRound(): Promise<OraclePriceRoundSnapshot | null>;
  buildConfirmPriceCall(input: OracleConfirmPriceInput): Promise<UnsignedContractCall>;
  parsePriceConfirmedLog(rawLog: RawChainLog): Promise<ChainEventEnvelope<PriceConfirmedPayload>>;
}

class StubOracleService implements OracleService {
  constructor(private readonly config: ContractClientConfig) {}

  getState(): ContractStubState {
    return {
      kind: 'stub',
      role: 'oracle',
      chainId: this.config.chainId,
      address: this.config.address,
      message: 'Oracle service is a Sprint 2 boundary and is not connected to price flow.',
    };
  }

  async readLatestConfirmedRound(): Promise<OraclePriceRoundSnapshot | null> {
    raiseChainIntegrationStub('Oracle.readLatestConfirmedRound');
  }

  async buildConfirmPriceCall(_input: OracleConfirmPriceInput): Promise<UnsignedContractCall> {
    raiseChainIntegrationStub('Oracle.buildConfirmPriceCall');
  }

  async parsePriceConfirmedLog(_rawLog: RawChainLog): Promise<ChainEventEnvelope<PriceConfirmedPayload>> {
    raiseChainIntegrationStub('Oracle.parsePriceConfirmedLog');
  }
}

export function createOracleService(config: ContractClientConfig): OracleService {
  return new StubOracleService(config);
}
