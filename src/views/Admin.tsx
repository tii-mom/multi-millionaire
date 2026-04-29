import { useCallback, useEffect, useState } from "react";
import { Activity, Coins, FileClock, Gift, KeyRound, Loader2, LogIn, LogOut, RefreshCw, Save, ShieldCheck, TerminalSquare, Users, Waves } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { api } from "@/src/lib/api";
import LanguageToggle from "@/src/components/LanguageToggle";
import { useI18n } from "@/src/lib/i18n";
import { clearBackendAuthToken, writeBackendAuthToken } from "@/src/lib/tonSession";
import { AdminControlsSection, controlDetails } from "@/src/views/admin/AdminControlsSection";
import { AdminListsSection } from "@/src/views/admin/AdminListsSection";
import { AdminMerkleSection } from "@/src/views/admin/AdminMerkleSection";
import { formatDate, formatInteger } from "@/src/views/admin/format";
import { emptyControlDrafts, emptyListPages, emptyLists } from "@/src/views/admin/types";
import type { AdminListPages, AdminListQuery, AdminLists, ControlDrafts, ListKey } from "@/src/views/admin/types";
import type { AdminAuditLog, AdminDashboard, AdminOpsDiagnostics, AppControl, AppControlKey, ChainEvent, MerkleRewardBatch, MerkleRewardProof } from "@/src/lib/types";

const adminListPageSize = 8;
const initialAdminListPages: Record<ListKey, number> = {
  waves: 1,
  risk: 1,
  rewards: 1,
  squads: 1,
};

async function fetchAdminList(key: ListKey, token: string, query: AdminListQuery) {
  switch (key) {
    case "waves":
      return api.adminWaves(token, query);
    case "risk":
      return api.adminRiskFlags(token, query);
    case "rewards":
      return api.adminRewards(token, query);
    case "squads":
      return api.adminSquads(token, query);
  }
}

