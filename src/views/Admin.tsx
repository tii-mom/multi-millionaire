import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Coins, Gift, Loader2, RefreshCw, Save, ShieldCheck, ToggleLeft, ToggleRight, Users, Waves } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/src/lib/api";
import LanguageToggle from "@/src/components/LanguageToggle";
import { formatNumber, useI18n } from "@/src/lib/i18n";
import type { AdminDashboard, AdminReward, AdminRiskFlag, AdminSquad, AdminWave, AppControl, AppControlKey, MerkleRewardBatch, MerkleRewardProof } from "@/src/lib/types";

type ListKey = "waves" | "risk" | "rewards" | "squads";

type AdminLists = {
  waves: AdminWave[];
  risk: AdminRiskFlag[];
  rewards: AdminReward[];
  squads: AdminSquad[];
};

type ControlDrafts = Record<AppControlKey, string>;

const listTabs = [
  { key: "waves" as const, labelKey: "admin.lists.waves", icon: Waves },
  { key: "risk" as const, labelKey: "admin.lists.risk", icon: AlertTriangle },
  { key: "rewards" as const, labelKey: "admin.lists.rewards", icon: Gift },
  { key: "squads" as const, labelKey: "admin.lists.squads", icon: Users },
];

const emptyLists: AdminLists = {
  waves: [],
  risk: [],
  rewards: [],
  squads: [],
};

const controlKeys: AppControlKey[] = [
  "pause_deposits",
  "pause_reward_claims",
  "pause_referral_rewards",
  "maintenance_banner",
];

const controlDetails: Record<AppControlKey, { labelKey: string; detailKey: string }> = {
  pause_deposits: {
    labelKey: "admin.controls.pauseDeposits",
    detailKey: "admin.controls.pauseDepositsDetail",
  },
  pause_reward_claims: {
    labelKey: "admin.controls.pauseRewardClaims",
    detailKey: "admin.controls.pauseRewardClaimsDetail",
  },
  pause_referral_rewards: {
    labelKey: "admin.controls.pauseReferralRewards",
    detailKey: "admin.controls.pauseReferralRewardsDetail",
  },
  maintenance_banner: {
    labelKey: "admin.controls.maintenanceBanner",
    detailKey: "admin.controls.maintenanceBannerDetail",
  },
};

const emptyControlDrafts: ControlDrafts = {
  pause_deposits: "",
  pause_reward_claims: "",
  pause_referral_rewards: "",
  maintenance_banner: "",
};

