import type React from "react";
import { AlertTriangle, CheckCircle2, Clock3, Database, Loader2, Radio, RefreshCw, ShieldAlert, Trophy, WalletCards, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { formatNumber, useI18n, type Translate } from "@/src/lib/i18n";
import { rawTokenAmountToDisplayNumber } from "@/src/lib/tonTransactions";
import { shortWalletAddress } from "@/src/lib/tonSession";
import { useSeasonWarReadModel } from "@/src/lib/useSeasonWar";
import type { SeasonWarClaimPreview, SeasonWarProvenance, SeasonWarRoundStatus } from "@/src/lib/types";

const TOKEN_DECIMALS = 9;

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

function statusTone(status?: SeasonWarRoundStatus | string | null) {
  if (status === "active" || status === "success" || status === "finalized") return "text-[#8fd9ad] border-emerald-300/20 bg-emerald-300/10";
  if (status === "settling" || status === "pending") return "text-[#d7b46a] border-[#d7b46a]/25 bg-[#d7b46a]/10";
  return "text-rose-200 border-rose-300/20 bg-rose-300/10";
}

function freshnessLabel(source: SeasonWarProvenance | null | undefined, t: Translate) {
  if (!source) return t("warRoom.freshness.unavailable");
  const fresh = source.sourceFreshnessSeconds;
  const age = fresh === null
    ? t("warRoom.freshness.unknownAge")
    : fresh < 60
      ? t("warRoom.freshness.seconds", { count: fresh })
      : fresh < 3600
        ? t("warRoom.freshness.minutes", { count: Math.floor(fresh / 60) })
        : t("warRoom.freshness.hours", { count: Math.floor(fresh / 3600) });
  return t("warRoom.freshness.label", { age, block: source.indexerWatermark || t("warRoom.freshness.pending") });
}

function claimState(preview: SeasonWarClaimPreview | null, t: Translate) {
  if (!preview) return { label: t("warRoom.claim.connect"), detail: t("warRoom.claim.noPath"), safe: false };
  if (preview.claimWindowStatus === "open" && preview.claimableAtomic !== "0") {
    return { label: t("warRoom.claim.open"), detail: t("warRoom.claim.previewOnly"), safe: true };
  }
  return {
    label: t("warRoom.claim.unavailableTitle"),
    detail: preview.disabledReason || t("warRoom.claim.disabledDetail"),
    safe: false,
  };
}

export default function WarRoom() {
  const { formatError, locale, t } = useI18n();
  const { data, error, refresh, status } = useSeasonWarReadModel();
  const { current, radar, squads, me, claimPreview, exportManifest, wallet, partialErrors } = data;
  const topSquad = squads?.squads?.[0] || null;
  const activeRound = radar?.rounds?.find((round) => round.status === "active") || radar?.rounds?.[0] || null;
  const claim = claimState(claimPreview, t);
  const isStale = (current?.sourceFreshnessSeconds ?? 0) > 300;
  const partialErrorMessages = Object.entries(partialErrors).map(([source, message]) => `${source}: ${formatError(new Error(message), "warRoom.status.sourceUnavailable")}`);
  const sourceErrorMessage = error ? formatError(new Error(error), "warRoom.status.sourceUnavailable") : "";

  return (
    <div className="tab-content-safe flex flex-col gap-4 px-6">
      <section className="financial-panel relative overflow-hidden rounded-[16px] p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d7b46a]/45 to-transparent" />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-white/[0.52]">
              <Radio className="h-4 w-4 text-[#d7b46a]/85" />
              <span className="ui-label">{t("warRoom.kicker")}</span>
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {current ? t("warRoom.round", { round: current.roundNumber }) : t("warRoom.titleFallback")}
            </h2>
            <p className="mt-2 max-w-[300px] text-[11px] leading-relaxed text-white/[0.48]">
              {t("warRoom.description")}
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:text-white"
            aria-label={t("warRoom.refreshAria")}
          >
            <RefreshCw className={`h-4 w-4 ${status === "loading" ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="relative z-10 mt-4 grid grid-cols-2 gap-3">
          <Metric icon={Clock3} label={t("warRoom.metric.timeLeft")} value={current ? duration(current.timeLeftSeconds) : "--"} detail={current?.status || t("common.loading")} tone={statusTone(current?.status)} />
          <Metric icon={WalletCards} label={t("warRoom.metric.myLock")} value={me ? formatNumber(displayAtomic(me.myLockAtomic), locale, { maximumFractionDigits: 0 }) : wallet ? t("warRoom.value.review") : t("warRoom.value.connect")} detail={me?.eligible ? t("warRoom.detail.eligible") : me?.eligibilityReason || t("warRoom.detail.walletNeeded")} tone={me?.eligible ? statusTone("active") : statusTone("pending")} />
          <Metric icon={Trophy} label={t("warRoom.metric.squadRank")} value={me?.squadRank ? `#${me.squadRank}` : topSquad ? `#${topSquad.rank}` : "--"} detail={me?.squadId ? `squad ${me.squadId}` : topSquad?.name || t("warRoom.detail.noSquad")} tone={statusTone("active")} />
          <Metric icon={ShieldAlert} label={t("warRoom.metric.claimState")} value={claim.label} detail={claim.detail} tone={claim.safe ? statusTone("active") : statusTone("pending")} compact />
        </div>
      </section>

      {(status === "loading" || status === "error" || isStale || partialErrorMessages.length > 0) && (
        <section className={`rounded-[16px] border p-4 ${status === "error" ? "border-rose-300/20 bg-rose-300/10" : "border-[#d7b46a]/20 bg-[#d7b46a]/10"}`}>
          <div className="flex items-start gap-3">
            {status === "loading" ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-[#d7b46a]" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-[#d7b46a]" />}
            <div>
              <div className="font-mono text-[11px] font-semibold uppercase tracking-widest text-white/75">
                {status === "error" ? t("warRoom.status.sourceUnavailable") : partialErrorMessages.length > 0 ? t("warRoom.status.partialUnavailable") : isStale ? t("warRoom.status.stale") : t("warRoom.status.loading")}
              </div>
              <p className="mt-1 text-[11px] leading-5 text-white/48">
                {sourceErrorMessage || partialErrorMessages.join(" · ") || t("warRoom.status.degraded")}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-3">
        <InfoCard title={t("warRoom.card.roundRoute")} icon={Database} source={radar || current} t={t}>
          <div className="flex items-center justify-between gap-3 rounded-[12px] border border-white/10 bg-black/20 px-3.5 py-3">
            <div className="min-w-0">
              <div className="truncate font-mono text-xs text-white/80">{activeRound ? `Wave ${activeRound.waveId} · ${activeRound.routeTarget}` : t("warRoom.round.noLoaded")}</div>
              <div className="mt-1 truncate text-[10px] text-white/38">{t("warRoom.evidence", { value: activeRound?.evidenceHash || exportManifest?.evidenceHash || t("warRoom.freshness.pending") })}</div>
            </div>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest ${statusTone(activeRound?.status)}`}>{activeRound?.status || "--"}</span>
          </div>
        </InfoCard>

        <InfoCard title={t("warRoom.card.claimPreview")} icon={CheckCircle2} source={claimPreview} t={t}>
          <div className="grid grid-cols-3 gap-2">
            <MiniAmount label={t("warRoom.amount.pending")} value={claimPreview?.pendingAtomic} locale={locale} />
            <MiniAmount label={t("warRoom.amount.claimable")} value={claimPreview?.claimableAtomic} locale={locale} />
            <MiniAmount label={t("warRoom.amount.claimed")} value={claimPreview?.claimedAtomic} locale={locale} />
          </div>
          <div className={`mt-3 rounded-[12px] border px-3.5 py-3 ${claim.safe ? "border-emerald-300/20 bg-emerald-300/10" : "border-[#d7b46a]/20 bg-[#d7b46a]/10"}`}>
            <div className="text-[11px] font-semibold text-white/82">
              {claim.safe ? t("warRoom.claim.open") : t("warRoom.claim.unavailableTitle")}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-white/58">
              {t("warRoom.claim.reason", { reason: claim.detail })}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-white/46">
              {t("warRoom.claim.nextStep")}
            </div>
          </div>
        </InfoCard>

        <InfoCard title={t("warRoom.card.topSquads")} icon={Trophy} source={squads} t={t}>
          <div className="flex flex-col gap-1.5">
            {(squads?.squads || []).slice(0, 4).map((squad) => (
              <div key={squad.squadId} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 rounded-[12px] border border-white/10 bg-black/20 px-3 py-2.5">
                <span className="font-mono text-xs text-[#d7b46a]">#{squad.rank}</span>
                <span className="truncate text-sm font-medium text-white/82">{squad.name}</span>
                <span className="font-mono text-[11px] text-white/48">{t("warRoom.squad.active", { count: squad.activatedMembers })}</span>
              </div>
            ))}
            {partialErrors.squads && <div className="rounded-[12px] border border-[#d7b46a]/20 bg-[#d7b46a]/10 px-4 py-4 text-center text-[11px] text-[#d7b46a]">{t("warRoom.squad.apiUnavailable")}</div>}
            {!partialErrors.squads && !squads?.squads?.length && <div className="rounded-[12px] border border-white/10 bg-black/20 px-4 py-6 text-center text-[11px] text-white/40">{t("warRoom.squad.empty")}</div>}
          </div>
        </InfoCard>

        <div className="rounded-[16px] border border-white/10 bg-white/[0.035] p-4 text-[11px] leading-5 text-white/45">
          {t("warRoom.walletLine", { wallet: wallet ? shortWalletAddress(wallet) : t("warRoom.wallet.notConnected") })}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail, tone, compact }: { icon: LucideIcon; label: string; value: string; detail: string; tone: string; compact?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0.75, y: 4 }} animate={{ opacity: 1, y: 0 }} className="metric-card rounded-[12px] px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-white/[0.36]"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className={`mt-2 line-clamp-2 font-semibold tracking-tight text-white ${compact ? "text-sm" : "text-xl"}`}>{value}</div>
      <div className={`mt-2 line-clamp-2 rounded-md border px-2 py-1 font-mono text-[9px] uppercase tracking-wider ${tone}`}>{detail}</div>
    </motion.div>
  );
}

function InfoCard({ title, icon: Icon, source, children, t }: { title: string; icon: LucideIcon; source?: SeasonWarProvenance | null; children: React.ReactNode; t: Translate }) {
  return (
    <section className="financial-panel rounded-[16px] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 ui-label"><Icon className="h-4 w-4 text-[#d7b46a]/85" />{title}</h3>
        <span className="truncate text-right font-mono text-[9px] uppercase tracking-widest text-white/[0.32]">{freshnessLabel(source, t)}</span>
      </div>
      {children}
    </section>
  );
}

function MiniAmount({ label, value, locale }: { label: string; value?: string; locale: string }) {
  return (
    <div className="rounded-[12px] border border-white/10 bg-black/20 px-3 py-3">
      <div className="text-[9px] uppercase tracking-widest text-white/36">{label}</div>
      <div className="mt-2 truncate font-mono text-xs font-semibold text-white/78">{formatNumber(displayAtomic(value), locale, { maximumFractionDigits: 0 })}</div>
    </div>
  );
}
