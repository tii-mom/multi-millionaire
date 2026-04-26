import dotenv from 'dotenv';

dotenv.config();

type Profile = 'local' | 'staging' | 'production';
type CheckStatus = 'present' | 'missing' | 'invalid';

interface EnvCheck {
  name: string;
  hint: string;
  validate?: (value: string, profile: Profile) => string | null;
}

interface CheckResult {
  name: string;
  status: CheckStatus;
  hint: string;
  message?: string;
}

interface CheckGroup {
  name: 'base-api' | 'production-chain' | 'canary-audit';
  required: CheckResult[];
  recommended: CheckResult[];
}

const defaultSecrets = new Set(['secret', 'supersecretjwt']);
const placeholderPattern = /^(<.*>|.*example.*|.*placeholder.*|.*test.*address.*)$/i;

function normalizeProfile(raw: string | undefined): Profile {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'production' || value === 'prod') return 'production';
  if (value === 'staging' || value === 'stage') return 'staging';
  if (value === 'local' || value === 'development' || value === 'dev' || value === 'test') return 'local';
  return 'local';
}

function hasValue(name: string): boolean {
  return !!process.env[name]?.trim();
}

function validateNodeEnv(value: string, profile: Profile): string | null {
  const normalized = normalizeProfile(value);
  if (normalized !== profile) {
    return `NODE_ENV=${value} does not match requested profile ${profile}`;
  }
  return null;
}

function validateDatabaseUrl(value: string): string | null {
  if (!/^postgres(ql)?:\/\//.test(value)) {
    return 'DATABASE_URL must be a PostgreSQL connection string';
  }
  return null;
}

function validateJwtSecret(value: string, profile: Profile): string | null {
  if ((profile === 'staging' || profile === 'production') && defaultSecrets.has(value)) {
    return 'JWT_SECRET must not use the development default in staging or production';
  }
  if (value.length < 16) {
    return 'JWT_SECRET should be at least 16 characters';
  }
  return null;
}

function validateInteger(value: string): string | null {
  if (!/^\d+$/.test(value)) {
    return 'Value must be a whole number';
  }
  return null;
}

function validatePositiveInteger(value: string): string | null {
  const integer = validateInteger(value);
  if (integer) return integer;
  return BigInt(value) > BigInt(0) ? null : 'Value must be greater than zero';
}

function validateNonEmptyList(value: string): string | null {
  return value.split(',').map((item) => item.trim()).filter(Boolean).length > 0
    ? null
    : 'Provide at least one value';
}

function validateNumericList(value: string): string | null {
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) {
    return 'Provide at least one numeric value';
  }
  return items.every((item) => /^\d+$/.test(item)) ? null : 'All list values must be whole numbers';
}

function validateUrlList(value: string): string | null {
  const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) {
    return 'Provide at least one allowed origin';
  }
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return `Origin ${origin} must use http or https`;
      }
    } catch {
      return `Origin ${origin} is not a valid URL`;
    }
  }
  return null;
}

function validateUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return 'URL must use http or https';
    }
    return null;
  } catch {
    return 'Value must be a valid URL';
  }
}

function deriveToncenterV3TransactionsUrl(rpcUrl: string | undefined): string | null {
  if (!rpcUrl?.trim()) {
    return null;
  }
  try {
    const url = new URL(rpcUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'toncenter.com' && !hostname.endsWith('.toncenter.com')) {
      return null;
    }
    return `${url.origin}/api/v3/transactions`;
  } catch {
    return null;
  }
}

function validateTransactionsApiSource(): string | null {
  const explicit = process.env.TON_TRANSACTIONS_API_URL?.trim();
  if (explicit) {
    return validateUrl(explicit);
  }
  if (deriveToncenterV3TransactionsUrl(process.env.CHAIN_RPC_URL)) {
    return null;
  }
  return 'Production TON verification requires TON_TRANSACTIONS_API_URL or a toncenter.com CHAIN_RPC_URL that maps to /api/v3/transactions';
}

function validateBoolean(value: string): string | null {
  if (!['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'].includes(value.trim().toLowerCase())) {
    return 'Value must be a boolean';
  }
  return null;
}

