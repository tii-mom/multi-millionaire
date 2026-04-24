import fs from 'fs';
import path from 'path';

export type ContractRole = 'token' | 'lock_vault' | 'oracle' | 'reward_distributor';

export interface ContractConfigIssue {
  severity: 'warning' | 'error';
  key: string;
  message: string;
}

export interface ContractResourceConfig {
  address: string | null;
  abiPath: string | null;
  startBlock: number | null;
}

export interface TokenResourceConfig {
  address: string | null;
  decimals: number | null;
}

export interface AbiManifestConfig {
  rootDir: string;
  lockVault: string;
  oracle: string;
  rewardDistributor: string;
}

export interface IndexerConfig {
  enabled: boolean;
  confirmations: number;
  reorgLookbackBlocks: number;
  pollIntervalMs: number;
  startBlocks: {
    lockVault: number | null;
    oracle: number | null;
    rewardDistributor: number | null;
  };
}

export interface WalletBindingConfig {
  enabled: boolean;
  nonceTtlSeconds: number;
  messageDomain: string | null;
}

export interface ReceiptConfig {
  enabled: boolean;
  requiredConfirmations: number;
}

export type RewardClaimModel = 'legacy_stub' | 'merkle' | 'distributor';

export interface RewardClaimConfig {
  model: RewardClaimModel;
}

export interface OperatorConfig {
  address: string | null;
  privateKeyPresent: boolean;
  gasLimitMultiplierBps: number | null;
}

export interface ContractIntegrationConfig {
  enabled: boolean;
  readOnlyEnabled: boolean;
  indexerEnabled: boolean;
  mainlineWritesEnabled: boolean;
  chainId: string;
  rpcUrl: string | null;
  token: TokenResourceConfig;
  lockVault: ContractResourceConfig;
  oracle: ContractResourceConfig;
  rewardDistributor: ContractResourceConfig;
  abi: AbiManifestConfig;
  indexer: IndexerConfig;
  walletBinding: WalletBindingConfig;
  receipt: ReceiptConfig;
  rewardClaim: RewardClaimConfig;
  operator: OperatorConfig;
}

export interface ContractArtifactStatus {
  role: ContractRole;
  path: string;
  resolvedPath: string;
  exists: boolean;
}

export interface ContractConfigDiagnostics {
  issues: ContractConfigIssue[];
  abiArtifacts: ContractArtifactStatus[];
  readyForReads: boolean;
  readyForIndexer: boolean;
  readyForWrites: boolean;
}

export class ContractConfigError extends Error {
  readonly issues: ContractConfigIssue[];

  constructor(issues: ContractConfigIssue[]) {
    super(`Invalid contract integration config: ${issues.map((issue) => `${issue.key}: ${issue.message}`).join('; ')}`);
    this.name = 'ContractConfigError';
    this.issues = issues;
  }
}

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeContractAddress(value: string | null | undefined): string {
  return normalizeString(value) ?? '';
}

function readBoolean(value: string | null | undefined, defaultValue: boolean): boolean {
  const normalized = normalizeString(value);
  if (!normalized) {
    return defaultValue;
  }

  switch (normalized.toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      return defaultValue;
  }
}