function formatInteger(value: string | number | null | undefined, locale: string) {
  const text = String(value ?? "0");
  if (!/^\d+$/.test(text)) return text;
  return formatNumber(text, locale, { maximumFractionDigits: 0 });
}

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusPill({ status }: { status: string }) {
  const tone = status === "live" || status === "approved" || status === "open"
    ? "border-[#DBFF00]/25 bg-[#DBFF00]/10 text-[#DBFF00]"
    : "border-white/10 bg-white/[0.04] text-white/55";

  return (
    <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] uppercase tracking-widest ${tone}`}>
      {status}
    </span>
  );
}

function EmptyRows() {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-10 text-center text-xs uppercase tracking-widest text-white/35">
      {t("common.noRows")}
    </div>
  );
}

function AdminListRows({ activeList, lists }: { activeList: ListKey; lists: AdminLists }) {
  const { locale, t } = useI18n();

  if (activeList === "waves") {
    if (lists.waves.length === 0) return <EmptyRows />;

    return (
      <div className="flex flex-col gap-2">
        {lists.waves.map((wave) => (
          <div key={wave.wave_id} className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white/90">{wave.name}</div>
                <div className="mt-1 text-[11px] uppercase tracking-widest text-white/40">#{wave.wave_id} / {wave.code}</div>
              </div>
              <StatusPill status={wave.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/55 sm:grid-cols-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.rows.starts")}</div>
                <div className="mt-1 tabular-nums">{formatDate(wave.start_time, locale)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.rows.ends")}</div>
                <div className="mt-1 tabular-nums">{formatDate(wave.end_time, locale)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.rows.minLock")}</div>
                <div className="mt-1 tabular-nums">{formatInteger(wave.min_lock_amount, locale)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.rows.budget")}</div>
                <div className="mt-1 tabular-nums">{formatInteger(wave.reward_budget, locale)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activeList === "risk") {
    if (lists.risk.length === 0) return <EmptyRows />;

    return (
      <div className="flex flex-col gap-2">
        {lists.risk.map((flag) => (
          <div key={flag.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white/90">{flag.flag_type.replace(/_/g, " ")}</div>
                <div className="mt-1 truncate text-[11px] uppercase tracking-widest text-white/40">
                  {flag.entity_type} / {flag.entity_id}
                </div>
              </div>
              <StatusPill status={flag.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/50">
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 uppercase tracking-widest">{flag.severity}</span>
              <span className="tabular-nums">{formatDate(flag.created_at, locale)}</span>
              {flag.note ? <span className="min-w-0 truncate text-white/40">{flag.note}</span> : null}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activeList === "rewards") {
    if (lists.rewards.length === 0) return <EmptyRows />;

    return (
      <div className="flex flex-col gap-2">
        {lists.rewards.map((reward) => (
          <div key={reward.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white/90">{reward.reward_type.replace(/_/g, " ")}</div>
                <div className="mt-1 truncate text-[11px] uppercase tracking-widest text-white/40">
                  {reward.beneficiary_email || reward.beneficiary_user_id}
                </div>
              </div>
              <StatusPill status={reward.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/55 sm:grid-cols-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.rows.final")}</div>
                <div className="mt-1 tabular-nums">{formatInteger(reward.final_amount, locale)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.rows.gross")}</div>
                <div className="mt-1 tabular-nums">{formatInteger(reward.gross_amount, locale)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.rows.wave")}</div>
                <div className="mt-1 tabular-nums">#{reward.wave_id}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/30">{t("common.created")}</div>
                <div className="mt-1 tabular-nums">{formatDate(reward.created_at, locale)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (lists.squads.length === 0) return <EmptyRows />;

  return (
    <div className="flex flex-col gap-2">
      {lists.squads.map((squad) => (
        <div key={squad.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white/90">{squad.name}</div>
              <div className="mt-1 truncate text-[11px] uppercase tracking-widest text-white/40">
                {t("admin.rows.captain")} / {squad.captain_email || squad.captain_user_id}
              </div>
            </div>
            <StatusPill status={squad.status} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/55 sm:grid-cols-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.rows.members")}</div>
              <div className="mt-1 tabular-nums">{squad.member_count}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.rows.activated")}</div>
              <div className="mt-1 tabular-nums">{squad.activated_member_count}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.rows.locked")}</div>
              <div className="mt-1 tabular-nums">{formatInteger(squad.total_locked, locale)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.rows.wave")}</div>
              <div className="mt-1 tabular-nums">#{squad.wave_id}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

async function fetchAdminList(key: ListKey, token: string) {
  switch (key) {
    case "waves":
      return api.adminWaves(token);
    case "risk":
      return api.adminRiskFlags(token);
    case "rewards":
      return api.adminRewards(token);
    case "squads":
      return api.adminSquads(token);
  }
}

export default function Admin() {
  const { formatError, locale, t } = useI18n();
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [lists, setLists] = useState<AdminLists>(emptyLists);
  const [controls, setControls] = useState<AppControl[]>([]);
  const [controlDrafts, setControlDrafts] = useState<ControlDrafts>(emptyControlDrafts);
  const [merkleBatches, setMerkleBatches] = useState<MerkleRewardBatch[]>([]);
  const [merkleProofs, setMerkleProofs] = useState<MerkleRewardProof[]>([]);
  const [merkleChainId, setMerkleChainId] = useState("ton-mainnet");
  const [merkleTokenAddress, setMerkleTokenAddress] = useState("");
  const [activeList, setActiveList] = useState<ListKey>("waves");
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isListLoading, setIsListLoading] = useState(false);
  const [isControlsLoading, setIsControlsLoading] = useState(true);
  const [isMerkleLoading, setIsMerkleLoading] = useState(true);
  const [isMerkleCreating, setIsMerkleCreating] = useState(false);
  const [updatingControl, setUpdatingControl] = useState<AppControlKey | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [controlsError, setControlsError] = useState<string | null>(null);
  const [merkleError, setMerkleError] = useState<string | null>(null);

  const getToken = useCallback(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setAuthError(t("admin.tokenRequired"));
      return null;
    }
    setAuthError(null);
    return token;
  }, [t]);

  const loadDashboard = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setIsDashboardLoading(false);
      return;
    }

    setIsDashboardLoading(true);
    try {
      setDashboard(await api.adminDashboard(token));
    } catch (error) {
      const message = formatError(error, "admin.dashboardFailed");
      setAuthError(message);
      toast.error(message);
    } finally {
      setIsDashboardLoading(false);
    }
  }, [getToken]);

  const loadList = useCallback(async (key: ListKey) => {
    const token = getToken();
    if (!token) {
      setIsListLoading(false);
      return;
    }

    setIsListLoading(true);
    setListError(null);
    try {
      const rows = await fetchAdminList(key, token);
      setLists((current) => ({ ...current, [key]: rows }));
    } catch (error) {
      const message = formatError(error, "admin.listFailed");
      setListError(message);
      toast.error(message);
    } finally {
      setIsListLoading(false);
    }
  }, [getToken]);

  const loadControls = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setIsControlsLoading(false);
      return;
    }

    setIsControlsLoading(true);
    setControlsError(null);
    try {
      const rows = await api.adminControls(token);
      setControls(rows);
      setControlDrafts((current) => {
        const next = { ...current };
        for (const control of rows) {
          next[control.key] = control.reason || "";
        }
        return next;
      });
    } catch (error) {
      const message = formatError(error, "admin.controlsFailed");
      setControlsError(message);
      toast.error(message);
    } finally {
      setIsControlsLoading(false);
    }
  }, [getToken]);

  const updateControl = useCallback(async (key: AppControlKey, enabled: boolean) => {
    const token = getToken();
    if (!token) return;

    setUpdatingControl(key);
    setControlsError(null);
    try {
      const reason = controlDrafts[key].trim() || null;
      const updated = await api.updateAdminControl(key, { enabled, reason }, token);
      setControls((current) => {
        const exists = current.some((control) => control.key === key);
        if (!exists) return [...current, updated];
        return current.map((control) => (control.key === key ? updated : control));
      });
      setControlDrafts((current) => ({ ...current, [key]: updated.reason || "" }));
      toast.success(t("admin.controlUpdated", { label: t(controlDetails[key].labelKey) }));
    } catch (error) {
      const message = formatError(error, "admin.controlsFailed");
      setControlsError(message);
      toast.error(message);
    } finally {
      setUpdatingControl(null);
    }
  }, [controlDrafts, getToken]);

  const loadMerkle = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setIsMerkleLoading(false);
      return;
    }
    setIsMerkleLoading(true);
    setMerkleError(null);
    try {
      const batches = await api.adminMerkleBatches(token);
      setMerkleBatches(batches);
      const latestBatchId = batches[0]?.id;
      setMerkleProofs(await api.adminMerkleProofs(token, latestBatchId));
    } catch (error) {
      const message = formatError(error, "admin.merkleFailed");
      setMerkleError(message);
      toast.error(message);
    } finally {
      setIsMerkleLoading(false);
    }
  }, [getToken]);

  const createMerkleDraft = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setIsMerkleCreating(true);
    setMerkleError(null);
    try {
      if (!merkleChainId.trim() || !merkleTokenAddress.trim()) {
        throw new Error(t("admin.merkleInputRequired"));
      }
      const result = await api.createAdminMerkleDraftBatch({
        chainId: merkleChainId.trim(),
        tokenAddress: merkleTokenAddress.trim(),
      }, token);
      toast.success(t("admin.merkleDraftCreated", { count: result.proofs.length }));
      await loadMerkle();
    } catch (error) {
      const message = formatError(error, "admin.merkleDraftFailed");
      setMerkleError(message);
      toast.error(message);
    } finally {
      setIsMerkleCreating(false);
    }
  }, [getToken, loadMerkle, merkleChainId, merkleTokenAddress]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    loadControls();
  }, [loadControls]);

  useEffect(() => {
    loadMerkle();
  }, [loadMerkle]);

  useEffect(() => {
    loadList(activeList);
  }, [activeList, loadList]);

  const stats = [
    { label: t("admin.stats.currentWave"), value: dashboard?.current_wave?.code || t("common.none"), detail: dashboard?.current_wave?.status || t("admin.stats.noLiveWave"), icon: Waves },
    { label: t("admin.stats.users"), value: formatInteger(dashboard?.total_users, locale), detail: t("admin.stats.totalRegistered"), icon: Users },
    { label: t("admin.stats.positions"), value: formatInteger(dashboard?.total_positions, locale), detail: t("admin.stats.totalLocks"), icon: Activity },
    { label: t("admin.stats.pendingRewards"), value: formatInteger(dashboard?.total_rewards_pending, locale), detail: t("admin.stats.finalAmount"), icon: Coins },
    { label: t("admin.stats.claimedRewards"), value: formatInteger(dashboard?.total_rewards_claimed, locale), detail: t("admin.stats.finalAmount"), icon: Gift },
    { label: t("admin.stats.openFlags"), value: formatInteger(dashboard?.open_risk_flags, locale), detail: t("admin.stats.riskQueue"), icon: ShieldCheck },
  ];

  const controlMap = controls.reduce<Partial<Record<AppControlKey, AppControl>>>((acc, control) => {
    acc[control.key] = control;
    return acc;
  }, {});
  const isAnyControlUpdating = updatingControl !== null;

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.28em] text-[#DBFF00]/70">{t("admin.kicker")}</div>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-white/95">{t("admin.title")}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LanguageToggle />
            <a
              href="/"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs uppercase tracking-widest text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {t("admin.app")}
            </a>
            <button
              type="button"
              onClick={() => {
                loadDashboard();
                loadControls();
                loadMerkle();
                loadList(activeList);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs uppercase tracking-widest text-white/75 transition-colors hover:bg-[#DBFF00] hover:text-black"
            >
              <RefreshCw className="w-4 h-4" />
              {t("common.refresh")}
            </button>
          </div>
        </header>

        {authError ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
            {authError}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-widest text-white/35">{stat.label}</div>
                  <Icon className="w-4 h-4 text-[#DBFF00]/80" />
                </div>
                <div className="mt-4 min-h-8 truncate font-mono text-2xl font-semibold tabular-nums text-white/95">
                  {isDashboardLoading ? <Loader2 className="w-5 h-5 animate-spin text-white/45" /> : stat.value}
                </div>
                <div className="mt-1 truncate text-xs text-white/40">{stat.detail}</div>
              </div>
            );
          })}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/55">{t("admin.controls.title")}</h2>
            <button
              type="button"
              onClick={loadControls}
              disabled={isControlsLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs uppercase tracking-widest text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isControlsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {t("common.retry")}
            </button>
          </div>

          {controlsError ? (
            <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/65">
              {controlsError}
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            {controlKeys.map((key) => {
              const control = controlMap[key];
              const details = controlDetails[key];
              const enabled = !!control?.enabled;
              const isUpdating = updatingControl === key;
              const isBusy = isControlsLoading || isAnyControlUpdating;

              return (
                <div key={key} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white/90">{t(details.labelKey)}</div>
                      <div className="mt-1 text-xs text-white/40">{t(details.detailKey)}</div>
                    </div>
                    <span
                      className={`shrink-0 rounded-md border px-2 py-1 text-[10px] uppercase tracking-widest ${
                        enabled
                          ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
                          : "border-[#DBFF00]/25 bg-[#DBFF00]/10 text-[#DBFF00]"
                      }`}
                    >
                      {isControlsLoading ? t("common.status.loading") : enabled ? t("common.enabled") : t("common.off")}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 text-xs text-white/45 sm:grid-cols-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.controls.key")}</div>
                      <div className="mt-1 truncate font-mono text-white/60">{key}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.controls.updated")}</div>
                      <div className="mt-1 truncate tabular-nums text-white/60">
                        {control?.updated_at ? formatDate(control.updated_at, locale) : t("common.loading")}
                      </div>
                    </div>
                  </div>

                  <label className="mt-4 block">
                    <span className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.controls.reason")}</span>
                    <textarea
                      value={controlDrafts[key]}
                      onChange={(event) => setControlDrafts((current) => ({ ...current, [key]: event.target.value }))}
                      disabled={isBusy}
                      rows={3}
                      className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-[#DBFF00]/40 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder={t("admin.controls.reasonPlaceholder")}
                    />
                  </label>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => updateControl(key, !enabled)}
                      disabled={isBusy}
                      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        enabled
                          ? "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08] hover:text-white"
                          : "border-amber-300/20 bg-amber-300/10 text-amber-100 hover:bg-amber-300 hover:text-black"
                      }`}
                    >
                      {isUpdating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : enabled ? (
                        <ToggleRight className="w-4 h-4" />
                      ) : (
                        <ToggleLeft className="w-4 h-4" />
                      )}
                      {enabled ? t("common.disable") : t("common.enable")}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateControl(key, enabled)}
                      disabled={isBusy}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs uppercase tracking-widest text-white/75 transition-colors hover:bg-[#DBFF00] hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {t("common.saveReason")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/55">{t("admin.merkle.title")}</h2>
              <p className="mt-1 text-xs text-white/35">{t("admin.merkle.detail")}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={loadMerkle}
                disabled={isMerkleLoading || isMerkleCreating}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs uppercase tracking-widest text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isMerkleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {t("common.refresh")}
              </button>
              <button
                type="button"
                onClick={createMerkleDraft}
                disabled={isMerkleLoading || isMerkleCreating}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#DBFF00]/20 bg-[#DBFF00]/10 px-3 py-2 text-xs uppercase tracking-widest text-[#DBFF00] transition-colors hover:bg-[#DBFF00] hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isMerkleCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t("admin.merkle.createDraft")}
              </button>
            </div>
          </div>

          {merkleError ? (
            <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/65">
              {merkleError}
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 lg:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.merkle.chainId")}</span>
                  <input
                    value={merkleChainId}
                    onChange={(event) => setMerkleChainId(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-[#DBFF00]/40"
                    placeholder="ton-mainnet"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.merkle.tokenAddress")}</span>
                  <input
                    value={merkleTokenAddress}
                    onChange={(event) => setMerkleTokenAddress(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-[#DBFF00]/40"
                    placeholder={t("admin.merkle.tokenPlaceholder")}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 text-[10px] uppercase tracking-widest text-white/35">{t("admin.merkle.latestBatches")}</div>
              {isMerkleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-white/45" />
              ) : merkleBatches.length === 0 ? (
                <EmptyRows />
              ) : (
                <div className="flex flex-col gap-2">
                  {merkleBatches.slice(0, 5).map((batch) => (
                    <div key={batch.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 truncate font-mono text-xs text-white/75">{batch.id}</div>
                        <StatusPill status={batch.status} />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/45">
                        <span className="truncate">{t("admin.rows.root")} {batch.merkle_root}</span>
                        <span className="text-right tabular-nums">{formatInteger(batch.total_amount_raw, locale)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 text-[10px] uppercase tracking-widest text-white/35">{t("admin.merkle.latestProofs")}</div>
              {isMerkleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-white/45" />
              ) : merkleProofs.length === 0 ? (
                <EmptyRows />
              ) : (
                <div className="flex flex-col gap-2">
                  {merkleProofs.slice(0, 5).map((proof) => (
                    <div key={proof.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 truncate font-mono text-xs text-white/75">{proof.reward_ledger_id}</div>
                        <StatusPill status={proof.claim_status} />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/45">
                        <span className="truncate">{proof.beneficiary_wallet}</span>
                        <span className="text-right tabular-nums">{formatInteger(proof.amount_raw, locale)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/55">{t("admin.lists.title")}</h2>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {listTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeList === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveList(tab.key)}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs uppercase tracking-widest transition-colors ${
                      isActive
                        ? "border-[#DBFF00]/30 bg-[#DBFF00]/10 text-[#DBFF00]"
                        : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {t(tab.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {listError ? (
              <div className="mb-3 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/65">
                {listError}
              </div>
            ) : null}

            {isListLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-xs uppercase tracking-widest text-white/40">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("common.loading")}
              </div>
            ) : (
              <AdminListRows activeList={activeList} lists={lists} />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
