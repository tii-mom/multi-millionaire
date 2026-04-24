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

const baseRequired: EnvCheck[] = [
  { name: 'NODE_ENV', hint: 'Set to local/development, staging, or production.', validate: validateNodeEnv },
  { name: 'DATABASE_URL', hint: 'PostgreSQL connection string for the API database.', validate: (value) => validateDatabaseUrl(value) },
  { name: 'JWT_SECRET', hint: 'JWT signing secret shared by API instances.', validate: validateJwtSecret },
  { name: 'ADMIN_EMAILS', hint: 'Comma-separated admin emails for risk/admin operations.' },
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
  { name: 'CHAIN_ID', hint: 'Target chain identifier. Current RC1 smoke records off-chain stubs only.' },
  { name: 'CHAIN_RPC_URL', hint: 'RPC endpoint for chain-backed lock/settlement integration.', validate: (value) => validateUrl(value) },
  { name: 'TOKEN_ADDRESS', hint: 'Token contract address for future on-chain lock integration.' },
  { name: 'LOCK_VAULT_ADDRESS', hint: 'Lock vault contract address. Currently documented as a stub boundary.' },
  { name: 'ORACLE_ADDRESS', hint: 'Oracle contract address. Currently documented as a stub boundary.' },
  { name: 'REWARD_DISTRIBUTOR_ADDRESS', hint: 'Reward distributor address. Current claim API is an off-chain status update stub.' },
];

const productionChainRecommended: EnvCheck[] = [
  { name: 'CHAIN_INTEGRATION_ENABLED', hint: 'Set true only after production chain resources are ready.' },
  { name: 'CHAIN_MAINLINE_WRITES_ENABLED', hint: 'Must remain false until production chain writes are approved.' },
  { name: 'WALLET_BINDING_ENABLED', hint: 'Enable only when wallet signature verification is configured.' },
  { name: 'WALLET_BINDING_MESSAGE_DOMAIN', hint: 'Domain included in wallet binding signable messages.' },
  { name: 'RECEIPT_VERIFICATION_ENABLED', hint: 'Enable only when chain receipt verification is configured.' },
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
    required: [
      ...stagingRequired,
      ...contractEnv,
    ],
    recommended: [
      { name: 'API_BASE_URL', hint: 'Production API base URL for manual smoke checks only.', validate: (value) => validateUrl(value) },
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
  const required = checks.required.map((check) => runCheck(check, profile));
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
