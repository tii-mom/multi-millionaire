import {
  ContractConfigError,
  getContractIntegrationDiagnostics,
  loadContractIntegrationConfig,
  loadValidatedContractIntegrationConfig,
} from '../../src/services/contracts/config';

describe('contract config loader', () => {
  it('reads a read-only configuration and reports ready diagnostics', () => {
    const config = loadContractIntegrationConfig({
      CHAIN_READ_ONLY_ENABLED: 'true',
      CHAIN_RPC_URL: 'https://rpc.example.invalid',
      CHAIN_ID: 'ton-mainnet',
      TOKEN_ADDRESS: 'TOKEN',
      LOCK_VAULT_ADDRESS: 'LOCK',
      ORACLE_ADDRESS: 'ORACLE',
      REWARD_DISTRIBUTOR_ADDRESS: 'REWARD',
    });

    const diagnostics = getContractIntegrationDiagnostics(config);

    expect(config.readOnlyEnabled).toBe(true);
    expect(diagnostics.readyForReads).toBe(true);
    expect(diagnostics.readyForIndexer).toBe(false);
    expect(diagnostics.abiArtifacts).toHaveLength(3);
  });

  it('fails closed when chain integration is enabled without addresses', () => {
    expect(() =>
      loadValidatedContractIntegrationConfig({
        CHAIN_INTEGRATION_ENABLED: 'true',
        CHAIN_RPC_URL: 'https://rpc.example.invalid',
        CHAIN_ID: 'ton-mainnet',
      })
    ).toThrow(ContractConfigError);
  });
});

