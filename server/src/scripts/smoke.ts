type StepStatus = 'pass' | 'fail';
type HttpMethod = 'GET' | 'POST' | 'PATCH';

interface SmokeUser {
  email: string;
  password: string;
  token: string;
  userId: string;
}

interface SmokeConfig {
  apiBaseUrl: string;
  runId: string;
  password: string;
  adminEmail: string;
  adminPassword: string;
  depositAmount: string;
  riskDepositAmount: string;
}

interface ApiResult {
  status: number;
  body: unknown;
  url: string;
  durationMs: number;
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
  const runId = requiredEnv('SMOKE_RUN_ID', Date.now().toString());
  return {
    apiBaseUrl: normalizeBaseUrl(requiredEnv('API_BASE_URL', 'http://127.0.0.1:4000')),
    runId,
    password: requiredEnv('SMOKE_PASSWORD', 'Password123!'),
    adminEmail: requiredEnv('SMOKE_ADMIN_EMAIL', 'admin@example.com'),
    adminPassword: requiredEnv('SMOKE_ADMIN_PASSWORD', 'Password123!'),
    depositAmount: requiredEnv('SMOKE_DEPOSIT_AMOUNT', '1000'),
    riskDepositAmount: requiredEnv('SMOKE_RISK_DEPOSIT_AMOUNT', '2000000'),
  };
}

function smokeEmail(role: string, runId: string): string {
  const safeRunId = runId.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 48);
  return `rc1-${role}-${safeRunId}@example.com`;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function stringValue(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value) {
    throw new Error(`${label}.${key} must be a non-empty string`);
  }
  return value;
}

function numberValue(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error(`${label}.${key} must be a number`);
}

function dataObject(body: unknown, label: string): Record<string, unknown> {
  const root = objectValue(body, label);
  return objectValue(root.data, `${label}.data`);
}

