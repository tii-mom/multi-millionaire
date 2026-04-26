import { useCallback, useEffect, useState } from "react";
import { Activity, Coins, Gift, Loader2, RefreshCw, ShieldCheck, Users, Waves } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/src/lib/api";
import LanguageToggle from "@/src/components/LanguageToggle";
import { useI18n } from "@/src/lib/i18n";
import { AdminControlsSection, controlDetails } from "@/src/views/admin/AdminControlsSection";
import { AdminListsSection } from "@/src/views/admin/AdminListsSection";
import { AdminMerkleSection } from "@/src/views/admin/AdminMerkleSection";
import { formatInteger } from "@/src/views/admin/format";
import { emptyControlDrafts, emptyLists } from "@/src/views/admin/types";
import type { AdminLists, ControlDrafts, ListKey } from "@/src/views/admin/types";
import type { AdminDashboard, AdminOpsDiagnostics, AppControl, AppControlKey, MerkleRewardBatch, MerkleRewardProof } from "@/src/lib/types";

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
  const [ops, setOps] = useState<AdminOpsDiagnostics | null>(null);
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
  const [hasAdminToken, setHasAdminToken] = useState(() => typeof window !== "undefined" && !!localStorage.getItem("auth_token"));
  const [authError, setAuthError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [controlsError, setControlsError] = useState<string | null>(null);
  const [merkleError, setMerkleError] = useState<string | null>(null);

  const getToken = useCallback(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setHasAdminToken(false);
      setAuthError(t("admin.tokenRequired"));
      return null;
    }
    setHasAdminToken(true);
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
      const [rows, diagnostics] = await Promise.all([
        api.adminControls(token),
        api.adminOps(token).catch(() => null),
      ]);
      setControls(rows);
      setOps(diagnostics);
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

  const coreOnlyAdmin = ops?.runtime_path === "production-chain";
  const merkleDraftWritesDisabled = coreOnlyAdmin && !ops?.merkle_draft_writes_enabled;

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
    if (!ops) return;
    if (coreOnlyAdmin) return;
    loadList(activeList);
  }, [activeList, coreOnlyAdmin, loadList, ops]);

  const stats = [
    { label: t("admin.stats.currentWave"), value: dashboard?.current_wave?.code || t("common.none"), detail: dashboard?.current_wave?.status || t("admin.stats.noLiveWave"), icon: Waves },
    { label: t("admin.stats.users"), value: formatInteger(dashboard?.total_users, locale), detail: t("admin.stats.totalRegistered"), icon: Users },
    { label: t("admin.stats.positions"), value: formatInteger(dashboard?.total_positions, locale), detail: t("admin.stats.totalLocks"), icon: Activity },
    { label: t("admin.stats.pendingRewards"), value: formatInteger(dashboard?.total_rewards_pending, locale), detail: t("admin.stats.finalAmount"), icon: Coins },
    { label: t("admin.stats.claimedRewards"), value: formatInteger(dashboard?.total_rewards_claimed, locale), detail: t("admin.stats.finalAmount"), icon: Gift },
    { label: t("admin.stats.openFlags"), value: formatInteger(dashboard?.open_risk_flags, locale), detail: t("admin.stats.riskQueue"), icon: ShieldCheck },
  ];

  const writesDisabled = !hasAdminToken;

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
                if (!coreOnlyAdmin) {
                  loadList(activeList);
                }
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

        <AdminControlsSection
          controls={controls}
          controlsError={controlsError}
          controlDrafts={controlDrafts}
          hasAdminToken={hasAdminToken}
          isControlsLoading={isControlsLoading}
          onDraftChange={(key, value) => setControlDrafts((current) => ({ ...current, [key]: value }))}
          onReload={loadControls}
          onUpdate={updateControl}
          updatingControl={updatingControl}
        />

        <AdminMerkleSection
          batches={merkleBatches}
          chainId={merkleChainId}
          error={merkleError}
          isCreating={isMerkleCreating}
          isLoading={isMerkleLoading}
          merkleDraftWritesDisabled={merkleDraftWritesDisabled}
          onChainIdChange={setMerkleChainId}
          onCreateDraft={createMerkleDraft}
          onReload={loadMerkle}
          onTokenAddressChange={setMerkleTokenAddress}
          proofs={merkleProofs}
          tokenAddress={merkleTokenAddress}
          writesDisabled={writesDisabled}
        />

        {!coreOnlyAdmin ? (
          <AdminListsSection
            activeList={activeList}
            isListLoading={isListLoading}
            listError={listError}
            lists={lists}
            onActiveListChange={setActiveList}
          />
        ) : null}
      </main>
    </div>
  );
}
