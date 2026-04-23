import type {
  ApiEnvelope,
  ApiErrorCode,
  ApiErrorEnvelope,
  AdminDashboard,
  AdminReward,
  AdminRiskFlag,
  AdminSquad,
  AdminWave,
  AuthResult,
  BootstrapData,
  CreateSquadResult,
  Position,
  Referral,
  RewardLedger,
  RewardSummary,
  SquadMember,
  SquadLeaderboardRow,
  Wave,
} from "./types";

type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || "";

export class ApiRequestError extends Error {
  status: number;
  code: ApiErrorCode;
  requestId: string;

  constructor(message: string, status: number, code: ApiErrorCode = "REQUEST_FAILED", requestId = "") {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | ApiErrorEnvelope | null;
  if (!response.ok) {
    const errorPayload = payload as ApiErrorEnvelope | null;
    const message = errorPayload?.error?.message || `Request failed with ${response.status}`;
    const code = errorPayload?.error?.code || "REQUEST_FAILED";
    throw new ApiRequestError(message, response.status, code, errorPayload?.request_id || "");
  }

  return (payload as ApiEnvelope<T>).data;
}

export const api = {
  bootstrap() {
    return requestJson<BootstrapData>("/v1/app/bootstrap");
  },

  currentWave() {
    return requestJson<Wave | null>("/v1/waves/current");
  },

  register(email: string, password: string) {
    return requestJson<AuthResult>("/v1/auth/register", {
      method: "POST",
      body: { email, password },
    });
  },

  login(email: string, password: string) {
    return requestJson<AuthResult>("/v1/auth/login", {
      method: "POST",
      body: { email, password },
    });
  },

  confirmReferral(inviterEmail: string, token: string) {
    return requestJson<Referral>("/v1/referrals/confirm", {
      method: "POST",
      token,
      body: { inviterEmail },
    });
  },

  depositPrecheck(waveId: number, token: string) {
    return requestJson<{ ok: boolean; reasons: string[] }>(`/v1/waves/${waveId}/deposit-precheck`, {
      method: "POST",
      token,
    });
  },

  deposit(waveId: number, amount: string, token: string) {
    return requestJson<Position>(`/v1/waves/${waveId}/deposit`, {
      method: "POST",
      token,
      body: { amount },
    });
  },

  createSquad(waveId: number, name: string, token: string) {
    return requestJson<CreateSquadResult>(`/v1/waves/${waveId}/squads`, {
      method: "POST",
      token,
      body: { name },
    });
  },

  listSquads(waveId: number) {
    return requestJson<SquadLeaderboardRow[]>(`/v1/waves/${waveId}/squads`);
  },

  joinSquad(waveId: number, squadId: number, token: string) {
    return requestJson<SquadMember>(`/v1/waves/${waveId}/squads/${squadId}/join`, {
      method: "POST",
      token,
    });
  },

  rewardSummary(token: string) {
    return requestJson<RewardSummary>("/v1/rewards/summary", { token });
  },

  listRewards(token: string, status?: RewardLedger["status"]) {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return requestJson<RewardLedger[]>(`/v1/rewards${query}`, { token });
  },

  claimReward(ledgerId: string, token: string) {
    return requestJson<RewardLedger>(`/v1/rewards/${ledgerId}/claim`, {
      method: "POST",
      token,
    });
  },

  adminDashboard(token: string) {
    return requestJson<AdminDashboard>("/v1/admin/dashboard", { token });
  },

  adminWaves(token: string) {
    return requestJson<AdminWave[]>("/v1/admin/waves", { token });
  },

  adminRiskFlags(token: string) {
    return requestJson<AdminRiskFlag[]>("/v1/admin/risk/flags", { token });
  },

  adminRewards(token: string) {
    return requestJson<AdminReward[]>("/v1/admin/rewards", { token });
  },

  adminSquads(token: string) {
    return requestJson<AdminSquad[]>("/v1/admin/squads", { token });
  },
};