function isTruthy(value: string | undefined): boolean {
  return !!value && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function validateProductionValue(value: string, profile: Profile): string | null {
  if (profile === 'production' && placeholderPattern.test(value.trim())) {
    return 'Production value must not be a placeholder or test value';
  }
  return null;
}

function validateContractValue(value: string, profile: Profile): string | null {
  return validateProductionValue(value, profile);
}

function validateReceiptVerifier(value: string, profile: Profile): string | null {
  const normalized = value.trim().toLowerCase();
  if (profile === 'production' && ['test', 'disabled', ''].includes(normalized)) {
    return 'Production receipt verifier must not be test or disabled';
  }
  return null;
}

function validateWalletSignatureMode(value: string, profile: Profile): string | null {
  const normalized = value.trim().toLowerCase();
  if (profile === 'production' && ['test', 'disabled', ''].includes(normalized)) {
    return 'Production wallet signature mode must not be test or disabled';
  }
  return null;
}

function validateProductionAdminEmails(value: string, profile: Profile): string | null {
  if (profile === 'production' && !isTruthy(process.env.ADMIN_OPERATIONS_ENABLED)) {
    return null;
  }
  const placeholder = validateProductionValue(value, profile);
  if (placeholder) return placeholder;
  if (profile === 'production' && value.split(',').some((email) => email.trim().endsWith('@example.com'))) {
    return 'Production admin emails must not use example.com addresses';
  }
  return null;
}

function validateTrue(value: string): string | null {
  return isTruthy(value) ? null : 'Value must be true';
}

const baseRequired: EnvCheck[] = [
  { name: 'NODE_ENV', hint: 'Set to local/development, staging, or production.', validate: validateNodeEnv },
  { name: 'DATABASE_URL', hint: 'PostgreSQL connection string for the API database.', validate: (value) => validateDatabaseUrl(value) },
  { name: 'JWT_SECRET', hint: 'JWT signing secret shared by API instances.', validate: validateJwtSecret },
];

const commonRecommended: EnvCheck[] = [
  { name: 'PORT', hint: 'API listen port. Default local server uses 4000.', validate: (value) => validateInteger(value) },
  { name: 'HIGH_RISK_DEPOSIT_THRESHOLD', hint: 'Required for the risk smoke path to auto-create high-value first-lock flags.', validate: (value) => validateInteger(value) },
  { name: 'API_BASE_URL', hint: 'Smoke target URL. This is needed when running npm run smoke.', validate: (value) => validateUrl(value) },
];

const stagingRequired: EnvCheck[] = [
  ...baseRequired,
  { name: 'PORT', hint: 'Staging API listen port.', validate: (value) => validateInteger(value) },
  { name: 'CORS_ALLOWED_ORIGINS', hint: 'Comma-separated staging frontend origins allowed by CORS.', validate: (value) => validateUrlList(value) },
  { name: 'HIGH_RISK_DEPOSIT_THRESHOLD', hint: 'Risk threshold used by the smoke high-value deposit path.', validate: (value) => validateInteger(value) },
];

const contractEnv: EnvCheck[] = [
  { name: 'CHAIN_ID', hint: 'Target chain identifier. Current RC1 smoke records off-chain stubs only.', validate: validateContractValue },
  { name: 'CHAIN_RPC_URL', hint: 'RPC endpoint for chain-backed lock/settlement integration.', validate: (value) => validateUrl(value) },
  { name: 'TOKEN_ADDRESS', hint: 'Token contract address for future on-chain lock integration.', validate: validateContractValue },
  { name: 'LOCK_VAULT_ADDRESS', hint: 'Lock vault contract address. Currently documented as a stub boundary.', validate: validateContractValue },
  { name: 'ORACLE_ADDRESS', hint: 'Oracle contract address. Currently documented as a stub boundary.', validate: validateContractValue },
  { name: 'REWARD_DISTRIBUTOR_ADDRESS', hint: 'Reward distributor address. Current claim API is an off-chain status update stub.', validate: validateContractValue },
];

const productionMerkleContractEnv: EnvCheck[] = [
  { name: 'CHAIN_ID', hint: 'Target production chain identifier.', validate: validateContractValue },
  { name: 'CHAIN_RPC_URL', hint: 'Production RPC endpoint for receipt and claim-event verification.', validate: (value) => validateUrl(value) },
  { name: 'TOKEN_ADDRESS', hint: 'Production reward/deposit token address.', validate: validateContractValue },
  { name: 'TOKEN_DECIMALS', hint: '72H token decimals. Must be 9 for the audited LockVault math.', validate: (value) => value.trim() === '9' ? null : 'TOKEN_DECIMALS must be 9' },
  { name: 'LOCK_VAULT_ADDRESS', hint: 'Production lock vault contract address.', validate: validateContractValue },
  { name: 'LOCK_VAULT_JETTON_WALLET_ADDRESS', hint: 'Jetton wallet owned by LockVault, derived from TOKEN_ADDRESS + LOCK_VAULT_ADDRESS.', validate: validateContractValue },
  { name: 'MERKLE_CLAIM_ADDRESS', hint: 'Production MerkleClaim contract address when REWARD_CLAIM_MODEL=merkle.', validate: validateContractValue },
  { name: 'REWARD_JETTON_WALLET_ADDRESS', hint: 'Jetton wallet owned by MerkleClaim, derived from TOKEN_ADDRESS + MERKLE_CLAIM_ADDRESS.', validate: validateContractValue },
];

const productionChainRecommended: EnvCheck[] = [
  { name: 'CHAIN_INTEGRATION_ENABLED', hint: 'Set true only after production chain resources are ready.', validate: (value) => validateBoolean(value) },
  { name: 'CHAIN_READ_ONLY_ENABLED', hint: 'Set true only after production RPC and read-only checks are configured.', validate: (value) => validateBoolean(value) },
  { name: 'CHAIN_INDEXER_ENABLED', hint: 'Set true only after event parsing, finality, and backlog monitoring are configured.', validate: (value) => validateBoolean(value) },
  { name: 'CHAIN_MAINLINE_WRITES_ENABLED', hint: 'Must remain false until production chain writes are approved.', validate: (value) => validateBoolean(value) },
  { name: 'WALLET_BINDING_ENABLED', hint: 'Enable only when wallet signature verification is configured.', validate: (value) => validateBoolean(value) },
  { name: 'WALLET_BINDING_MESSAGE_DOMAIN', hint: 'Domain included in wallet binding signable messages.', validate: validateProductionValue },
  { name: 'WALLET_SIGNATURE_MODE', hint: 'Production wallet signature verifier implementation. Must not be test or disabled.', validate: validateWalletSignatureMode },
  { name: 'RECEIPT_VERIFICATION_ENABLED', hint: 'Enable only when chain receipt verification is configured.', validate: (value) => validateBoolean(value) },
  { name: 'CHAIN_RECEIPT_VERIFIER', hint: 'Production receipt verifier implementation. Must not be test or disabled.', validate: validateReceiptVerifier },
  { name: 'MERKLE_CLAIM_VERIFIER', hint: 'Production Merkle claim receipt verifier implementation.', validate: validateProductionValue },
  { name: 'TON_TRANSACTIONS_API_URL', hint: 'TON transactions API endpoint. Required for non-Toncenter production receipt or claim verification.', validate: (value) => validateUrl(value) },
  { name: 'CHAIN_CANARY_ALLOWLIST', hint: 'Comma-separated wallet allowlist for limited production chain canary.', validate: validateNonEmptyList },
  { name: 'CHAIN_CANARY_MAX_AMOUNT_RAW', hint: 'Maximum raw token amount allowed for a production mutating canary.', validate: validatePositiveInteger },
  { name: 'CHAIN_CANARY_WAVE_IDS', hint: 'Comma-separated wave ids allowed for production mutating canary.', validate: validateNumericList },
  { name: 'MAINNET_DEPLOYMENT_EVIDENCE_RECORDED', hint: 'Set true only after mainnet contract deployment tx/LT/getter/code-hash evidence is recorded.', validate: validateTrue },
  { name: 'CONTRACTS_EXTERNAL_AUDIT_APPROVED', hint: 'Set true only after independent review approves the audit-remediated contracts for the planned limit.', validate: validateTrue },
  { name: 'PRODUCTION_CANARY_APPROVED', hint: 'Set true only for an approved named-operator, allowlisted-wallet, fixed-amount canary window.', validate: validateTrue },
  { name: 'MAINNET_CANARY_EVIDENCE_URL', hint: 'Evidence URL or artifact path for the approved mainnet canary run.', validate: validateProductionValue },
  { name: 'REWARD_CLAIM_MODEL', hint: 'Production reward claim model. Use merkle for limited gray launch.', validate: validateProductionValue },
  { name: 'ORACLE_ADDRESS', hint: 'Optional external oracle contract address. Current LockVault can only use staged owner price for testnet/canary.', validate: validateContractValue },
  { name: 'REWARD_DISTRIBUTOR_ADDRESS', hint: 'Only required when REWARD_CLAIM_MODEL=distributor.', validate: validateContractValue },
  { name: 'RECEIPT_REQUIRED_CONFIRMATIONS', hint: 'Finality confirmations required before applying receipts.', validate: (value) => validateInteger(value) },
];

const profileChecks: Record<Profile, { required: EnvCheck[]; recommended: EnvCheck[] }> = {
  local: {
    required: baseRequired,
    recommended: [
      ...commonRecommended,
      { name: 'CORS_ALLOWED_ORIGINS', hint: 'Local frontend origins. If omitted, the API falls back to localhost defaults.', validate: (value) => validateUrlList(value) },
      ...contractEnv,
    ],
  },
  staging: {
    required: stagingRequired,
    recommended: [
      { name: 'API_BASE_URL', hint: 'Staging API base URL used by npm run smoke.', validate: (value) => validateUrl(value) },
      ...contractEnv,
    ],
  },
  production: {
    required: stagingRequired,
    recommended: [
      { name: 'API_BASE_URL', hint: 'Production API base URL for manual smoke checks only.', validate: (value) => validateUrl(value) },
      { name: 'ADMIN_OPERATIONS_ENABLED', hint: 'Set false for the decentralized/no-admin production mode.', validate: (value) => validateBoolean(value) },
      { name: 'ADMIN_EMAILS', hint: 'Comma-separated admin emails. May be empty when ADMIN_OPERATIONS_ENABLED=false.', validate: validateProductionAdminEmails },
      { name: 'RISK_REVIEW_ENABLED', hint: 'Set false when reward/deposit flow must not depend on manual risk review.', validate: (value) => validateBoolean(value) },
      ...productionMerkleContractEnv,
      ...productionChainRecommended,
    ],
  },
};

function runCheck(check: EnvCheck, profile: Profile): CheckResult {
  if (!hasValue(check.name)) {
    return {
      name: check.name,
      status: 'missing',
      hint: check.hint,
    };
  }
  const value = process.env[check.name]!.trim();
  const validationMessage = check.validate?.(value, profile);
  if (validationMessage) {
    return {
      name: check.name,
      status: 'invalid',
      hint: check.hint,
      message: validationMessage,
    };
  }
  return {
    name: check.name,
    status: 'present',
    hint: check.hint,
  };
}

function productionConsistencyChecks(profile: Profile): CheckResult[] {
  if (profile !== 'production') return [];

  const checks: CheckResult[] = [];
  const chainWrites = isTruthy(process.env.CHAIN_MAINLINE_WRITES_ENABLED);
  const receiptEnabled = isTruthy(process.env.RECEIPT_VERIFICATION_ENABLED);
  const walletEnabled = isTruthy(process.env.WALLET_BINDING_ENABLED);
  const verifier = (process.env.CHAIN_RECEIPT_VERIFIER || '').trim().toLowerCase();
  const merkleVerifier = (process.env.MERKLE_CLAIM_VERIFIER || '').trim().toLowerCase();
  const walletVerifier = (process.env.WALLET_SIGNATURE_MODE || '').trim().toLowerCase();
  const publicLaunch = isTruthy(process.env.PRODUCTION_PUBLIC_LAUNCH_ENABLED);
  const needsTransactionsApi = receiptEnabled || verifier === 'ton_rpc' || merkleVerifier === 'ton_rpc' || chainWrites;
  const chainWriteRequired: EnvCheck[] = [
    { name: 'CHAIN_ID', hint: 'Production chain writes require an explicit chain id.', validate: validateContractValue },
    { name: 'CHAIN_RPC_URL', hint: 'Production chain writes require a production RPC endpoint.', validate: (value) => validateUrl(value) },
    { name: 'TOKEN_ADDRESS', hint: 'Production chain writes require the production 72H token address.', validate: validateContractValue },
    { name: 'TOKEN_DECIMALS', hint: 'The audited LockVault math requires 72H token decimals to be 9.', validate: (value) => value.trim() === '9' ? null : 'TOKEN_DECIMALS must be 9' },
    { name: 'LOCK_VAULT_ADDRESS', hint: 'Production chain writes require the deployed mainnet LockVault address.', validate: validateContractValue },
    { name: 'LOCK_VAULT_JETTON_WALLET_ADDRESS', hint: 'Production chain writes require the derived LockVault Jetton wallet address.', validate: validateContractValue },
    { name: 'MERKLE_CLAIM_ADDRESS', hint: 'Production chain writes require the deployed mainnet MerkleClaim address.', validate: validateContractValue },
    { name: 'REWARD_JETTON_WALLET_ADDRESS', hint: 'Production chain writes require the derived MerkleClaim reward Jetton wallet address.', validate: validateContractValue },
    { name: 'WALLET_BINDING_ENABLED', hint: 'Production chain writes require wallet binding to be enabled.', validate: validateTrue },
    { name: 'WALLET_BINDING_MESSAGE_DOMAIN', hint: 'Production ton_proof verification requires the production domain.', validate: validateProductionValue },
    { name: 'WALLET_SIGNATURE_MODE', hint: 'Production chain writes require WALLET_SIGNATURE_MODE=ton_proof.', validate: (value) => value.trim().toLowerCase() === 'ton_proof' ? null : 'WALLET_SIGNATURE_MODE must be ton_proof' },
    { name: 'RECEIPT_VERIFICATION_ENABLED', hint: 'Production chain writes require receipt verification.', validate: validateTrue },
    { name: 'CHAIN_RECEIPT_VERIFIER', hint: 'Production chain writes require CHAIN_RECEIPT_VERIFIER=ton_rpc.', validate: (value) => value.trim().toLowerCase() === 'ton_rpc' ? null : 'CHAIN_RECEIPT_VERIFIER must be ton_rpc' },
    { name: 'MERKLE_CLAIM_VERIFIER', hint: 'Production Merkle claims require MERKLE_CLAIM_VERIFIER=ton_rpc.', validate: (value) => value.trim().toLowerCase() === 'ton_rpc' ? null : 'MERKLE_CLAIM_VERIFIER must be ton_rpc' },
    { name: 'REWARD_CLAIM_MODEL', hint: 'Production reward claim model must be merkle for this release line.', validate: (value) => value.trim().toLowerCase() === 'merkle' ? null : 'REWARD_CLAIM_MODEL must be merkle' },
    { name: 'CHAIN_CANARY_ALLOWLIST', hint: 'Production chain writes require an allowlisted operator wallet.', validate: validateNonEmptyList },
    { name: 'CHAIN_CANARY_MAX_AMOUNT_RAW', hint: 'Production chain writes require a positive canary amount cap.', validate: validatePositiveInteger },
    { name: 'CHAIN_CANARY_WAVE_IDS', hint: 'Production chain writes require explicit canary wave ids.', validate: validateNumericList },
    { name: 'MAINNET_DEPLOYMENT_EVIDENCE_RECORDED', hint: 'Record mainnet tx/LT/getter/code-hash evidence before enabling writes.', validate: validateTrue },
    { name: 'CONTRACTS_EXTERNAL_AUDIT_APPROVED', hint: 'Require independent security review approval before enabling real funds.', validate: validateTrue },
    { name: 'PRODUCTION_CANARY_APPROVED', hint: 'Require an approved canary window before enabling production chain writes.', validate: validateTrue },
    { name: 'MAINNET_CANARY_EVIDENCE_URL', hint: 'Link or path for the approved canary evidence record.', validate: validateProductionValue },
  ];

  if (chainWrites) {
    for (const check of chainWriteRequired) {
      const result = runCheck(check, profile);
      if (result.status !== 'present') {
        checks.push(result);
      }
    }
  }

  if (chainWrites && !receiptEnabled) {
    checks.push({
      name: 'RECEIPT_VERIFICATION_ENABLED',
      status: 'invalid',
      hint: 'Production chain writes require receipt verification.',
      message: 'CHAIN_MAINLINE_WRITES_ENABLED=true requires RECEIPT_VERIFICATION_ENABLED=true',
    });
  }
  if (chainWrites && !walletEnabled) {
    checks.push({
      name: 'WALLET_BINDING_ENABLED',
      status: 'invalid',
      hint: 'Production chain writes require wallet ownership verification.',
      message: 'CHAIN_MAINLINE_WRITES_ENABLED=true requires WALLET_BINDING_ENABLED=true',
    });
  }
  if (chainWrites && ['test', 'disabled', ''].includes(walletVerifier)) {
    checks.push({
      name: 'WALLET_SIGNATURE_MODE',
      status: 'invalid',
      hint: 'Production chain writes require a real wallet signature verifier.',
      message: 'CHAIN_MAINLINE_WRITES_ENABLED=true cannot use test/disabled wallet signature verifier',
    });
  }
  if (chainWrites && ['test', 'disabled', ''].includes(verifier)) {
    checks.push({
      name: 'CHAIN_RECEIPT_VERIFIER',
      status: 'invalid',
      hint: 'Production chain writes require a real receipt verifier.',
      message: 'CHAIN_MAINLINE_WRITES_ENABLED=true cannot use test/disabled receipt verifier',
    });
  }
  if (receiptEnabled && ['test', 'disabled', ''].includes(verifier)) {
    checks.push({
      name: 'CHAIN_RECEIPT_VERIFIER',
      status: 'invalid',
      hint: 'Production receipt verification requires a real receipt verifier.',
      message: 'RECEIPT_VERIFICATION_ENABLED=true cannot use test/disabled receipt verifier',
    });
  }
  if (verifier === 'test') {
    checks.push({
      name: 'CHAIN_RECEIPT_VERIFIER',
      status: 'invalid',
      hint: 'Production runtime must use a real receipt verifier.',
      message: 'Production cannot use CHAIN_RECEIPT_VERIFIER=test',
    });
  }
  if (merkleVerifier === 'test') {
    checks.push({
      name: 'MERKLE_CLAIM_VERIFIER',
      status: 'invalid',
      hint: 'Production Merkle claim receipts require a real verifier.',
      message: 'Production cannot use MERKLE_CLAIM_VERIFIER=test',
    });
  }
  if (walletVerifier === 'test') {
    checks.push({
      name: 'WALLET_SIGNATURE_MODE',
      status: 'invalid',
      hint: 'Production runtime must use a real wallet signature verifier.',
      message: 'Production cannot use WALLET_SIGNATURE_MODE=test',
    });
  }
  if (needsTransactionsApi) {
    const sourceMessage = validateTransactionsApiSource();
    if (sourceMessage) {
      checks.push({
        name: 'TON_TRANSACTIONS_API_URL',
        status: 'invalid',
        hint: 'Set TON_TRANSACTIONS_API_URL to a valid transactions API URL, or use a toncenter.com CHAIN_RPC_URL that maps to /api/v3/transactions.',
        message: sourceMessage,
      });
    }
  }
  if (publicLaunch) {
    if (!hasValue('ORACLE_ADDRESS')) {
      checks.push({
        name: 'ORACLE_ADDRESS',
        status: 'missing',
        hint: 'Public launch requires an audited external oracle address; owner staged price is canary-only.',
      });
    }
    if (!isTruthy(process.env.PRICE_ORACLE_EXTERNAL_AUDIT_APPROVED)) {
      checks.push({
        name: 'PRICE_ORACLE_EXTERNAL_AUDIT_APPROVED',
        status: 'invalid',
        hint: 'Set true only after the external oracle mechanism is independently approved for public launch.',
        message: 'Public launch cannot rely on owner staged price only',
      });
    }
  }

  return checks;
}

function printHuman(profile: Profile, required: CheckResult[], recommended: CheckResult[]) {
  const failures = required.filter((item) => item.status !== 'present');
  const warnings = recommended.filter((item) => item.status !== 'present');
  const status = failures.length === 0 ? 'pass' : 'fail';

  // eslint-disable-next-line no-console
  console.log(`Environment check: ${status}`);
  // eslint-disable-next-line no-console
  console.log(`Profile: ${profile}`);

  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\nRequired fixes:');
    for (const item of failures) {
      // eslint-disable-next-line no-console
      console.log(`- ${item.name}: ${item.status}${item.message ? ` - ${item.message}` : ''}. ${item.hint}`);
    }
  }

  if (warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\nRecommended checks:');
    for (const item of warnings) {
      // eslint-disable-next-line no-console
      console.log(`- ${item.name}: ${item.status}${item.message ? ` - ${item.message}` : ''}. ${item.hint}`);
    }
  }

  if (failures.length === 0 && warnings.length === 0) {
    // eslint-disable-next-line no-console
    console.log('All required and recommended variables are present.');
  }
}

