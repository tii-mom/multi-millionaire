import type {
  ApiEnvelope,
  AdminDashboard,
  AdminReward,
  AdminRiskFlag,
  AdminSquad,
  AdminWave,
  AuthResult,
  BootstrapData,
  DepositReceiptResult,
  Position,
  RewardLedger,
  RewardSummary,
  SquadLeaderboardRow,
  Wave,
  WalletBindIntent,
  WalletBinding,
} from "./types";

type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || "";

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

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || `Request failed with ${response.status}`;
    throw new Error(message);
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

  createWalletBindIntent(walletAddress: string, token: string) {
    return requestJson<WalletBindIntent>("/v1/wallet/bind-intent", {
      method: "POST",
      token,
      body: { walletAddress },
    });
  },

  bindWallet(input: { nonce: string; walletAddress: string; signature: string; walletType?: string | null }, token: string) {
    return requestJson<WalletBinding>("/v1/wallet/bind", {
      method: "POST",
      token,
      body: input,
    });
  },

  myWallets(token: string) {
    return requestJson<WalletBinding[]>("/v1/wallet/me", { token });
  },

  submitDepositReceipt(waveId: number, input: { txHash: string; amount?: string; walletAddress?: string }, token: string) {
    return requestJson<DepositReceiptResult>(`/v1/waves/${waveId}/deposit-receipt`, {
      method: "POST",
      token,
      body: input,
    });
  },

  createSquad(waveId: number, name: string, token: string) {
    return requestJson(`/v1/waves/${waveId}/squads`, {
      method: "POST",
      token,
      body: { name },
    });
  },

  listSquads(waveId: number) {
    return requestJson<SquadLeaderboardRow[]>(`/v1/waves/${waveId}/squads`);
  },

  joinSquad(waveId: number, squadId: number, token: string) {
    return requestJson(`/v1/waves/${waveId}/squads/${squadId}/join`, {
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
