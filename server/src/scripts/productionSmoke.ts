type StepStatus = 'pass' | 'fail';

interface SmokeConfig {
  apiBaseUrl: string;
  allowChainWrites: boolean;
}

interface StepResult {
  name: string;
  status: StepStatus;
  duration_ms: number;
  details?: unknown;
  error?: {
    message: string;
    details?: unknown;
  };
}

class SmokeHttpError extends Error {
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.name = 'SmokeHttpError';
    this.details = details;
  }
}

const startedAt = new Date();
const steps: StepResult[] = [];

function requiredEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  try {
    const url = new URL(trimmed);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('API_BASE_URL must use http or https');
    }
    return trimmed;
  } catch (error) {
    throw new Error(`Invalid API_BASE_URL "${raw}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

function loadConfig(): SmokeConfig {
  return {
    apiBaseUrl: normalizeBaseUrl(requiredEnv('API_BASE_URL', 'http://127.0.0.1:4000')),
    allowChainWrites: process.env.ALLOW_PRODUCTION_SMOKE_CHAIN_WRITES === 'true',
  };
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function serializeError(error: unknown): { message: string; details?: unknown } {
  if (error instanceof SmokeHttpError) {
    return { message: error.message, details: error.details };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
}

async function requestJson(config: SmokeConfig, path: string): Promise<{ status: number; body: unknown; url: string }> {
  const url = new URL(path, `${config.apiBaseUrl}/`).toString();
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    throw new SmokeHttpError(`Request failed: GET ${path}`, {
      url,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (response.status !== 200) {
    throw new SmokeHttpError(`Unexpected status for GET ${path}`, {
      url,
      expected_status: 200,
      actual_status: response.status,
      response: body,
    });
  }

  return { status: response.status, body, url };
}

async function runStep<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const details = await fn();
    steps.push({
      name,
      status: 'pass',
      duration_ms: Date.now() - started,
      details,
    });
    return details;
  } catch (error) {
    steps.push({
      name,
      status: 'fail',
      duration_ms: Date.now() - started,
      error: serializeError(error),
    });
    throw error;
  }
}

async function main() {
  const config = loadConfig();
  let failed = false;

  try {
    await runStep('health', async () => {
      const response = await requestJson(config, '/health');
      const body = objectValue(response.body, 'health response');
      assert(body.status === 'ok', `Expected health status ok; got ${String(body.status)}`);
      return { status_code: response.status, status: body.status, service: body.service };
    });

    await runStep('readiness', async () => {
      const response = await requestJson(config, '/ready');
      const body = objectValue(response.body, 'readiness response');
      assert(body.status === 'ready', `Expected readiness status ready; got ${String(body.status)}`);
      assert(body.database === 'ok', `Expected readiness database ok; got ${String(body.database)}`);
      return { status_code: response.status, status: body.status, database: body.database };
    });

    await runStep('app bootstrap', async () => {
      const response = await requestJson(config, '/v1/app/bootstrap');
      const body = objectValue(response.body, 'bootstrap response');
      assert('data' in body, 'Expected bootstrap response to include data');
      const data = objectValue(body.data, 'bootstrap response.data');
      const featureFlags = objectValue(data.feature_flags, 'bootstrap response.data.feature_flags');
      const contracts = objectValue(data.contracts, 'bootstrap response.data.contracts');
      const ops = objectValue(data.ops, 'bootstrap response.data.ops');
      const receiptVerifier = objectValue(ops.receipt_verifier, 'bootstrap response.data.ops.receipt_verifier');
      const merkleClaimVerifier = objectValue(ops.merkle_claim_verifier, 'bootstrap response.data.ops.merkle_claim_verifier');
      const chainId = String(contracts.chain_id || '');
      const chainWritesEnabled = featureFlags.chain_mainline_writes_enabled === true;
      const receiptVerificationEnabled = featureFlags.receipt_verification_enabled === true;
      const receiptStatus = String(receiptVerifier.status || '');
      const merkleClaimStatus = String(merkleClaimVerifier.status || '');

      assert(chainId !== 'ton-testnet', 'Production bootstrap must not point at ton-testnet');
      assert(receiptStatus !== 'test', 'Production bootstrap must not expose test receipt verifier');
      assert(merkleClaimStatus !== 'test', 'Production bootstrap must not expose test MerkleClaim verifier');
      if (receiptVerificationEnabled) {
        assert(receiptStatus === 'ton_rpc', `Production receipt verification must use ton_rpc; got ${receiptStatus}`);
      }
      if (merkleClaimStatus && merkleClaimStatus !== 'not_configured') {
        assert(merkleClaimStatus === 'ton_rpc', `Production MerkleClaim verification must use ton_rpc; got ${merkleClaimStatus}`);
      }
      assert(
        !chainWritesEnabled || config.allowChainWrites,
        'Production non-mutating smoke refuses chain_mainline_writes_enabled=true unless ALLOW_PRODUCTION_SMOKE_CHAIN_WRITES=true'
      );
      return {
        status_code: response.status,
        chain_id: chainId,
        chain_mainline_writes_enabled: chainWritesEnabled,
        receipt_verification_enabled: receiptVerificationEnabled,
        receipt_verifier_status: receiptStatus,
        merkle_claim_verifier_status: merkleClaimStatus,
      };
    });

    await runStep('current wave', async () => {
      const response = await requestJson(config, '/v1/waves/current');
      const data = objectValue(objectValue(response.body, 'current wave response').data, 'current wave response.data');
      assert(typeof data.wave_id === 'number' || typeof data.wave_id === 'string', 'Expected current wave data.wave_id');
      return { status_code: response.status, wave_id: data.wave_id, status: data.status };
    });

    await runStep('season war current', async () => {
      const response = await requestJson(config, '/v1/season-war/current');
      const data = objectValue(objectValue(response.body, 'season war current response').data, 'season war current response.data');
      assert(typeof data.seasonId === 'string' && data.seasonId.length > 0, 'Expected season war current data.seasonId');
      assert(typeof data.waveId === 'string' && data.waveId.length > 0, 'Expected season war current data.waveId');
      return { status_code: response.status, season_id: data.seasonId, wave_id: data.waveId, status: data.status };
    });
  } catch {
    failed = true;
  } finally {
    const finishedAt = new Date();
    const report = {
      status: failed ? 'fail' : 'pass',
      api_base_url: config.apiBaseUrl,
      mode: 'production-non-mutating',
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      checked_paths: ['/health', '/ready', '/v1/app/bootstrap', '/v1/waves/current', '/v1/season-war/current'],
      mutation_guard: 'GET-only smoke; does not register, deposit, claim, or call admin endpoints',
      steps,
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = failed ? 1 : 0;
  }
}

main().catch((error) => {
  const finishedAt = new Date();
  const report = {
    status: 'fail',
    mode: 'production-non-mutating',
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    steps,
    error: serializeError(error),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});

export {};
