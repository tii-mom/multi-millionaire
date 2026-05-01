import { type ReactNode } from "react";
import { toast } from "sonner";
import { Activity, BarChart3, Clock3, Database, Gauge, Radio, RefreshCw, Share2, ShieldAlert, Users, WalletCards } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { formatNumber, useI18n } from "@/src/lib/i18n";
import { rawTokenAmountToDisplayNumber } from "@/src/lib/tonTransactions";
import { useSeasonWarReadModel } from "@/src/lib/useSeasonWar";

const TOKEN_DECIMALS = 9;
const TOTAL_REWARD_POOL = 90_000_000_000;

function displayAtomic(value: string | number | null | undefined) {
  try {
    return rawTokenAmountToDisplayNumber(String(value ?? "0"), TOKEN_DECIMALS);
  } catch {
    return 0;
  }
}

function duration(seconds: number | null | undefined) {
  const total = Math.max(0, Number(seconds || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const marketPeriods = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;

export default function WarRoom() {
  const { locale, t } = useI18n();
  const { data, error, refresh, status } = useSeasonWarReadModel();
  const { current, squads, partialErrors } = data;
  const hasLiveSeason = Boolean(current);
  const topSquad = squads?.squads?.[0] || null;
  const locked72h = (squads?.squads || []).reduce((sum, squad) => sum + displayAtomic(squad.contributionAtomic), 0);
  const teamLocked72h = displayAtomic(topSquad?.contributionAtomic);
  const activatedMembers = (squads?.squads || []).reduce((sum, squad) => sum + squad.activatedMembers, 0);
  const shareText = t("warRoom.shareText", { pool: formatNumber(TOTAL_REWARD_POOL, locale, { maximumFractionDigits: 0 }) });

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText} ${window.location.origin}`);
      toast.success(t("share.copied"));
    } catch {
      toast.error(t("share.copyFailed"));
    }
  };

  return (
    <div className="tab-content-safe flex flex-col gap-4 px-6">
      <section className="financial-panel relative overflow-hidden rounded-[16px] p-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d7b46a]/45 to-transparent" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <motion.div
              animate={{ scale: [1, 1.14, 1], opacity: [0.75, 1, 0.75] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-[#d7b46a]/25 bg-[#d7b46a]/10"
            >
              <Radio className="h-5 w-5 text-[#d7b46a]" />
            </motion.div>
            <div className="min-w-0">
              <span className="ui-label">{t("warRoom.dashboard.kicker")}</span>
              <div className="mt-1 flex items-baseline gap-2">
                <motion.span initial={{ opacity: 0.55, y: -4 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-3xl font-semibold tracking-tight text-[#d7b46a]">
                  --
                </motion.span>
                <span className="flex items-center gap-0.5 font-mono text-xs font-semibold text-white/42">
                  {t("warRoom.dashboard.noMarketData")}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04] text-white/55 hover:text-white"
            aria-label={t("warRoom.refreshAria")}
          >
            <RefreshCw className={`h-4 w-4 ${status === "loading" ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <MarketTile icon={Clock3} label={t("warRoom.metric.timeLeft")} value={current ? duration(current.timeLeftSeconds) : "--"} detail={current?.status || t("warRoom.status.noActiveSeason")} accent="green" />
          <MarketTile icon={Database} label={t("warRoom.dashboard.turnover")} value="--" detail={t("warRoom.dashboard.noMarketData")} accent="blue" />
          <MarketTile icon={Users} label={t("warRoom.dashboard.holders")} value={hasLiveSeason && squads ? formatNumber(activatedMembers, locale, { maximumFractionDigits: 0 }) : "--"} detail={hasLiveSeason && squads ? t("warRoom.squad.active", { count: activatedMembers }) : t("warRoom.status.noActiveSeason")} accent="white" />
        </div>
      </section>

      <PriceChart title={t("warRoom.dashboard.chartTitle")} subtitle={t("warRoom.dashboard.chartUnavailable")} />

      {!hasLiveSeason && (
        <section className="financial-panel rounded-[16px] border-[#d7b46a]/20 bg-[#d7b46a]/[0.055] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#d7b46a]/25 bg-[#d7b46a]/10">
              <Database className="h-5 w-5 text-[#d7b46a]" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{t("warRoom.status.noActiveSeasonTitle")}</div>
              <p className="mt-1 text-[11px] leading-5 text-white/55">{error || t("warRoom.status.noActiveSeasonDetail")}</p>
            </div>
          </div>
        </section>
      )}

      <section className="financial-panel rounded-[16px] border-[#d7b46a]/20 bg-[#d7b46a]/[0.055] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#d7b46a]/25 bg-[#d7b46a]/10">
            <ShieldAlert className="h-5 w-5 text-[#d7b46a]" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">{t("warRoom.readOnly.title")}</div>
            <p className="mt-1 text-[11px] leading-5 text-white/55">{t("warRoom.readOnly.detail")}</p>
          </div>
        </div>
      </section>

      <section className="financial-panel rounded-[16px] p-4">
        <div className="grid grid-cols-7 gap-1.5">
          {marketPeriods.map((period) => (
            <div key={period} className="rounded-[10px] border border-white/10 bg-black/25 px-1.5 py-2 text-center">
              <div className="font-mono text-[10px] text-white/45">{period}</div>
              <div className="mt-1 flex items-center justify-center gap-0.5 font-mono text-[10px] font-semibold text-white/38">
                --
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Panel title={t("warRoom.dashboard.flow")} icon={Gauge}>
          <div className="space-y-3">
            <Pressure label={t("warRoom.dashboard.buy")} value={null} tone="buy" />
            <Pressure label={t("warRoom.dashboard.sell")} value={null} tone="sell" />
          </div>
        </Panel>
        <Panel title={t("warRoom.dashboard.positions")} icon={WalletCards}>
          <div className="space-y-2 font-mono">
            <KpiLine label={t("warRoom.dashboard.totalHold")} value={hasLiveSeason && squads ? `${formatNumber(locked72h, locale, { maximumFractionDigits: 0 })} 72H` : "--"} />
            <KpiLine label={t("warRoom.dashboard.teamHold")} value={hasLiveSeason && topSquad ? `${formatNumber(teamLocked72h, locale, { maximumFractionDigits: 0 })} 72H` : "--"} />
            <KpiLine label={t("warRoom.dashboard.topSquad")} value={topSquad?.name || "--"} />
          </div>
        </Panel>
      </section>

      <section className="financial-panel rounded-[16px] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 ui-label"><Activity className="h-4 w-4 text-[#d7b46a]" />{t("warRoom.dashboard.squadBoard")}</h3>
          <span className="font-mono text-[9px] uppercase tracking-widest text-white/35">{current?.seasonId || t("warRoom.value.syncing")}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {(squads?.squads || []).slice(0, 5).map((squad) => (
            <div key={squad.squadId} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 rounded-[12px] border border-white/10 bg-black/20 px-3 py-2.5">
              <span className="font-mono text-xs text-[#d7b46a]">#{squad.rank}</span>
              <span className="truncate text-sm font-medium text-white/82">{squad.name}</span>
              <span className="font-mono text-[11px] text-[#8fd9ad]">{formatNumber(displayAtomic(squad.contributionAtomic), locale, { maximumFractionDigits: 0 })}</span>
            </div>
          ))}
          {partialErrors.squads && <div className="rounded-[12px] border border-[#d7b46a]/20 bg-[#d7b46a]/10 px-4 py-4 text-center text-[11px] text-[#d7b46a]">{t("warRoom.squad.apiUnavailable")}</div>}
          {!partialErrors.squads && !squads?.squads?.length && <div className="rounded-[12px] border border-white/10 bg-black/20 px-4 py-6 text-center text-[11px] text-white/40">{t("warRoom.squad.empty")}</div>}
        </div>
      </section>

      <section className="financial-panel rounded-[16px] border-[#d7b46a]/20 bg-[#d7b46a]/[0.06] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#d7b46a]/25 bg-[#d7b46a]/10">
            <Share2 className="h-5 w-5 text-[#d7b46a]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white">{t("warRoom.dashboard.shareTitle")}</div>
            <p className="mt-1 text-[11px] leading-5 text-white/55">{shareText}</p>
            <button
              type="button"
              onClick={copyShare}
              className="depth-button focus-ring mt-3 inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#d7b46a]/30 bg-[#d7b46a]/12 px-4 text-[10px] font-bold uppercase tracking-widest text-[#e1c07b]"
            >
              <Share2 className="h-4 w-4" />
              {t("share.copy")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PriceChart({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="financial-panel overflow-hidden rounded-[16px] p-3.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 ui-label"><BarChart3 className="h-4 w-4 text-[#d7b46a]" />{title}</h3>
        </div>
        <div className="text-right">
          <motion.div initial={{ opacity: 0.55, y: -3 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-2xl font-semibold text-[#d7b46a]">
            --
          </motion.div>
        </div>
      </div>

      <div className="relative h-[188px] rounded-[14px] border border-white/10 bg-black/30 p-3">
        <div className="absolute left-3 top-3 rounded-md border border-white/10 bg-black/35 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-white/38">
          {subtitle}
        </div>
        <div className="absolute inset-3 grid grid-rows-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="border-t border-white/[0.055]" />)}
        </div>
        <div className="relative flex h-full items-center justify-center rounded-[12px] border border-dashed border-white/10 bg-black/15 px-6 text-center text-[11px] leading-5 text-white/45">
          {subtitle}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <TickerStat label="24H VOL" value="--" />
        <TickerStat label="HIGH" value="--" />
        <TickerStat label="LOW" value="--" />
      </div>
    </section>
  );
}

function TickerStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-white/10 bg-black/20 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-widest text-white/32">{label}</div>
      <motion.div key={value} initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} className="mt-1 truncate font-mono text-[11px] font-semibold text-white/78">
        {value}
      </motion.div>
    </div>
  );
}

function MarketTile({ icon: Icon, label, value, detail, accent, tickKey }: { icon: LucideIcon; label: string; value: string; detail: string; accent: "gold" | "green" | "blue" | "white"; tickKey?: number }) {
  const tone = accent === "green" ? "text-[#8fd9ad]" : accent === "blue" ? "text-[#8fb7ff]" : accent === "gold" ? "text-[#d7b46a]" : "text-white";
  return (
    <motion.div initial={{ opacity: 0.75, y: 4 }} animate={{ opacity: 1, y: 0 }} className="metric-card rounded-[12px] px-3 py-3">
      <div className="flex items-center justify-between gap-1.5 text-[9px] uppercase tracking-widest text-white/[0.36]">
        <span className="truncate">{label}</span>
        <motion.span animate={{ y: [0, -2, 0], opacity: [0.62, 1, 0.62] }} transition={{ duration: 1.4, repeat: Infinity }}>
          <Icon className={`h-3.5 w-3.5 ${tone}`} />
        </motion.span>
      </div>
      <motion.div key={`${tickKey ?? 0}-${value}`} initial={{ opacity: 0.55, y: -2 }} animate={{ opacity: 1, y: 0 }} className={`mt-2 truncate font-mono text-[1.05rem] font-semibold tracking-tight ${tone}`}>{value}</motion.div>
      <div className="mt-1 truncate text-[9px] text-white/34">{detail}</div>
    </motion.div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="financial-panel rounded-[16px] p-4">
      <h3 className="mb-3 flex items-center justify-between gap-2 ui-label">
        <span>{title}</span>
        <motion.span animate={{ rotate: [0, 8, -8, 0], opacity: [0.62, 1, 0.62] }} transition={{ duration: 1.8, repeat: Infinity }}>
          <Icon className="h-4 w-4 text-[#d7b46a]" />
        </motion.span>
      </h3>
      {children}
    </section>
  );
}

function Pressure({ label, value, tone }: { label: string; value: number | null; tone: "buy" | "sell" }) {
  const color = tone === "buy" ? "from-[#2f5f46] to-[#8fd9ad]" : "from-[#6a3030] to-[#ff8f8f]";
  const width = value == null ? 0 : value;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-white/42">
        <span>{label}</span>
        <span className="font-mono">{value == null ? "--" : `${value}%`}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-black/45">
        <motion.div className={`h-full rounded-full bg-gradient-to-r ${color}`} animate={{ width: `${width}%` }} transition={{ duration: 0.55 }} />
      </div>
    </div>
  );
}

function KpiLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[10px] border border-white/10 bg-black/20 px-3 py-2">
      <span className="truncate text-[10px] uppercase tracking-widest text-white/38">{label}</span>
      <span className="truncate text-right text-[11px] font-semibold text-white/78">{value}</span>
    </div>
  );
}