export default function Admin() {
  const { formatError, locale, t } = useI18n();
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [lists, setLists] = useState<AdminLists>(emptyLists);
  const [listPages, setListPages] = useState<AdminListPages>(emptyListPages);
  const [controls, setControls] = useState<AppControl[]>([]);
  const [ops, setOps] = useState<AdminOpsDiagnostics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [chainEvents, setChainEvents] = useState<ChainEvent[]>([]);
  const [controlDrafts, setControlDrafts] = useState<ControlDrafts>(emptyControlDrafts);
  const [merkleBatches, setMerkleBatches] = useState<MerkleRewardBatch[]>([]);
  const [merkleProofs, setMerkleProofs] = useState<MerkleRewardProof[]>([]);
  const [selectedMerkleBatchId, setSelectedMerkleBatchId] = useState("");
  const [merkleChainId, setMerkleChainId] = useState("ton-mainnet");
  const [merkleTokenAddress, setMerkleTokenAddress] = useState("");
  const [activeList, setActiveList] = useState<ListKey>("waves");
  const [listSearch, setListSearch] = useState("");
  const [listPageByKey, setListPageByKey] = useState<Record<ListKey, number>>(initialAdminListPages);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isListLoading, setIsListLoading] = useState(false);
  const [isControlsLoading, setIsControlsLoading] = useState(true);
  const [isTraceLoading, setIsTraceLoading] = useState(true);
  const [isMerkleLoading, setIsMerkleLoading] = useState(true);
  const [isMerkleCreating, setIsMerkleCreating] = useState(false);
  const [updatingControl, setUpdatingControl] = useState<AppControlKey | null>(null);
  const [updatingRiskFlag, setUpdatingRiskFlag] = useState<string | null>(null);
  const [hasAdminToken, setHasAdminToken] = useState(() => typeof window !== "undefined" && !!localStorage.getItem("auth_token"));
  const [adminEmail, setAdminEmail] = useState(() => typeof window !== "undefined" ? localStorage.getItem("admin_email") || "" : "");
  const [adminPassword, setAdminPassword] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [controlsError, setControlsError] = useState<string | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
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

  const loadList = useCallback(async (key: ListKey, query: AdminListQuery = {}) => {
    const token = getToken();
    if (!token) {
      setIsListLoading(false);
      return;
    }

    setIsListLoading(true);
    setListError(null);
    try {
      const page = await fetchAdminList(key, token, query);
      setLists((current) => ({ ...current, [key]: page.rows }));
      setListPages((current) => ({ ...current, [key]: page }));
    } catch (error) {
      const message = formatError(error, "admin.listFailed");
      setListError(message);
      toast.error(message);
    } finally {
      setIsListLoading(false);
    }
  }, [formatError, getToken]);

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
      const latestBatchId = batches[0]?.id || "";
      const batchId = selectedMerkleBatchId || latestBatchId;
      setMerkleProofs(await api.adminMerkleProofs(token, batchId || undefined));
    } catch (error) {
      const message = formatError(error, "admin.merkleFailed");
      setMerkleError(message);
      toast.error(message);
    } finally {
      setIsMerkleLoading(false);
    }
  }, [getToken, selectedMerkleBatchId]);

  const loadTrace = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setIsTraceLoading(false);
      return;
    }

    setIsTraceLoading(true);
    setTraceError(null);
    try {
      const [logs, events] = await Promise.all([
        api.adminAuditLogs(token, 50),
        api.adminChainEvents(token),
      ]);
      setAuditLogs(logs);
      setChainEvents(events);
    } catch (error) {
      const message = formatError(error, "admin.traceFailed");
      setTraceError(message);
      toast.error(message);
    } finally {
      setIsTraceLoading(false);
    }
  }, [formatError, getToken]);

  const selectMerkleBatch = useCallback(async (batchId: string) => {
    setSelectedMerkleBatchId(batchId);
    const token = getToken();
    if (!token) return;
    setIsMerkleLoading(true);
    setMerkleError(null);
    try {
      setMerkleProofs(await api.adminMerkleProofs(token, batchId || undefined));
    } catch (error) {
      const message = formatError(error, "admin.merkleFailed");
      setMerkleError(message);
      toast.error(message);
    } finally {
      setIsMerkleLoading(false);
    }
  }, [formatError, getToken]);

  const updateRiskFlagStatus = useCallback(async (flagId: string, status: string, note?: string | null) => {
    const token = getToken();
    if (!token) return;

    setUpdatingRiskFlag(flagId);
    setListError(null);
    try {
      const updated = await api.updateRiskFlag(flagId, { status, note }, token);
      setLists((current) => ({
        ...current,
        risk: current.risk.map((flag) => (flag.id === flagId ? updated : flag)),
      }));
      toast.success(t("admin.risk.updated"));
      await Promise.all([loadDashboard(), loadTrace()]);
    } catch (error) {
      const message = formatError(error, "admin.risk.updateFailed");
      setListError(message);
      toast.error(message);
    } finally {
      setUpdatingRiskFlag(null);
    }
  }, [formatError, getToken, loadDashboard, loadTrace, t]);

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
  const writesDisabled = !hasAdminToken;
  const activeListPage = listPageByKey[activeList] || 1;

  const changeActiveList = useCallback((key: ListKey) => {
    setActiveList(key);
    setListPageByKey((current) => ({ ...current, [key]: 1 }));
  }, []);

  const changeListSearch = useCallback((value: string) => {
    setListSearch(value);
    setListPageByKey((current) => ({ ...current, [activeList]: 1 }));
  }, [activeList]);

  const changeListPage = useCallback((page: number) => {
    setListPageByKey((current) => ({ ...current, [activeList]: page }));
  }, [activeList]);

  const reloadAdminData = useCallback(() => {
    loadDashboard();
    loadControls();
    loadMerkle();
    loadTrace();
    if (!coreOnlyAdmin) {
      loadList(activeList, { page: activeListPage, pageSize: adminListPageSize, search: listSearch });
    }
  }, [activeList, activeListPage, coreOnlyAdmin, listSearch, loadControls, loadDashboard, loadList, loadMerkle, loadTrace]);

  const handleAdminLogin = useCallback(async () => {
    const email = adminEmail.trim();
    if (!email || !adminPassword) {
      const message = t("admin.access.missingCredentials");
      setAuthError(message);
      toast.error(message);
      return;
    }

    setIsSigningIn(true);
    setAuthError(null);
    try {
      const result = await api.login(email, adminPassword);
      writeBackendAuthToken(result.token);
      localStorage.setItem("admin_email", email);
      setHasAdminToken(true);
      setAdminPassword("");
      toast.success(t("admin.access.signedIn"));
      reloadAdminData();
    } catch (error) {
      const message = formatError(error, "admin.access.signInFailed");
      setAuthError(message);
      toast.error(message);
    } finally {
      setIsSigningIn(false);
    }
  }, [adminEmail, adminPassword, formatError, reloadAdminData, t]);

  const handleSaveToken = useCallback(() => {
    const token = tokenDraft.trim();
    if (!token) {
      const message = t("admin.access.tokenMissing");
      setAuthError(message);
      toast.error(message);
      return;
    }

    writeBackendAuthToken(token);
    setTokenDraft("");
    setHasAdminToken(true);
    setAuthError(null);
    toast.success(t("admin.access.tokenSaved"));
    reloadAdminData();
  }, [reloadAdminData, t, tokenDraft]);

  const handleClearToken = useCallback(() => {
    clearBackendAuthToken();
      setHasAdminToken(false);
    setDashboard(null);
    setLists(emptyLists);
    setListPages(emptyListPages);
    setControls([]);
    setOps(null);
    setMerkleBatches([]);
    setMerkleProofs([]);
    setAuditLogs([]);
    setChainEvents([]);
    setAuthError(t("admin.tokenRequired"));
    toast.message(t("admin.access.tokenCleared"));
  }, [t]);

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
    loadTrace();
  }, [loadTrace]);

  useEffect(() => {
    if (!ops) return;
    if (coreOnlyAdmin) return;
    const timeout = window.setTimeout(() => {
      loadList(activeList, { page: activeListPage, pageSize: adminListPageSize, search: listSearch });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [activeList, activeListPage, coreOnlyAdmin, listSearch, loadList, ops]);

  const stats = [
    { label: t("admin.stats.currentWave"), value: dashboard?.current_wave?.code || t("common.none"), detail: dashboard?.current_wave?.status || t("admin.stats.noLiveWave"), icon: Waves },
    { label: t("admin.stats.users"), value: formatInteger(dashboard?.total_users, locale), detail: t("admin.stats.totalRegistered"), icon: Users },
    { label: t("admin.stats.positions"), value: formatInteger(dashboard?.total_positions, locale), detail: t("admin.stats.totalLocks"), icon: Activity },
    { label: t("admin.stats.pendingRewards"), value: formatInteger(dashboard?.total_rewards_pending, locale), detail: t("admin.stats.finalAmount"), icon: Coins },
    { label: t("admin.stats.claimedRewards"), value: formatInteger(dashboard?.total_rewards_claimed, locale), detail: t("admin.stats.finalAmount"), icon: Gift },
    { label: t("admin.stats.openFlags"), value: formatInteger(dashboard?.open_risk_flags, locale), detail: t("admin.stats.riskQueue"), icon: ShieldCheck },
  ];

  return (
    <div className="admin-shell min-h-screen text-slate-100">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="admin-panel overflow-hidden rounded-[14px] shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-4 border-b border-slate-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[#d7b46a]/80">
                <TerminalSquare className="h-3.5 w-3.5 text-[#8fd9ad]" />
                {t("admin.kicker")}
              </div>
              <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-50">{t("admin.title")}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LanguageToggle />
              <a
                href="/"
                className="admin-action inline-flex h-9 items-center rounded-[10px] px-3 text-xs font-medium uppercase tracking-widest transition-colors"
              >
                {t("admin.app")}
              </a>
              <button
                type="button"
                onClick={reloadAdminData}
                className="admin-primary inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-xs font-semibold uppercase tracking-widest transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                {t("common.refresh")}
              </button>
            </div>
          </div>

          <div className="grid gap-px bg-slate-800/70 sm:grid-cols-3">
            <HeaderSignal label={t("admin.header.runtime")} value={ops?.runtime_path || t("common.loading")} tone={coreOnlyAdmin ? "accent" : "neutral"} />
            <HeaderSignal label={t("admin.header.adminToken")} value={hasAdminToken ? t("common.enabled") : t("common.off")} tone={hasAdminToken ? "accent" : "warn"} />
            <HeaderSignal label={t("admin.header.writeMode")} value={writesDisabled ? t("common.off") : t("common.enabled")} tone={writesDisabled ? "warn" : "accent"} />
          </div>
        </header>

        {authError ? (
          <div className="rounded-[12px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100/85">
            {authError}
          </div>
        ) : null}

        <AdminAccessPanel
          adminEmail={adminEmail}
          adminPassword={adminPassword}
          hasAdminToken={hasAdminToken}
          isSigningIn={isSigningIn}
          onAdminEmailChange={setAdminEmail}
          onAdminPasswordChange={setAdminPassword}
          onClearToken={handleClearToken}
          onLogin={handleAdminLogin}
          onSaveToken={handleSaveToken}
          onTokenDraftChange={setTokenDraft}
          tokenDraft={tokenDraft}
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.18 }}
                className="admin-panel rounded-[12px] p-4"
              >
                <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                  <div className="truncate text-[10px] font-medium uppercase tracking-widest text-slate-500">{stat.label}</div>
                  <Icon className="h-4 w-4 text-[#8fd9ad]/85" />
                </div>
                <div className="mt-3 min-h-8 truncate font-mono text-2xl font-semibold tabular-nums text-slate-50">
                  {isDashboardLoading ? <Loader2 className="h-5 w-5 animate-spin text-slate-500" /> : stat.value}
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">{stat.detail}</div>
              </motion.div>
            );
          })}
        </section>

        <AdminReadinessSection ops={ops} />

        <AdminTraceSection
          auditLogs={auditLogs}
          chainEvents={chainEvents}
          error={traceError}
          isLoading={isTraceLoading}
          onReload={loadTrace}
        />

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
          onBatchChange={selectMerkleBatch}
          onChainIdChange={setMerkleChainId}
          onCreateDraft={createMerkleDraft}
          onReload={loadMerkle}
          onTokenAddressChange={setMerkleTokenAddress}
          proofs={merkleProofs}
          selectedBatchId={selectedMerkleBatchId}
          tokenAddress={merkleTokenAddress}
          writesDisabled={writesDisabled}
        />

        {!coreOnlyAdmin ? (
          <AdminListsSection
            activeList={activeList}
            isListLoading={isListLoading}
            listPage={listPages[activeList]}
            listError={listError}
            lists={lists}
            onActiveListChange={changeActiveList}
            onPageChange={changeListPage}
            onQueryChange={changeListSearch}
            onRiskStatusChange={updateRiskFlagStatus}
            page={activeListPage}
            query={listSearch}
            updatingRiskFlag={updatingRiskFlag}
          />
        ) : null}
      </main>
    </div>
  );
}

