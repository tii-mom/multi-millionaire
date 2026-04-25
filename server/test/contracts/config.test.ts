import fs from 'fs';
import path from 'path';
import {
  ContractConfigError,
  getContractIntegrationDiagnostics,
  loadContractIntegrationConfig,
  loadValidatedContractIntegrationConfig,
} from '../../src/services/contracts/config';

function readAbi(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/services/contracts/abi', relativePath), 'utf8'));
}

function typeByName(abi: any, name: string) {
  return abi.types.find((type: any) => type.name === name);
}

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

  it('keeps bundled LockVault ABI aligned with the audit-remediated contract', () => {
    const abi = readAbi('lock-vault/lock-vault.abi.json');
    const typeNames = abi.types.map((type: any) => type.name);
    const receiverTypes = abi.receivers
      .map((receiver: any) => receiver.message?.type)
      .filter(Boolean);
    const depositPayload = typeByName(abi, 'DepositPayload');
    const vaultState = typeByName(abi, 'VaultState');
    const withdrawPosition = typeByName(abi, 'WithdrawPosition');

    expect(typeNames).not.toContain('SetUserTarget');
    expect(receiverTypes).toEqual(expect.arrayContaining(['StagePrice', 'ApplyPrice', 'JettonExcesses']));
    expect(receiverTypes).not.toContain('SetUserTarget');
    expect(depositPayload.fields.map((field: any) => field.name)).toEqual(['waveId']);
    expect(withdrawPosition.fields.find((field: any) => field.name === 'positionId')?.type.format).toBe(256);
    expect(vaultState.fields.map((field: any) => field.name)).toEqual(expect.arrayContaining([
      'activePriceUsdE6',
      'activePriceUpdatedAt',
      'pendingPriceUsdE6',
      'pendingPriceValidAfter',
    ]));
  });

  it('keeps bundled MerkleClaim ABI aligned with domain and pending claim state', () => {
    const abi = readAbi('merkle-claim/merkle-claim.abi.json');
    const claimState = typeByName(abi, 'ClaimState');
    const data = typeByName(abi, 'MerkleClaim$Data');
    const getterNames = abi.getters.map((getter: any) => getter.name);

    expect(claimState.fields.map((field: any) => field.name)).toContain('chainIdHash');
    expect(data.fields.map((field: any) => field.name)).toContain('pendingClaims');
    expect(getterNames).toEqual(expect.arrayContaining(['ledgerClaimStatus', 'proofLeafHash']));
  });
});
