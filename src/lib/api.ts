import type {
  ApiEnvelope,
  AdminDashboard,
  AdminAuditLog,
  AdminOpsDiagnostics,
  AdminPaginatedResult,
  AdminReward,
  AdminRiskFlag,
  AdminSquad,
  AdminWave,
  AppControl,
  AppControlKey,
  AuthResult,
  BootstrapData,
  ChainEvent,
  DepositReceiptResult,
  DepositStreakView,
  JettonWalletDerivation,
  LeaderboardMe,
  MerkleRewardBatch,
  MerkleClaimReceiptResult,
  MerkleRewardProof,
  MerkleRewardProofWithBatch,
  MySquadView,
  Position,
  UserWavePositionTotal,
  RewardEstimate,
  RewardLedger,
  RewardSummary,
  CreateSquadResult,
  SquadDetail,
  SquadLeaderboardRow,
  SquadMember,
  SeasonWarClaimPreview,
  SeasonWarCurrent,
  SeasonWarExportManifest,
  SeasonWarMe,
  SeasonWarRadar,
  SeasonWarSquads,
  Wave,
  WalletAuthIntent,
  WalletBindIntent,
  WalletBinding,
} from "./types";

type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
};

export type AdminListRequest = {
  page?: number;
  pageSize?: number;
  search?: string;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || "";

export class ApiRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
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

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || `Request failed with ${response.status}`;
    throw new ApiRequestError(message, response.status, payload?.error?.code);
  }

  return (payload as ApiEnvelope<T>).data;
}

