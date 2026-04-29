import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Crown, Loader2, RefreshCw, Trophy, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import { api } from "@/src/lib/api";
import { formatNumber, useI18n } from "@/src/lib/i18n";
import { readBackendAuthToken, readTonWalletSession } from "@/src/lib/tonSession";
import { rawTokenAmountToDisplayNumber } from "@/src/lib/tonTransactions";
import type { LeaderboardMe, RewardEstimate, SquadLeaderboardRow } from "@/src/lib/types";

interface LeaderboardProps {
  tokenPrice: number;
}

export default function Leaderboard({ tokenPrice }: LeaderboardProps) {
  const { formatError, locale, t } = useI18n();
  const [leaderboardMode, setLeaderboardMode] = useState<"squad" | "personal">("squad");
  const [waveId, setWaveId] = useState<number | null>(null);
  const [squads, setSquads] = useState<SquadLeaderboardRow[]>([]);
  const [leaderboardMe, setLeaderboardMe] = useState<LeaderboardMe | null>(null);
  const [rewardEstimate, setRewardEstimate] = useState<RewardEstimate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenDecimals, setTokenDecimals] = useState(9);

  const displayRaw = useCallback((value: string | number | null | undefined) => {
    try {
      return rawTokenAmountToDisplayNumber(String(value ?? "0"), tokenDecimals);
    } catch {
      return 0;
    }
  }, [tokenDecimals]);

  const loadSquads = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const wave = await api.currentWave();
      if (!wave?.wave_id) {
        setWaveId(null);
        setSquads([]);
        return;
      }
      setWaveId(Number(wave.wave_id));
      const token = readBackendAuthToken();
      const [rows, myPosition, estimate, bootstrap] = await Promise.all([
        api.listSquads(Number(wave.wave_id)),
        token ? api.leaderboardMe(Number(wave.wave_id), token).catch(() => null) : Promise.resolve(null),
        token ? api.rewardEstimate(Number(wave.wave_id), token).catch(() => null) : Promise.resolve(null),
        api.bootstrap().catch(() => null),
      ]);
      setSquads(rows);
      setLeaderboardMe(myPosition);
      setRewardEstimate(estimate);
      const decimals = Number(bootstrap?.contracts?.token_decimals || estimate?.token_decimals || 9);
      setTokenDecimals(Number.isFinite(decimals) && decimals >= 0 ? decimals : 9);
    } catch (error) {
      const message = formatError(error, "team.loadFailed");
      setLoadError(message);
      setSquads([]);
      setLeaderboardMe(null);
      setRewardEstimate(null);
    } finally {
      setIsLoading(false);
    }
  }, [formatError]);

  useEffect(() => {
    loadSquads();
  }, [loadSquads]);

  const topSquad = squads[0] || null;
  const totalLocked = useMemo(() => squads.reduce((sum, squad) => sum + displayRaw(squad.total_locked || "0"), 0), [displayRaw, squads]);
  const currentSquad = leaderboardMe?.squad || null;
  const leaderboardPoolPerRound = displayRaw(rewardEstimate?.categories.find((category) => category.category === "leaderboard")?.pool_amount_raw || "50000000000000000");

  const requireToken = () => {
    const walletSession = readTonWalletSession();
    if (!walletSession) {
      toast.error(t("team.signIn"));
      return null;
    }
    const token = readBackendAuthToken();
    if (!token) {
      toast.error(t("team.backendAuthPending"));
      return null;
    }
    return token;
  };

  const handleJoinSquad = async (squadId: number) => {
    const token = requireToken();
    if (!token || !waveId) return;

    setIsSubmitting(true);
    try {
      await api.joinSquad(waveId, squadId, token);
      toast.success(t("team.joined"));
      await loadSquads();
    } catch (error) {
      toast.error(formatError(error, "team.joinFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="tab-content-safe flex flex-col gap-4 px-6">
      <section className="financial-panel relative overflow-hidden rounded-[16px] p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d7b46a]/45 to-transparent" />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-white/[0.52]">
              <Trophy className="h-4 w-4 text-[#d7b46a]/85" />
              <span className="ui-label">{t("leaderboard.title")}</span>
            </div>
            <p className="mt-2 max-w-[290px] text-[11px] leading-relaxed text-white/[0.48]">
              {t("leaderboard.subtitle")}
            </p>
          </div>
          <div className="shrink-0 rounded-md border border-[#d7b46a]/25 bg-[#d7b46a]/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#d7b46a]">
            10%
          </div>
        </div>

        <div className="relative z-10 mt-4 grid grid-cols-2 gap-2 rounded-[12px] border border-white/10 bg-black/20 p-1">
          {[
            ["squad", t("leaderboard.mode.squad")],
            ["personal", t("leaderboard.mode.personal")],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setLeaderboardMode(mode as "squad" | "personal")}
              className={`h-9 rounded-[10px] text-[10px] font-bold uppercase tracking-widest transition-colors ${
                leaderboardMode === mode
                  ? "bg-[#d7b46a]/15 text-[#e1c07b]"
                  : "text-white/[0.42] hover:bg-white/[0.04] hover:text-white/75"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative z-10 mt-3 grid grid-cols-2 gap-3">
          <div className="metric-card rounded-[12px] px-3.5 py-3">
            <div className="text-[9px] uppercase tracking-widest text-white/[0.36]">{t("leaderboard.top")}</div>
            <motion.div
              key={topSquad?.id || "empty"}
              initial={{ opacity: 0.65 }}
              animate={{ opacity: 1 }}
              className="mt-2 truncate text-xl font-semibold tracking-tight text-white"
            >
              {topSquad?.name || t("leaderboard.emptyValue")}
            </motion.div>
          </div>
          <div className="metric-card min-w-[112px] rounded-[12px] px-3.5 py-3 text-right">
            <div className="text-[9px] uppercase tracking-widest text-white/[0.36]">{t("leaderboard.poolEstimate")}</div>
            <div className="mt-2 font-mono text-lg font-semibold text-[#8fd9ad] tabular-nums">
              {formatNumber(leaderboardPoolPerRound, locale, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="metric-card rounded-[12px] px-3.5 py-3">
            <div className="text-[9px] uppercase tracking-widest text-white/[0.36]">{t("leaderboard.myPosition")}</div>
            <div className="mt-2 truncate font-mono text-sm font-semibold text-white/80">
              {currentSquad ? `#${currentSquad.rank} / ${currentSquad.squad.name}` : t("leaderboard.notJoined")}
            </div>
          </div>
          <div className="metric-card rounded-[12px] px-3.5 py-3 text-right">
            <div className="text-[9px] uppercase tracking-widest text-white/[0.36]">{t("team.aumColumn")}</div>
            <div className="mt-2 font-mono text-sm font-semibold text-[#8fd9ad] tabular-nums">
              ${formatNumber(totalLocked * tokenPrice, locale, { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </section>

      <section className="financial-panel rounded-[16px] p-2">
        <div className="flex items-center justify-between gap-3 px-3 py-3">
          <h3 className="flex items-center gap-2 ui-label">
            <Crown className="h-4 w-4 text-[#d7b46a]/85" />
            {t("team.leaderboard")}
          </h3>
          <span className="min-w-0 max-w-[190px] truncate text-right font-mono text-[9px] uppercase tracking-widest text-white/[0.32]">
            {t("team.leaderboardDetail")}
          </span>
        </div>

        <div className="mx-1 mb-1 grid grid-cols-[48px_minmax(0,1fr)_minmax(96px,auto)] items-center gap-3 px-3 py-2 text-[9px] uppercase tracking-widest text-white/[0.36]">
          <span>{t("team.rankColumn")}</span>
          <span>{t("team.squadColumn")}</span>
          <span className="text-right">{t("team.aumColumn")}</span>
        </div>

        <div className="flex flex-col gap-1">
          {leaderboardMode === "personal" ? (
            <div className="rounded-[12px] border border-white/10 bg-black/25 px-4 py-8 text-center">
              <div className="font-mono text-xs uppercase tracking-widest text-white/[0.58]">
                {leaderboardMe?.personal ? `#${leaderboardMe.personal.rank} · ${formatNumber(displayRaw(leaderboardMe.personal.total_locked_raw), locale, { maximumFractionDigits: 0 })} 72H` : t("leaderboard.personalEmpty")}
              </div>
              <div className="mx-auto mt-2 max-w-[280px] text-[11px] leading-5 text-white/[0.38]">
                {leaderboardMe?.personal
                  ? t("leaderboard.personalDetail", { count: leaderboardMe.personal.qualifying_position_count })
                  : t("leaderboard.personalEmptyDetail")}
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 font-mono text-xs text-white/[0.42]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("team.loading")}
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
              <div className="font-mono text-xs uppercase tracking-widest text-white/[0.58]">
                {t("team.unavailable")}
              </div>
              <div className="max-w-[280px] font-mono text-[11px] leading-5 text-white/[0.38]">
                {loadError}
              </div>
              <button
                type="button"
                onClick={loadSquads}
                className="depth-button focus-ring mt-1 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white/80 hover:border-[#8fd9ad]/40 hover:bg-[#8fd9ad]/10 hover:text-[#b7f3cc]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("common.retry")}
              </button>
            </div>
          ) : squads.length === 0 ? (
            <div className="rounded-[12px] border border-white/10 bg-black/25 px-4 py-8 text-center">
              <div className="font-mono text-xs uppercase tracking-widest text-white/[0.48]">
                {t("team.empty")}
              </div>
              <div className="mx-auto mt-2 max-w-[260px] text-[11px] leading-5 text-white/[0.36]">
                {t("leaderboard.emptyDetail")}
              </div>
            </div>
          ) : (
            squads.map((squad, index) => {
              const lockedDisplay = displayRaw(squad.total_locked || "0");
              return (
                <div
                  key={squad.id}
                  className={`grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border px-3 py-3 transition-colors ${
                    index === 0
                      ? "border-[#d7b46a]/25 bg-[#d7b46a]/[0.07]"
                      : "border-transparent hover:bg-white/[0.035]"
                  }`}
                >
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] font-mono text-[10px] font-bold shadow-inner ${
                    index === 0 ? "border border-[#d7b46a]/35 bg-[#d7b46a]/15 text-[#e1c07b]" : "border border-white/10 bg-white/5 text-white/50"
                  }`}>
                    #{squad.rank}
                  </div>
                  <div className="min-w-0">
                    <div className={`truncate text-sm font-medium tracking-wide ${index === 0 ? "text-[#e1c07b]" : "text-white/90"}`}>
                      {squad.name}
                    </div>
                    <div className="mt-0.5 text-[9px] uppercase tracking-widest text-white/[0.42]">
                      {t("team.activated", { count: squad.activated_member_count })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end text-right font-mono text-sm">
                      <span className="font-semibold tracking-tight tabular-nums">${formatNumber(lockedDisplay * tokenPrice, locale, { maximumFractionDigits: 0 })}</span>
                      <span className="mt-0.5 text-[9px] uppercase tracking-widest text-white/[0.42] tabular-nums">
                        ~{formatNumber(lockedDisplay, locale, { maximumFractionDigits: 0 })} 72H
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleJoinSquad(squad.id)}
                      disabled={isSubmitting}
                      className="depth-button focus-ring flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/10 bg-white/5 text-white/[0.52] hover:border-[#8fd9ad]/45 hover:bg-[#8fd9ad]/15 hover:text-[#b7f3cc] disabled:opacity-50"
                      aria-label={t("team.joinAria", { name: squad.name })}
                    >
                      <UserPlus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