function readInteger(value: string | null | undefined, defaultValue: number | null): number | null {
  const normalized = normalizeString(value);
  if (!normalized) {
    return defaultValue;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : defaultValue;
}

function readString(value: string | null | undefined): string | null {
  return normalizeString(value);
}

function readRewardClaimModel(value: string | null | undefined): RewardClaimModel {
  const normalized = normalizeString(value)?.toLowerCase();
  if (normalized === 'merkle' || normalized === 'distributor') {
    return normalized;
  }
  return 'legacy_stub';
}

function buildAbiPath(rootDir: string, fileName: string, explicitValue: string | null | undefined): string {
  const normalizedExplicit = normalizeString(explicitValue);
  if (normalizedExplicit) {
    return normalizedExplicit;
  }
  return path.join(rootDir, fileName);
}

function buildResolvedPath(pathValue: string): string {
  return path.isAbsolute(pathValue) ? pathValue : path.resolve(process.cwd(), pathValue);
}

export function loadContractIntegrationConfig(env: NodeJS.ProcessEnv = process.env): ContractIntegrationConfig {
  const enabled = readBoolean(env.CHAIN_INTEGRATION_ENABLED, false);
  const readOnlyEnabled = readBoolean(env.CHAIN_READ_ONLY_ENABLED, enabled);
  const indexerEnabled = readBoolean(env.CHAIN_INDEXER_ENABLED, false);
  const mainlineWritesEnabled = readBoolean(env.CHAIN_MAINLINE_WRITES_ENABLED, false);
  const chainId = readString(env.CHAIN_ID) ?? 'ton-mainnet';
  const rpcUrl = readString(env.CHAIN_RPC_URL) ?? readString(env.RPC_URL);
  const tokenAddress = readString(env.TOKEN_ADDRESS);
  const lockVaultAddress = readString(env.LOCK_VAULT_ADDRESS);
  const oracleAddress = readString(env.ORACLE_ADDRESS);
  const rewardDistributorAddress = readString(env.REWARD_DISTRIBUTOR_ADDRESS);
  const tokenDecimals = readInteger(env.TOKEN_DECIMALS, null);

  const abiRootDir = normalizeString(env.CONTRACT_ABI_DIR) ?? 'src/services/contracts/abi';
  const lockVaultAbiPath = buildAbiPath(abiRootDir, 'lock-vault/lock-vault.abi.json', env.LOCK_VAULT_ABI_PATH);
  const oracleAbiPath = buildAbiPath(abiRootDir, 'oracle/oracle.abi.json', env.ORACLE_ABI_PATH);
  const rewardDistributorAbiPath = buildAbiPath(
    abiRootDir,
    'reward-distributor/reward-distributor.abi.json',
    env.REWARD_DISTRIBUTOR_ABI_PATH
  );

  return {
    enabled,
    readOnlyEnabled,
    indexerEnabled,
    mainlineWritesEnabled,
    chainId,
    rpcUrl,
    token: {
      address: tokenAddress,
      decimals: tokenDecimals,
    },
    lockVault: {
      address: lockVaultAddress,
      abiPath: lockVaultAbiPath,
      startBlock: readInteger(env.LOCK_VAULT_START_BLOCK, null),
    },
    oracle: {
      address: oracleAddress,
      abiPath: oracleAbiPath,
      startBlock: readInteger(env.ORACLE_START_BLOCK, null),
    },
    rewardDistributor: {
      address: rewardDistributorAddress,
      abiPath: rewardDistributorAbiPath,
      startBlock: readInteger(env.REWARD_DISTRIBUTOR_START_BLOCK, null),
    },
    abi: {
      rootDir: abiRootDir,
      lockVault: lockVaultAbiPath,
      oracle: oracleAbiPath,
      rewardDistributor: rewardDistributorAbiPath,
    },
    indexer: {
      enabled: indexerEnabled,
      confirmations: readInteger(env.CHAIN_INDEXER_CONFIRMATIONS, 12) ?? 12,
      reorgLookbackBlocks: readInteger(env.CHAIN_REORG_LOOKBACK_BLOCKS, 64) ?? 64,
      pollIntervalMs: readInteger(env.CHAIN_INDEXER_POLL_INTERVAL_MS, 15000) ?? 15000,
      startBlocks: {
        lockVault: readInteger(env.LOCK_VAULT_START_BLOCK, null),
        oracle: readInteger(env.ORACLE_START_BLOCK, null),
        rewardDistributor: readInteger(env.REWARD_DISTRIBUTOR_START_BLOCK, null),
      },
    },
    walletBinding: {
      enabled: readBoolean(env.WALLET_BINDING_ENABLED, false),
      nonceTtlSeconds: readInteger(env.WALLET_BINDING_NONCE_TTL_SECONDS, 300) ?? 300,
      messageDomain: readString(env.WALLET_BINDING_MESSAGE_DOMAIN),
    },
    receipt: {
      enabled: readBoolean(env.RECEIPT_VERIFICATION_ENABLED, false),
      requiredConfirmations: readInteger(env.RECEIPT_REQUIRED_CONFIRMATIONS, readInteger(env.CHAIN_INDEXER_CONFIRMATIONS, 12) ?? 12) ?? 12,
    },
    rewardClaim: {
      model: readRewardClaimModel(env.REWARD_CLAIM_MODEL),
    },
    operator: {
      address: readString(env.CHAIN_OPERATOR_ADDRESS),
      privateKeyPresent: normalizeString(env.CHAIN_OPERATOR_PRIVATE_KEY) !== null,
      gasLimitMultiplierBps: readInteger(env.CHAIN_GAS_LIMIT_MULTIPLIER_BPS, null),
    },
  };
}

export function validateContractIntegrationConfig(
  config: ContractIntegrationConfig,
  options: { verifyArtifactFiles?: boolean } = {}
): ContractConfigIssue[] {
  const issues: ContractConfigIssue[] = [];
  const verifyArtifactFiles = options.verifyArtifactFiles ?? false;
  const chainAccessRequested = config.enabled || config.readOnlyEnabled || config.indexer.enabled || config.receipt.enabled || config.mainlineWritesEnabled;

  function requireField(key: string, value: string | null, message: string) {
    if (!value) {
      issues.push({ severity: 'error', key, message });
    }
  }

  if (chainAccessRequested) {
    requireField('CHAIN_ID', config.chainId, 'CHAIN_ID is required when chain integration is enabled');
    requireField('CHAIN_RPC_URL', config.rpcUrl, 'CHAIN_RPC_URL or RPC_URL is required when chain integration is enabled');
    requireField('TOKEN_ADDRESS', config.token.address, 'TOKEN_ADDRESS is required when chain integration is enabled');
    requireField('LOCK_VAULT_ADDRESS', config.lockVault.address, 'LOCK_VAULT_ADDRESS is required when chain integration is enabled');
    requireField('ORACLE_ADDRESS', config.oracle.address, 'ORACLE_ADDRESS is required when chain integration is enabled');
    if (config.rewardClaim.model === 'distributor') {
      requireField(
        'REWARD_DISTRIBUTOR_ADDRESS',
        config.rewardDistributor.address,
        'REWARD_DISTRIBUTOR_ADDRESS is required when REWARD_CLAIM_MODEL=distributor'
      );
    }
  }

  if (config.mainlineWritesEnabled && config.rewardClaim.model === 'legacy_stub') {
    issues.push({
      severity: 'error',
      key: 'REWARD_CLAIM_MODEL',
      message: 'Production chain writes require REWARD_CLAIM_MODEL=merkle or distributor',
    });
  }

  if (config.walletBinding.enabled && !config.walletBinding.messageDomain) {
    issues.push({
      severity: 'error',
      key: 'WALLET_BINDING_MESSAGE_DOMAIN',
      message: 'WALLET_BINDING_MESSAGE_DOMAIN is required when wallet binding is enabled',
    });
  }

  if (config.receipt.enabled && config.receipt.requiredConfirmations <= 0) {
    issues.push({
      severity: 'error',
      key: 'RECEIPT_REQUIRED_CONFIRMATIONS',
      message: 'RECEIPT_REQUIRED_CONFIRMATIONS must be greater than zero',
    });
  }

  if (config.indexer.enabled && config.indexer.confirmations <= 0) {
    issues.push({
      severity: 'error',
      key: 'CHAIN_INDEXER_CONFIRMATIONS',
      message: 'CHAIN_INDEXER_CONFIRMATIONS must be greater than zero',
    });
  }

  if (config.mainlineWritesEnabled && !config.operator.privateKeyPresent) {
    issues.push({
      severity: 'error',
      key: 'CHAIN_OPERATOR_PRIVATE_KEY',
      message: 'Mainline writes are enabled but no operator private key is configured yet',
    });
  }

  if (verifyArtifactFiles) {
    const artifactStatuses = getContractArtifactStatuses(config);
    for (const artifact of artifactStatuses) {
      if (chainAccessRequested && !artifact.exists) {
        issues.push({
          severity: 'error',
          key: `${artifact.role.toUpperCase()}_ABI_PATH`,
          message: `ABI artifact not found at ${artifact.path}`,
        });
      }
    }
  }

  return issues;
}

export function getContractArtifactStatuses(config: ContractIntegrationConfig): ContractArtifactStatus[] {
  return [
    {
      role: 'lock_vault',
      path: config.abi.lockVault,
      resolvedPath: buildResolvedPath(config.abi.lockVault),
      exists: fs.existsSync(buildResolvedPath(config.abi.lockVault)),
    },
    {
      role: 'oracle',
      path: config.abi.oracle,
      resolvedPath: buildResolvedPath(config.abi.oracle),
      exists: fs.existsSync(buildResolvedPath(config.abi.oracle)),
    },
    {
      role: 'reward_distributor',
      path: config.abi.rewardDistributor,
      resolvedPath: buildResolvedPath(config.abi.rewardDistributor),
      exists: fs.existsSync(buildResolvedPath(config.abi.rewardDistributor)),
    },
  ];
}

export function getContractIntegrationDiagnostics(
  config: ContractIntegrationConfig,
  options: { verifyArtifactFiles?: boolean } = {}
): ContractConfigDiagnostics {
  const issues = validateContractIntegrationConfig(config, options);
  const artifactStatuses = getContractArtifactStatuses(config);
  const hasFatalIssues = issues.some((issue) => issue.severity === 'error');
  const chainAccessRequested = config.enabled || config.readOnlyEnabled || config.indexer.enabled || config.receipt.enabled || config.mainlineWritesEnabled;

  return {
    issues,
    abiArtifacts: artifactStatuses,
    readyForReads: !hasFatalIssues && chainAccessRequested && Boolean(config.rpcUrl),
    readyForIndexer: !hasFatalIssues && config.indexer.enabled && Boolean(config.rpcUrl),
    readyForWrites: !hasFatalIssues && config.mainlineWritesEnabled && Boolean(config.operator.privateKeyPresent) && Boolean(config.rpcUrl),
  };
}

export function loadValidatedContractIntegrationConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: { verifyArtifactFiles?: boolean } = {}
): ContractIntegrationConfig {
  const config = loadContractIntegrationConfig(env);
  const issues = validateContractIntegrationConfig(config, options);
  const fatalIssues = issues.filter((issue) => issue.severity === 'error');

  if (fatalIssues.length > 0) {
    throw new ContractConfigError(fatalIssues);
  }

  return config;
}