function buildCheckGroups(profile: Profile): CheckGroup[] {
  const checks = profileChecks[profile];
  const productionChecks = productionConsistencyChecks(profile);
  const canaryAuditNames = new Set([
    'CHAIN_CANARY_ALLOWLIST',
    'CHAIN_CANARY_MAX_AMOUNT_RAW',
    'CHAIN_CANARY_WAVE_IDS',
    'MAINNET_DEPLOYMENT_EVIDENCE_RECORDED',
    'CONTRACTS_EXTERNAL_AUDIT_APPROVED',
    'PRODUCTION_CANARY_APPROVED',
    'MAINNET_CANARY_EVIDENCE_URL',
    'PRICE_ORACLE_EXTERNAL_AUDIT_APPROVED',
  ]);

  const baseRequired = checks.required.map((check) => runCheck(check, profile));
  const baseRecommended = checks.recommended
    .filter((check) => !check.name.startsWith('CHAIN_')
      && !check.name.includes('WALLET')
      && !check.name.includes('RECEIPT')
      && !check.name.includes('MERKLE')
      && !check.name.includes('TOKEN')
      && !check.name.includes('LOCK_VAULT')
      && !canaryAuditNames.has(check.name))
    .map((check) => runCheck(check, profile));
  const productionRecommended = checks.recommended
    .filter((check) => !canaryAuditNames.has(check.name))
    .filter((check) => !baseRecommended.some((result) => result.name === check.name))
    .map((check) => runCheck(check, profile));
  const canaryRecommended = checks.recommended
    .filter((check) => canaryAuditNames.has(check.name))
    .map((check) => runCheck(check, profile));
  const canaryRequired = productionChecks.filter((check) => canaryAuditNames.has(check.name));
  const productionRequired = productionChecks.filter((check) => !canaryAuditNames.has(check.name));

  return [
    { name: 'base-api', required: baseRequired, recommended: baseRecommended },
    { name: 'production-chain', required: productionRequired, recommended: productionRecommended },
    { name: 'canary-audit', required: canaryRequired, recommended: canaryRecommended },
  ];
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const profileArg = args.find((arg) => !arg.startsWith('--'));
  const profile = normalizeProfile(profileArg || process.env.NODE_ENV);
  const groups = buildCheckGroups(profile);
  const required = groups.flatMap((group) => group.required);
  const recommended = groups.flatMap((group) => group.recommended);
  const missingRequired = required.filter((item) => item.status !== 'present');
  const result = {
    status: missingRequired.length === 0 ? 'pass' : 'fail',
    profile,
    groups,
    required,
    recommended,
  };

  if (json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(profile, required, recommended);
  }

  process.exitCode = result.status === 'pass' ? 0 : 1;
}

main();
