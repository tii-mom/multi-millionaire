import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Coins, Gift, Loader2, RefreshCw, ShieldCheck, Users, Waves } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/src/lib/api";
import type { AdminDashboard, AdminReward, AdminRiskFlag, AdminSquad, AdminWave } from "@/src/lib/types";

type ListKey = "waves" | "risk" | "rewards" | "squads";

type AdminLists = {
  waves: AdminWave[];
  risk: AdminRiskFlag[];
  rewards: AdminReward[];
  squads: AdminSquad[];
};

const listTabs = [
  { key: "waves" as const, label: "Waves", icon: Waves },
  { key: "risk" as const, label: "Risk", icon: AlertTriangle },
  { key: "rewards" as const, label: "Rewards", icon: Gift },
  { key: "squads" as const, label: "Squads", icon: Users },
];

const emptyLists: AdminLists = {
  waves: [],
  risk: [],
  rewards: [],
  squads: [],
};

function formatInteger(value: string | number | null | undefined) {
  const text = String(value ?? "0");
  if (!/^\d+$/.test(text)) return text;
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-10 text-center text-xs uppercase tracking-widest text-white/35">
      No rows
    </div>
  );
}

function AdminListRows({ activeList, lists }: { activeList: ListKey; lists: AdminLists }) {
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
                <div className="text-[10px] uppercase tracking-widest text-white/30">Starts</div>
                <div className="mt-1 tabular-nums">{formatDate(wave.start_time)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/30">Ends</div>
                <div className="mt-1 tabular-nums">{formatDate(wave.end_time)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/30">Min Lock</div>
                <div className="mt-1 tabular-nums">{formatInteger(wave.min_lock_amount)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/30">Budget</div>
                <div className="mt-1 tabular-nums">{formatInteger(wave.reward_budget)}</div>
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
              <span className="tabular-nums">{formatDate(flag.created_at)}</span>
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
                <div className="text-[10px] uppercase tracking-widest text-white/30">Final</div>
                <div className="mt-1 tabular-nums">{formatInteger(reward.final_amount)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/30">Gross</div>
                <div className="mt-1 tabular-nums">{formatInteger(reward.gross_amount)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/30">Wave</div>
                <div className="mt-1 tabular-nums">#{reward.wave_id}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/30">Created</div>
                <div className="mt-1 tabular-nums">{formatDate(reward.created_at)}</div>
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
                captain / {squad.captain_email || squad.captain_user_id}
              </div>
            </div>
            <StatusPill status={squad.status} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/55 sm:grid-cols-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/30">Members</div>
              <div className="mt-1 tabular-nums">{squad.member_count}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/30">Activated</div>
              <div className="mt-1 tabular-nums">{squad.activated_member_count}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/30">Locked</div>
              <div className="mt-1 tabular-nums">{formatInteger(squad.total_locked)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/30">Wave</div>
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
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [lists, setLists] = useState<AdminLists>(emptyLists);
  const [activeList, setActiveList] = useState<ListKey>("waves");
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isListLoading, setIsListLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const getToken = useCallback(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setAuthError("Admin token required.");
      return null;
    }
    setAuthError(null);
    return token;
  }, []);

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
      const message = error instanceof Error ? error.message : "Unable to load admin dashboard.";
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
      const message = error instanceof Error ? error.message : "Unable to load admin list.";
      setListError(message);
      toast.error(message);
    } finally {
      setIsListLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    loadList(activeList);
  }, [activeList, loadList]);

  const stats = [
    { label: "Current Wave", value: dashboard?.current_wave?.code || "None", detail: dashboard?.current_wave?.status || "No live wave", icon: Waves },
    { label: "Users", value: formatInteger(dashboard?.total_users), detail: "Total registered", icon: Users },
    { label: "Positions", value: formatInteger(dashboard?.total_positions), detail: "Total locks", icon: Activity },
    { label: "Pending Rewards", value: formatInteger(dashboard?.total_rewards_pending), detail: "Final amount", icon: Coins },
    { label: "Claimed Rewards", value: formatInteger(dashboard?.total_rewards_claimed), detail: "Final amount", icon: Gift },
    { label: "Open Flags", value: formatInteger(dashboard?.open_risk_flags), detail: "Risk queue", icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.28em] text-[#DBFF00]/70">Admin / Ops</div>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-white/95">Read-only Control Surface</h1>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs uppercase tracking-widest text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              App
            </a>
            <button
              type="button"
              onClick={() => {
                loadDashboard();
                loadList(activeList);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs uppercase tracking-widest text-white/75 transition-colors hover:bg-[#DBFF00] hover:text-black"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
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
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/55">Read-only Lists</h2>
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
                    {tab.label}
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
                Loading
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