function AdminAccessPanel({
  adminEmail,
  adminPassword,
  hasAdminToken,
  isSigningIn,
  onAdminEmailChange,
  onAdminPasswordChange,
  onClearToken,
  onLogin,
  onSaveToken,
  onTokenDraftChange,
  tokenDraft,
}: {
  adminEmail: string;
  adminPassword: string;
  hasAdminToken: boolean;
  isSigningIn: boolean;
  onAdminEmailChange: (value: string) => void;
  onAdminPasswordChange: (value: string) => void;
  onClearToken: () => void;
  onLogin: () => void;
  onSaveToken: () => void;
  onTokenDraftChange: (value: string) => void;
  tokenDraft: string;
}) {
  const { t } = useI18n();

  return (
    <section className="admin-panel rounded-[14px] p-4 sm:p-5">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
            <KeyRound className="h-4 w-4 text-[#d7b46a]" />
            {t("admin.access.title")}
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">{t("admin.access.detail")}</p>
        </div>
        <button
          type="button"
          onClick={onClearToken}
          disabled={!hasAdminToken}
          className="admin-action inline-flex h-9 items-center justify-center gap-2 rounded-[10px] px-3 text-xs font-medium uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          <LogOut className="h-4 w-4" />
          {t("admin.access.clearToken")}
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="admin-panel-quiet rounded-[12px] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">{t("admin.access.email")}</span>
              <input
                value={adminEmail}
                onChange={(event) => onAdminEmailChange(event.target.value)}
                disabled={isSigningIn}
                type="email"
                autoComplete="username"
                className="mt-2 h-10 w-full rounded-[10px] border border-slate-700 bg-slate-950/70 px-3 font-mono text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-[#d7b46a]/50 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="admin@example.com"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">{t("admin.access.password")}</span>
              <input
                value={adminPassword}
                onChange={(event) => onAdminPasswordChange(event.target.value)}
                disabled={isSigningIn}
                type="password"
                autoComplete="current-password"
                className="mt-2 h-10 w-full rounded-[10px] border border-slate-700 bg-slate-950/70 px-3 font-mono text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-[#d7b46a]/50 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="password"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={onLogin}
            disabled={isSigningIn}
            className="admin-primary mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] px-3 text-xs font-semibold uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {isSigningIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {t("admin.access.signIn")}
          </button>
        </div>

        <div className="admin-panel-quiet rounded-[12px] p-4">
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">{t("admin.access.token")}</span>
            <textarea
              value={tokenDraft}
              onChange={(event) => onTokenDraftChange(event.target.value)}
              rows={3}
              className="mt-2 w-full resize-none rounded-[10px] border border-slate-700 bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-[#d7b46a]/50"
              placeholder={t("admin.access.tokenPlaceholder")}
            />
          </label>
          <button
            type="button"
            onClick={onSaveToken}
            className="admin-action mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] px-3 text-xs font-medium uppercase tracking-widest transition-colors"
          >
            <Save className="h-4 w-4" />
            {t("admin.access.saveToken")}
          </button>
        </div>
      </div>
    </section>
  );
}

