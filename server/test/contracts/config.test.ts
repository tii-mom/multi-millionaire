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
      REWARD_CLAIM_MODEL: 'merkle',
    });

    const diagnostics = getContractIntegrationDiagnostics(config);

    expect(config.readOnlyEnabled).toBe(true);
    expect(config.rewardClaim.model).toBe('merkle');
    expect(diagnostics.readyForReads).toBe(true);
    expect(diagnostics.readyForIndexer).toBe(false);
    expect(diagnostics.abiArtifacts).toHaveLength(3);
  });

  it('requires a distributor address only for the distributor claim model', () => {
    const merkleConfig = loadContractIntegrationConfig({
      CHAIN_READ_ONLY_ENABLED: 'true',
      CHAIN_RPC_URL: 'https://rpc.example.invalid',
      CHAIN_ID: 'ton-mainnet',
      TOKEN_ADDRESS: 'TOKEN',
      LOCK_VAULT_ADDRESS: 'LOCK',
      ORACLE_ADDRESS: 'ORACLE',
      REWARD_CLAIM_MODEL: 'merkle',
    });
    expect(getContractIntegrationDiagnostics(merkleConfig).issues).toEqual([]);

    const distributorConfig = loadContractIntegrationConfig({
      CHAIN_READ_ONLY_ENABLED: 'true',
      CHAIN_RPC_URL: 'https://rpc.example.invalid',
      CHAIN_ID: 'ton-mainnet',
      TOKEN_ADDRESS: 'TOKEN',
      LOCK_VAULT_ADDRESS: 'LOCK',
      ORACLE_ADDRESS: 'ORACLE',
      REWARD_CLAIM_MODEL: 'distributor',
    });
    expect(getContractIntegrationDiagnostics(distributorConfig).issues).toEqual([
      expect.objectContaining({ key: 'REWARD_DISTRIBUTOR_ADDRESS' }),
    ]);
  });

  it('does not require a separate oracle contract when LockVault owner-signed pricing is used', () => {
    const config = loadContractIntegrationConfig({
      CHAIN_READ_ONLY_ENABLED: 'true',
      CHAIN_RPC_URL: 'https://rpc.example.invalid',
      CHAIN_ID: 'ton-mainnet',
      TOKEN_ADDRESS: 'TOKEN',
      LOCK_VAULT_ADDRESS: 'LOCK',
      REWARD_CLAIM_MODEL: 'merkle',
    });

    expect(getContractIntegrationDiagnostics(config).issues).toEqual([]);
    expect(getContractIntegrationDiagnostics(config).readyForReads).toBe(true);
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
