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
  const walletVerifier = (process.env.WALLET_SIGNATURE_MODE || '').trim().toLowerCase();

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

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const profileArg = args.find((arg) => !arg.startsWith('--'));
  const profile = normalizeProfile(profileArg || process.env.NODE_ENV);
  const checks = profileChecks[profile];
  const required = [
    ...checks.required.map((check) => runCheck(check, profile)),
    ...productionConsistencyChecks(profile),
  ];
  const recommended = checks.recommended.map((check) => runCheck(check, profile));
  const missingRequired = required.filter((item) => item.status !== 'present');
  const result = {
    status: missingRequired.length === 0 ? 'pass' : 'fail',
    profile,
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