function AdminReadinessSection({ ops }: { ops: AdminOpsDiagnostics | null }) {
  const { t } = useI18n();
  const integration = ops?.contract_integration;
  const artifacts = integration?.abiArtifacts || [];
  const issues = integration?.issues || [];
  const rows = [
    [t("admin.readiness.runtime"), ops?.runtime_path || t("common.loading"), ops?.runtime_path === "production-chain"],
    [t("admin.readiness.reads"), integration?.readyForReads ? t("common.enabled") : t("common.off"), !!integration?.readyForReads],
    [t("admin.readiness.writes"), integration?.readyForWrites ? t("common.enabled") : t("common.off"), !!integration?.readyForWrites],
    [t("admin.readiness.abis"), artifacts.length ? `${artifacts.filter((artifact) => artifact.exists).length}/${artifacts.length}` : t("common.none"), artifacts.length > 0 && artifacts.every((artifact) => artifact.exists)],
  ] as const;

  return (
    <section className="admin-panel rounded-[14px] p-4 sm:p-5">
      <div className="flex flex-col gap-2 border-b border-slate-800 pb-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{t("admin.readiness.title")}</h2>
        <p className="max-w-3xl text-xs leading-5 text-slate-500">{t("admin.readiness.detail")}</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([label, value, ok]) => (
          <div key={label} className="admin-panel-quiet rounded-[12px] p-4">
            <div className="text-[10px] font-medium uppercase tracking-widest text-slate-600">{label}</div>
            <div className={`mt-2 truncate font-mono text-sm uppercase tracking-wide ${ok ? "text-[#8fd9ad]" : "text-amber-200"}`}>{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-[12px] border border-slate-800 bg-slate-950/60 p-3">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-slate-600">{t("admin.readiness.contracts")}</div>
          <div className="grid gap-1 font-mono text-[11px] text-slate-400">
            <span className="truncate">SeasonVault: {ops?.season_vault || t("common.none")}</span>
            <span className="truncate">SeasonClaim: {ops?.season_claim || t("common.none")}</span>
          </div>
        </div>
        <div className="rounded-[12px] border border-slate-800 bg-slate-950/60 p-3">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-slate-600">{t("admin.readiness.issues")}</div>
          {issues.length === 0 ? (
            <div className="text-xs text-slate-500">{t("common.noRows")}</div>
          ) : (
            <div className="grid gap-1">
              {issues.slice(0, 4).map((issue) => (
                <div key={`${issue.key}-${issue.message}`} className="truncate font-mono text-[11px] text-amber-200">
                  {issue.severity}: {issue.key}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AdminTraceSection({
  auditLogs,
  chainEvents,
  error,
  isLoading,
  onReload,
}: {
  auditLogs: AdminAuditLog[];
  chainEvents: ChainEvent[];
  error: string | null;
  isLoading: boolean;
  onReload: () => void;
}) {
  const { locale, t } = useI18n();

  return (
    <section className="admin-panel rounded-[14px] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
            <FileClock className="h-4 w-4 text-[#d7b46a]" />
            {t("admin.trace.title")}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{t("admin.trace.detail")}</p>
        </div>
        <button
          type="button"
          onClick={onReload}
          disabled={isLoading}
          className="admin-action inline-flex h-9 items-center justify-center gap-2 rounded-[10px] px-3 text-xs font-medium uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("common.refresh")}
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-[12px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/85">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="admin-panel-quiet rounded-[12px] p-4">
          <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-slate-500">{t("admin.trace.auditLogs")}</div>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          ) : auditLogs.length === 0 ? (
            <div className="rounded-[10px] border border-slate-800 bg-slate-950/70 px-3 py-4 text-xs text-slate-500">{t("common.noRows")}</div>
          ) : (
            <div className="overflow-hidden rounded-[12px] border border-slate-800 bg-slate-950/70">
              {auditLogs.slice(0, 6).map((log) => (
                <div key={log.id} className="border-b border-slate-800 p-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs text-slate-200">{log.action}</div>
                      <div className="mt-1 truncate text-[11px] text-slate-500">{log.entity_type} / {log.entity_id}</div>
                    </div>
                    <div className="shrink-0 text-right font-mono text-[10px] text-slate-500">{formatDate(log.created_at, locale)}</div>
                  </div>
                  <div className="mt-2 truncate text-[11px] text-slate-500">{log.actor_email || log.actor_user_id || t("common.none")}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="admin-panel-quiet rounded-[12px] p-4">
          <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-slate-500">{t("admin.trace.chainEvents")}</div>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          ) : chainEvents.length === 0 ? (
            <div className="rounded-[10px] border border-slate-800 bg-slate-950/70 px-3 py-4 text-xs text-slate-500">{t("common.noRows")}</div>
          ) : (
            <div className="overflow-hidden rounded-[12px] border border-slate-800 bg-slate-950/70">
              {chainEvents.slice(0, 6).map((event) => (
                <div key={event.id} className="border-b border-slate-800 p-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs text-slate-200">{event.event_name}</div>
                      <div className="mt-1 truncate text-[11px] text-slate-500">{event.contract_role} / {event.apply_status}</div>
                    </div>
                    <div className="shrink-0 text-right font-mono text-[10px] text-slate-500">#{event.log_index}</div>
                  </div>
                  <div className="mt-2 truncate font-mono text-[11px] text-slate-500">{event.tx_hash}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function HeaderSignal({ label, tone, value }: { label: string; tone: "accent" | "neutral" | "warn"; value: string }) {
  const toneClass = tone === "accent"
    ? "text-[#8fd9ad]"
    : tone === "warn"
      ? "text-amber-200"
      : "text-slate-300";

  return (
    <div className="bg-[#070d15]/80 px-4 py-3 sm:px-5">
      <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`mt-1 truncate font-mono text-xs uppercase tracking-wide ${toneClass}`}>{value}</div>
    </div>
  );
}