function adminListQuery(options: AdminListRequest = {}) {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.pageSize) params.set("page_size", String(options.pageSize));
  if (options.search?.trim()) params.set("search", options.search.trim());
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const api = {
  bootstrap() {
    return requestJson<BootstrapData>("/v1/app/bootstrap");
  },

  currentWave() {
    return requestJson<Wave | null>("/v1/waves/current");
  },

  seasonWarCurrent() {
    return requestJson<SeasonWarCurrent>("/v1/season-war/current");
  },

  seasonWarRadar(seasonId: string) {
    return requestJson<SeasonWarRadar>(`/v1/season-war/seasons/${encodeURIComponent(seasonId)}/radar`);
  },

  seasonWarSquads(seasonId: string) {
    return requestJson<SeasonWarSquads>(`/v1/season-war/seasons/${encodeURIComponent(seasonId)}/squads`);
  },

  seasonWarMe(wallet: string) {
    return requestJson<SeasonWarMe>(`/v1/season-war/me?wallet=${encodeURIComponent(wallet)}`);
  },

  seasonWarClaimPreview(seasonId: string, wallet: string) {
    return requestJson<SeasonWarClaimPreview>(`/v1/season-war/seasons/${encodeURIComponent(seasonId)}/claim-preview?wallet=${encodeURIComponent(wallet)}`);
  },

  seasonWarExportManifest(seasonId: string) {
    return requestJson<SeasonWarExportManifest>(`/v1/season-war/seasons/${encodeURIComponent(seasonId)}/export-manifest`);
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

  createWalletAuthIntent(walletAddress?: string) {
    return requestJson<WalletAuthIntent>("/v1/auth/wallet-intent", {
      method: "POST",
      body: walletAddress ? { walletAddress } : {},
    });
  },

  walletLogin(input: { walletAddress: string; signature: string; intentToken: string; walletType?: string | null }) {
    return requestJson<AuthResult>("/v1/auth/wallet", {
      method: "POST",
      body: input,
    });
  },

  depositPrecheck(waveId: number, token: string) {
    return requestJson<{ ok: boolean; reasons: string[] }>(`/v1/waves/${waveId}/deposit-precheck`, {
      method: "POST",
      token,
    });
  },

  deposit(waveId: number, amount: string, token: string) {
    return requestJson<Position>(`/v1/waves/${waveId}/staging-mvp/deposit`, {
      method: "POST",
      token,
      body: { amount },
    });
  },

  myWavePositionTotal(waveId: number, token: string) {
    return requestJson<UserWavePositionTotal>(`/v1/waves/${waveId}/positions/me`, { token });
  },

  depositStreakMe(waveId: number, token: string) {
    return requestJson<DepositStreakView>(`/v1/deposit-streak/me?waveId=${encodeURIComponent(String(waveId))}`, { token });
  },

  saveDepositStreakGoal(input: { waveId: number; targetUsd9: string }, token: string) {
    return requestJson<DepositStreakView>("/v1/deposit-streak/goal", {
      method: "POST",
      token,
      body: input,
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

  submitDepositReceipt(waveId: number, input: { txHash: string; amount?: string; walletAddress?: string; seasonId?: number; targetUsd9?: string }, token: string) {
    return requestJson<DepositReceiptResult>(`/v1/waves/${waveId}/deposit-receipt`, {
      method: "POST",
      token,
      body: input,
    });
  },

  deriveJettonWallet(owner: string, token: string) {
    return requestJson<JettonWalletDerivation>(`/v1/waves/chain/jetton-wallet?owner=${encodeURIComponent(owner)}`, { token });
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

  mySquad(waveId: number, token: string) {
    return requestJson<MySquadView | null>(`/v1/waves/${waveId}/squads/me`, { token });
  },

  squadDetail(waveId: number, squadId: number) {
    return requestJson<SquadDetail>(`/v1/waves/${waveId}/squads/${squadId}`);
  },

  joinSquad(waveId: number, squadId: number, token: string) {
    return requestJson<SquadMember>(`/v1/waves/${waveId}/squads/${squadId}/join`, {
      method: "POST",
      token,
    });
  },

  leaderboardMe(waveId: number, token: string) {
    return requestJson<LeaderboardMe>(`/v1/waves/${waveId}/leaderboard/me`, { token });
  },

  rewardEstimate(waveId: number, token: string) {
    return requestJson<RewardEstimate>(`/v1/waves/${waveId}/reward-estimate`, { token });
  },

  rewardSummary(token: string) {
    return requestJson<RewardSummary>("/v1/rewards/summary", { token });
  },

  listRewards(token: string, status?: RewardLedger["status"]) {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return requestJson<RewardLedger[]>(`/v1/rewards${query}`, { token });
  },

  claimReward(ledgerId: string, token: string) {
    return requestJson<RewardLedger>(`/v1/rewards/${ledgerId}/staging-mvp/claim`, {
      method: "POST",
      token,
    });
  },

  merkleClaimProof(ledgerId: string, token: string) {
    return requestJson<MerkleRewardProofWithBatch>(`/v1/rewards/${ledgerId}/merkle-proof`, { token });
  },

  submitMerkleClaimReceipt(ledgerId: string, txHash: string, token: string) {
    return requestJson<MerkleClaimReceiptResult>(`/v1/rewards/${ledgerId}/claim-receipt`, {
      method: "POST",
      token,
      body: { txHash },
    });
  },

  adminDashboard(token: string) {
    return requestJson<AdminDashboard>("/v1/admin/dashboard", { token });
  },

  adminWaves(token: string, options?: AdminListRequest) {
    return requestJson<AdminPaginatedResult<AdminWave>>(`/v1/admin/waves${adminListQuery(options)}`, { token });
  },

  adminRiskFlags(token: string, options?: AdminListRequest) {
    return requestJson<AdminPaginatedResult<AdminRiskFlag>>(`/v1/admin/risk/flags${adminListQuery(options)}`, { token });
  },

  adminRewards(token: string, options?: AdminListRequest) {
    return requestJson<AdminPaginatedResult<AdminReward>>(`/v1/admin/rewards${adminListQuery(options)}`, { token });
  },

  adminSquads(token: string, options?: AdminListRequest) {
    return requestJson<AdminPaginatedResult<AdminSquad>>(`/v1/admin/squads${adminListQuery(options)}`, { token });
  },

  adminControls(token: string) {
    return requestJson<AppControl[]>("/v1/admin/controls", { token });
  },

  adminOps(token: string) {
    return requestJson<AdminOpsDiagnostics>("/v1/admin/ops", { token });
  },

  adminAuditLogs(token: string, limit = 50) {
    return requestJson<AdminAuditLog[]>(`/v1/admin/audit-logs?limit=${encodeURIComponent(String(limit))}`, { token });
  },

  adminChainEvents(token: string, applyStatus?: string) {
    const query = applyStatus ? `?apply_status=${encodeURIComponent(applyStatus)}` : "";
    return requestJson<ChainEvent[]>(`/v1/admin/chain-events${query}`, { token });
  },

  updateRiskFlag(flagId: string, input: { status?: string; severity?: string; note?: string | null }, token: string) {
    return requestJson<AdminRiskFlag>(`/v1/risk/flags/${encodeURIComponent(flagId)}`, {
      method: "PATCH",
      token,
      body: input,
    });
  },

  updateAdminControl(key: AppControlKey, input: { enabled: boolean; reason?: string | null }, token: string) {
    return requestJson<AppControl>(`/v1/admin/controls/${key}`, {
      method: "PATCH",
      token,
      body: input,
    });
  },

  adminMerkleBatches(token: string) {
    return requestJson<MerkleRewardBatch[]>("/v1/admin/merkle/batches", { token });
  },

  adminMerkleProofs(token: string, batchId?: string) {
    const query = batchId ? `?batch_id=${encodeURIComponent(batchId)}` : "";
    return requestJson<MerkleRewardProof[]>(`/v1/admin/merkle/proofs${query}`, { token });
  },

  createAdminMerkleDraftBatch(input: { chainId: string; tokenAddress: string }, token: string) {
    return requestJson<{ batch: MerkleRewardBatch; proofs: MerkleRewardProof[] }>("/v1/admin/merkle/batches/draft", {
      method: "POST",
      token,
      body: input,
    });
  },
};