function errorCode(body: unknown): string | null {
  try {
    const root = objectValue(body, 'error response');
    const error = objectValue(root.error, 'error response.error');
    return typeof error.code === 'string' ? error.code : null;
  } catch {
    return null;
  }
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

async function requestJson(
  config: SmokeConfig,
  method: HttpMethod,
  path: string,
  options: {
    token?: string;
    body?: Record<string, unknown>;
    expectedStatuses?: number[];
  } = {}
): Promise<ApiResult> {
  const url = new URL(path, `${config.apiBaseUrl}/`).toString();
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const init: RequestInit = {
    method,
    headers,
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new SmokeHttpError(`Request failed: ${method} ${path}`, {
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

  const result: ApiResult = {
    status: response.status,
    body,
    url,
    durationMs: Date.now() - started,
  };

  const expectedStatuses = options.expectedStatuses || [200];
  if (!expectedStatuses.includes(response.status)) {
    throw new SmokeHttpError(`Unexpected status for ${method} ${path}`, {
      url,
      expected_statuses: expectedStatuses,
      actual_status: response.status,
      response: body,
    });
  }

  return result;
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

async function registerUser(config: SmokeConfig, user: SmokeUser) {
  const response = await requestJson(config, 'POST', '/v1/auth/register', {
    body: { email: user.email, password: user.password },
    expectedStatuses: [201],
  });
  const data = dataObject(response.body, 'register response');
  const apiUser = objectValue(data.user, 'register response.data.user');
  user.token = stringValue(data, 'token', 'register response.data');
  user.userId = stringValue(apiUser, 'id', 'register response.data.user');
  return {
    email: user.email,
    user_id: user.userId,
    status_code: response.status,
  };
}

async function loginUser(config: SmokeConfig, user: SmokeUser) {
  const response = await requestJson(config, 'POST', '/v1/auth/login', {
    body: { email: user.email, password: user.password },
    expectedStatuses: [200],
  });
  const data = dataObject(response.body, 'login response');
  const apiUser = objectValue(data.user, 'login response.data.user');
  user.token = stringValue(data, 'token', 'login response.data');
  user.userId = stringValue(apiUser, 'id', 'login response.data.user');
  return {
    email: user.email,
    user_id: user.userId,
    status_code: response.status,
  };
}

async function getCurrentWave(config: SmokeConfig): Promise<number> {
  const response = await requestJson(config, 'GET', '/v1/waves/current');
  const data = dataObject(response.body, 'current wave response');
  const waveId = numberValue(data, 'wave_id', 'current wave response.data');
  assert(data.status === 'live', `Current wave must be live for smoke deposits; got ${String(data.status)}`);
  return waveId;
}

function findRewardForSource(rewards: unknown[], sourceUserId: string, label: string): Record<string, unknown> {
  const match = rewards
    .map((reward) => objectValue(reward, label))
    .find((reward) => reward.source_user_id === sourceUserId && reward.status === 'approved');
  assert(match, `No approved reward found for source user ${sourceUserId}`);
  return match;
}

function findRiskFlag(flags: unknown[], positionId: string): Record<string, unknown> {
  const match = flags
    .map((flag) => objectValue(flag, 'risk flag'))
    .find((flag) => (
      flag.entity_type === 'position'
      && flag.entity_id === positionId
      && flag.flag_type === 'high_value_first_lock'
      && ['open', 'reviewing'].includes(String(flag.status))
    ));
  assert(
    match,
    `No open high_value_first_lock flag found for position ${positionId}. Check HIGH_RISK_DEPOSIT_THRESHOLD or increase SMOKE_RISK_DEPOSIT_AMOUNT.`
  );
  return match;
}

async function main() {
  const config = loadConfig();
  const captain: SmokeUser = {
    email: smokeEmail('captain', config.runId),
    password: config.password,
    token: '',
    userId: '',
  };
  const member: SmokeUser = {
    email: smokeEmail('member', config.runId),
    password: config.password,
    token: '',
    userId: '',
  };
  const riskMember: SmokeUser = {
    email: smokeEmail('risk', config.runId),
    password: config.password,
    token: '',
    userId: '',
  };
  const admin: SmokeUser = {
    email: config.adminEmail,
    password: config.adminPassword,
    token: '',
    userId: '',
  };

  const ids: Record<string, string | number> = {};
  let failed = false;

  try {
    await runStep('health', async () => {
      const response = await requestJson(config, 'GET', '/health');
      const body = objectValue(response.body, 'health response');
      assert(body.status === 'ok', `Expected health status ok; got ${String(body.status)}`);
      return { status_code: response.status, service: body.service, status: body.status };
    });

    await runStep('readiness', async () => {
      const response = await requestJson(config, 'GET', '/ready');
      const body = objectValue(response.body, 'readiness response');
      assert(body.status === 'ready', `Expected readiness status ready; got ${String(body.status)}`);
      return { status_code: response.status, database: body.database, status: body.status };
    });

    await runStep('register captain', () => registerUser(config, captain));
    await runStep('register member', () => registerUser(config, member));
    await runStep('register risk member', () => registerUser(config, riskMember));
    await runStep('login captain', () => loginUser(config, captain));
    await runStep('login admin', () => loginUser(config, admin));

    let waveId = 0;
    await runStep('current wave', async () => {
      waveId = await getCurrentWave(config);
      ids.wave_id = waveId;
      return { wave_id: waveId };
    });

    await runStep('claim pass', async () => {
      const response = await requestJson(config, 'POST', `/v1/waves/${waveId}/passes`, {
        token: captain.token,
      });
      const data = dataObject(response.body, 'claim pass response');
      ids.pass_id = stringValue(data, 'id', 'claim pass response.data');
      return { status_code: response.status, pass_id: ids.pass_id };
    });

    let squadId = 0;
    await runStep('create squad', async () => {
      const response = await requestJson(config, 'POST', `/v1/waves/${waveId}/squads`, {
        token: captain.token,
        body: { name: `RC1 Smoke ${config.runId}` },
        expectedStatuses: [201],
      });
      const data = dataObject(response.body, 'create squad response');
      const squad = objectValue(data.squad, 'create squad response.data.squad');
      squadId = numberValue(squad, 'id', 'create squad response.data.squad');
      ids.squad_id = squadId;
      return {
        status_code: response.status,
        squad_id: squadId,
        squad_status: squad.status,
      };
    });

    await runStep('join squad', async () => {
      const response = await requestJson(config, 'POST', `/v1/waves/${waveId}/squads/${squadId}/join`, {
        token: member.token,
        expectedStatuses: [201],
      });
      const data = dataObject(response.body, 'join squad response');
      ids.member_squad_member_id = numberValue(data, 'id', 'join squad response.data');
      return {
        status_code: response.status,
        member_squad_member_id: ids.member_squad_member_id,
        member_status: data.status,
      };
    });

    await runStep('confirm referral', async () => {
      const response = await requestJson(config, 'POST', '/v1/referrals/confirm', {
        token: member.token,
        body: { inviterEmail: captain.email },
      });
      const data = dataObject(response.body, 'confirm referral response');
      return { status_code: response.status, referral_status: data.status };
    });

    await runStep('deposit precheck', async () => {
      const response = await requestJson(config, 'POST', `/v1/waves/${waveId}/deposit-precheck`, {
        token: member.token,
      });
      const data = dataObject(response.body, 'deposit precheck response');
      assert(data.ok === true, `Expected deposit precheck ok=true; got ${String(data.ok)}`);
      return { status_code: response.status, ok: data.ok, wave_status: data.wave_status };
    });

    await runStep('deposit', async () => {
      const response = await requestJson(config, 'POST', `/v1/waves/${waveId}/deposit`, {
        token: member.token,
        body: { amount: config.depositAmount },
        expectedStatuses: [201],
      });
      const data = dataObject(response.body, 'deposit response');
      ids.member_position_id = stringValue(data, 'id', 'deposit response.data');
      assert(data.qualifies_for_activation === true, 'Expected member deposit to qualify for activation');
      return {
        status_code: response.status,
        position_id: ids.member_position_id,
        amount_raw: data.amount_raw,
        qualifies_for_activation: data.qualifies_for_activation,
      };
    });

    await runStep('reward summary/list', async () => {
      const summaryResponse = await requestJson(config, 'GET', '/v1/rewards/summary', {
        token: captain.token,
      });
      const listResponse = await requestJson(config, 'GET', '/v1/rewards?status=approved', {
        token: captain.token,
      });
      const summary = dataObject(summaryResponse.body, 'reward summary response');
      const rewards = arrayValue(objectValue(listResponse.body, 'reward list response').data, 'reward list response.data');
      const reward = findRewardForSource(rewards, member.userId, 'reward list item');
      ids.reward_ledger_id = stringValue(reward, 'id', 'reward list item');
      return {
        summary,
        approved_count: rewards.length,
        reward_ledger_id: ids.reward_ledger_id,
      };
    });

    await runStep('reward claim', async () => {
      const response = await requestJson(config, 'POST', `/v1/rewards/${ids.reward_ledger_id}/claim`, {
        token: captain.token,
      });
      const data = dataObject(response.body, 'reward claim response');
      assert(data.status === 'claimed', `Expected reward status claimed; got ${String(data.status)}`);
      return { status_code: response.status, reward_ledger_id: ids.reward_ledger_id, status: data.status };
    });

    await runStep('risk referral setup', async () => {
      const response = await requestJson(config, 'POST', '/v1/referrals/confirm', {
        token: riskMember.token,
        body: { inviterEmail: captain.email },
      });
      const data = dataObject(response.body, 'risk referral response');
      return { status_code: response.status, referral_status: data.status };
    });

    await runStep('risk deposit', async () => {
      const response = await requestJson(config, 'POST', `/v1/waves/${waveId}/deposit`, {
        token: riskMember.token,
        body: { amount: config.riskDepositAmount },
        expectedStatuses: [201],
      });
      const data = dataObject(response.body, 'risk deposit response');
      ids.risk_position_id = stringValue(data, 'id', 'risk deposit response.data');
      assert(data.qualifies_for_activation === true, 'Expected risk deposit to qualify for activation');
      return {
        status_code: response.status,
        position_id: ids.risk_position_id,
        amount_raw: data.amount_raw,
        qualifies_for_activation: data.qualifies_for_activation,
      };
    });

    await runStep('risk flag lookup', async () => {
      const response = await requestJson(config, 'GET', '/v1/risk/flags?entity_type=position&status=open', {
        token: admin.token,
      });
      const flags = arrayValue(objectValue(response.body, 'risk flag list response').data, 'risk flag list response.data');
      const flag = findRiskFlag(flags, String(ids.risk_position_id));
      ids.risk_flag_id = stringValue(flag, 'id', 'risk flag');
      return {
        status_code: response.status,
        risk_flag_id: ids.risk_flag_id,
        flag_type: flag.flag_type,
        status: flag.status,
      };
    });

    await runStep('risk reward lookup', async () => {
      const response = await requestJson(config, 'GET', '/v1/rewards?status=approved', {
        token: captain.token,
      });
      const rewards = arrayValue(objectValue(response.body, 'risk reward list response').data, 'risk reward list response.data');
      const reward = findRewardForSource(rewards, riskMember.userId, 'risk reward list item');
      ids.risk_reward_ledger_id = stringValue(reward, 'id', 'risk reward list item');
      return {
        status_code: response.status,
        risk_reward_ledger_id: ids.risk_reward_ledger_id,
      };
    });

    await runStep('risk block', async () => {
      const response = await requestJson(config, 'POST', `/v1/rewards/${ids.risk_reward_ledger_id}/claim`, {
        token: captain.token,
        expectedStatuses: [409],
      });
      const code = errorCode(response.body);
      assert(code === 'RISK_REVIEW_REQUIRED', `Expected RISK_REVIEW_REQUIRED; got ${String(code)}`);
      return { status_code: response.status, error_code: code };
    });

    await runStep('risk resolve', async () => {
      const response = await requestJson(config, 'PATCH', `/v1/risk/flags/${ids.risk_flag_id}`, {
        token: admin.token,
        body: { status: 'resolved', note: `Resolved by RC1 smoke ${config.runId}` },
      });
      const data = dataObject(response.body, 'risk resolve response');
      assert(data.status === 'resolved', `Expected risk flag status resolved; got ${String(data.status)}`);
      return { status_code: response.status, risk_flag_id: ids.risk_flag_id, status: data.status };
    });

    await runStep('claim retry after risk resolve', async () => {
      const response = await requestJson(config, 'POST', `/v1/rewards/${ids.risk_reward_ledger_id}/claim`, {
        token: captain.token,
      });
      const data = dataObject(response.body, 'risk retry claim response');
      assert(data.status === 'claimed', `Expected reward status claimed after risk resolution; got ${String(data.status)}`);
      return { status_code: response.status, reward_ledger_id: ids.risk_reward_ledger_id, status: data.status };
    });
  } catch {
    failed = true;
  } finally {
    const finishedAt = new Date();
    const report = {
      status: failed ? 'fail' : 'pass',
      api_base_url: config.apiBaseUrl,
      run_id: config.runId,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      accounts: {
        captain: { email: captain.email, user_id: captain.userId || null },
        member: { email: member.email, user_id: member.userId || null },
        risk_member: { email: riskMember.email, user_id: riskMember.userId || null },
        admin: { email: admin.email, user_id: admin.userId || null },
      },
      ids,
      steps,
      stub_boundaries: [
        'deposit records an off-chain position through the existing API stub',
        'reward claim marks a ledger claimed through the existing API stub',
        'risk review is verified through risk_flags state',
      ],
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
