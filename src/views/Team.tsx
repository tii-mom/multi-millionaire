import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Crown, Loader2, Plus, RefreshCw, Sparkles, Target, UserPlus, Users } from "lucide-react";
import { motion } from "motion/react";
import { api } from "@/src/lib/api";
import { formatNumber, useI18n } from "@/src/lib/i18n";
import { readBackendAuthToken, readTonWalletSession } from "@/src/lib/tonSession";
import type { SquadLeaderboardRow } from "@/src/lib/types";

interface TeamProps {
  tokenPrice: number;
  myDeposit?: number;
  squadGoal: number;
  setSquadGoal?: (goal: number) => void;
}

export default function Team({ tokenPrice, squadGoal, setSquadGoal }: TeamProps) {
  const { formatError, locale, t } = useI18n();
  const [goalInput, setGoalInput] = useState("");
  const [squadName, setSquadName] = useState("");
  const [waveId, setWaveId] = useState<number | null>(null);
  const [squads, setSquads] = useState<SquadLeaderboardRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
      const rows = await api.listSquads(Number(wave.wave_id));
      setSquads(rows);
    } catch (error) {
      const message = formatError(error, "team.loadFailed");
      setLoadError(message);
      setSquads([]);
    } finally {
      setIsLoading(false);
    }
  }, [formatError]);

  useEffect(() => {
    loadSquads();
  }, [loadSquads]);

  const topSquad = squads[0] || null;
  const squadTotalLocked = useMemo(() => Number(topSquad?.total_locked || 0), [topSquad]);
  const squadMarketValue = squadTotalLocked * tokenPrice;
  const progressPercent = Math.min((squadMarketValue / squadGoal) * 100, 100);

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

  const handleCreateSquad = async () => {
    const token = requireToken();
    const name = squadName.trim();
    if (!token || !waveId) return;
    if (!name) {
      toast.error(t("team.nameRequired"));
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createSquad(waveId, name, token);
      setSquadName("");
      toast.success(t("team.created"));
      await loadSquads();
    } catch (error) {
      toast.error(formatError(error, "team.createFailed"));
    } finally {
      setIsSubmitting(false);
    }
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
      <section className="glass-panel relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#080b0c]/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d7b46a]/45 to-transparent" />

        <div className="relative z-10 mb-4 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2 text-white/[0.52]">
            <Users className="h-4 w-4 text-[#d7b46a]/80" />
            <span className="truncate text-[10px] uppercase tracking-[0.18em]">
              {topSquad ? topSquad.name : t("team.header.fallback")}
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-[#d7b46a]/25 bg-[#d7b46a]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d7b46a]">
            <Sparkles className="h-3 w-3" />
            {topSquad ? t("team.rank.value", { rank: topSquad.rank }) : t("team.rank.none")}
          </div>
        </div>

        <div className="relative z-10">
          <div className="mb-1.5 mt-5 flex items-end justify-between">
            <div className="text-[10px] uppercase tracking-widest text-white/[0.52]">
              {t("team.marketValue")}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-[5px] w-[5px]">
                <span className="relative inline-flex h-[5px] w-[5px] rounded-full bg-[#8fd9ad]" />
              </span>
              <span className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-[#8fd9ad]/75">
                {t("common.rate")}:
                <motion.span key={tokenPrice} initial={{ color: "#fff" }} animate={{ color: "#8fd9ad" }} className="font-mono font-bold tabular-nums">
                  ${formatNumber(tokenPrice, locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                </motion.span>
              </span>
            </div>
          </div>

          <motion.div
            key={squadMarketValue}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 1 }}
            className="mb-6 font-mono text-4xl font-semibold tracking-tight text-white tabular-nums"
          >
            ${formatNumber(squadMarketValue, locale, { maximumFractionDigits: 0 })}
          </motion.div>

          <div className="mb-5 flex items-center gap-2">
            <input
              type="number"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder={t("team.goal.placeholder")}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/35 px-3.5 py-2.5 font-mono text-xs tabular-nums outline-none transition-colors placeholder:text-white/[0.24] focus:border-[#8fd9ad]/45 focus:bg-black/55"
            />
            <button
              type="button"
              onClick={() => {
                const val = Number(goalInput);
                if (val > 0) {
                  setSquadGoal?.(val);
                  setGoalInput("");
                  toast.success(t("team.goal.set", { value: formatNumber(val, locale) }));
                } else {
                  toast.error(t("team.goal.invalid"));
                }
              }}
              className="depth-button focus-ring rounded-lg border border-[#d7b46a]/30 bg-[#d7b46a]/10 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-[#e1c07b] hover:border-[#e1c07b]/60 hover:bg-[#d7b46a]/18"
            >
              {t("common.set")}
            </button>
          </div>

          <div>
            <div className="mb-2 flex items-end justify-between text-[10px] uppercase tracking-widest text-white/[0.52]">
              <span className="flex items-center gap-1.5 text-white/[0.72]">
                <Target className="h-3.5 w-3.5" />
                {t("common.goal")}: ${formatNumber(squadGoal, locale)}
              </span>
              <span className="font-semibold text-[#8fd9ad] tabular-nums">
                {formatNumber(progressPercent, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full border border-white/[0.06] bg-black/55 shadow-inner">
              <div
                className="absolute left-0 top-0 flex h-full items-center justify-end bg-gradient-to-r from-[#2f5f46] via-[#65b986] to-[#8fd9ad] transition-all duration-1000 ease-out"
                style={{ width: `${Math.max(progressPercent, topSquad ? 2 : 0)}%` }}
              >
                <div className="mr-0.5 h-1.5 w-1.5 rounded-full bg-white/90" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="glass-panel w-full rounded-2xl border border-white/[0.08] bg-[#080b0c]/80 p-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
            <Plus className="h-4 w-4 text-[#d7b46a]" />
          </div>
          <input
            value={squadName}
            onChange={(event) => setSquadName(event.target.value)}
            placeholder={t("team.create.placeholder")}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/35 px-3.5 py-2.5 font-mono text-xs outline-none transition-colors placeholder:text-white/[0.24] focus:border-[#8fd9ad]/45"
          />
          <button
            type="button"
            onClick={handleCreateSquad}
            disabled={isSubmitting || !waveId}
            className="depth-button focus-ring flex min-w-[76px] items-center justify-center rounded-lg border border-[#8fd9ad]/35 bg-[#8fd9ad]/15 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-[#b7f3cc] hover:bg-[#8fd9ad]/25 disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.create")}
          </button>
        </div>
      </section>

      <section className="glass-panel rounded-2xl border border-white/[0.08] bg-[#080b0c]/80 p-2 backdrop-blur-2xl">
        <h3 className="flex items-center gap-2 px-3 py-3 text-[10px] uppercase tracking-[0.2em] text-white/[0.52]">
          <Crown className="h-4 w-4 text-[#d7b46a]/85" />
          {t("team.leaderboard")}
        </h3>

        <div className="flex flex-col gap-1">
          {isLoading ? (
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
            <div className="py-8 text-center font-mono text-xs uppercase tracking-widest text-white/[0.42]">
              {t("team.empty")}
            </div>
          ) : (
            squads.map((squad, i) => {
              const locked = Number(squad.total_locked || 0);
              return (
                <div
                  key={squad.id}
                  className={`flex items-center justify-between rounded-xl border px-3 py-3 transition-colors ${
                    i === 0
                      ? "border-[#d7b46a]/25 bg-[#d7b46a]/[0.07]"
                      : "border-transparent hover:bg-white/[0.035]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold shadow-inner ${
                      i === 0 ? "border border-[#d7b46a]/35 bg-[#d7b46a]/15 text-[#e1c07b]" : "border border-white/10 bg-white/5 text-white/50"
                    }`}>
                      #{squad.rank}
                    </div>
                    <div className="min-w-0">
                      <div className={`truncate text-sm font-medium tracking-wide ${i === 0 ? "text-[#e1c07b]" : "text-white/90"}`}>
                        {squad.name}
                      </div>
                      <div className="mt-0.5 text-[9px] uppercase tracking-widest text-white/[0.42]">
                        {t("team.activated", { count: squad.activated_member_count })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end text-right font-mono text-sm">
                      <span className="font-semibold tracking-tight tabular-nums">${formatNumber(locked * tokenPrice, locale, { maximumFractionDigits: 0 })}</span>
                      <span className="mt-0.5 text-[9px] uppercase tracking-widest text-white/[0.42] tabular-nums">
                        ~{formatNumber(locked, locale, { maximumFractionDigits: 0 })} 72H
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleJoinSquad(squad.id)}
                      disabled={isSubmitting}
                      className="depth-button focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/[0.52] hover:border-[#8fd9ad]/45 hover:bg-[#8fd9ad]/15 hover:text-[#b7f3cc] disabled:opacity-50"
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
