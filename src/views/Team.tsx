import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Users, Crown, Sparkles, Plus, Target, Loader2, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import { api } from "@/src/lib/api";
import type { SquadLeaderboardRow } from "@/src/lib/types";
import EmptyState from "@/src/components/ui/EmptyState";
import ErrorState from "@/src/components/ui/ErrorState";
import LoadingCard from "@/src/components/ui/LoadingCard";

interface TeamProps {
  tokenPrice: number;
  myDeposit?: number;
  squadGoal: number;
  setSquadGoal?: (goal: number) => void;
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function Team({ tokenPrice, squadGoal, setSquadGoal }: TeamProps) {
  const [goalInput, setGoalInput] = useState("");
  const [squadName, setSquadName] = useState("");
  const [waveId, setWaveId] = useState<number | null>(null);
  const [squads, setSquads] = useState<SquadLeaderboardRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const message = error instanceof Error ? error.message : "Unable to load squads.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSquads();
  }, [loadSquads]);

  const topSquad = squads[0] || null;
  const squadTotalLocked = useMemo(() => {
    if (!topSquad) return 0;
    return Number(topSquad.total_locked || 0);
  }, [topSquad]);
  const squadMarketValue = squadTotalLocked * tokenPrice;
  const progressPercent = Math.min((squadMarketValue / squadGoal) * 100, 100);

  const requireToken = () => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      toast.error("Sign in before managing squads.");
      return null;
    }
    return token;
  };

  const handleCreateSquad = async () => {
    const token = requireToken();
    const name = squadName.trim();
    if (!token || !waveId) return;
    if (!name) {
      toast.error("Enter a squad name.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createSquad(waveId, name, token);
      setSquadName("");
      toast.success("Squad created.");
      await loadSquads();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create squad.";
      toast.error(message);
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
      toast.success("Joined squad.");
      await loadSquads();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to join squad.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 sm:gap-6 sm:px-6 sm:pb-10">
      {/* Squad Header */}
      <div className="relative overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl sm:rounded-[24px] sm:p-6 group">
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-[#DBFF00]/10 blur-3xl rounded-full" />

        <div className="relative z-10 mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-white/50">
            <Users className="w-5 h-5" />
            <span className="text-[11px] uppercase tracking-widest font-mono">
              {topSquad ? topSquad.name : "Wave Squads"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#DBFF00]/20 bg-[#DBFF00]/10 px-3 py-1.5 font-mono text-[10px] font-semibold tracking-wider text-[#DBFF00]">
            <Sparkles className="w-3 h-3" /> {topSquad ? `Rank #${topSquad.rank}` : "No Rank"}
          </div>
        </div>

        <div className="relative z-10">
          <div className="flex justify-between items-end mt-5 mb-1.5">
            <div className="text-[10px] text-white/50 font-mono uppercase tracking-widest">
              Top Squad Market Value
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-[5px] w-[5px]">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#DBFF00] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-[5px] w-[5px] bg-[#DBFF00]"></span>
              </span>
              <span className="text-[9px] uppercase tracking-widest font-mono text-[#DBFF00]/70 flex items-center gap-1">
                Rate:
                <motion.span key={tokenPrice} initial={{ color: "#fff" }} animate={{ color: "#DBFF00" }} className="tabular-nums font-bold">
                  ${tokenPrice.toFixed(3)}
                </motion.span>
              </span>
            </div>
          </div>
          <motion.div
            key={squadMarketValue}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 1 }}
            className="text-4xl font-mono text-transparent bg-clip-text bg-gradient-to-br from-[#DBFF00] to-[#DBFF00]/60 font-semibold tracking-tighter mb-6 tabular-nums"
          >
            ${formatNumber(squadMarketValue)}
          </motion.div>

          {/* Custom Goal Input */}
          <div className="mb-5 flex items-center gap-2">
            <input
              type="number"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="Set custom goal ($)"
              className="flex-1 bg-black/40 border border-white/10 rounded-[14px] py-2.5 px-3.5 outline-none focus:border-[#DBFF00]/50 transition-colors font-mono text-xs tabular-nums placeholder:text-white/20 focus:bg-black/80 shadow-inner"
            />
            <button
              onClick={() => {
                const val = Number(goalInput);
                if (val > 0) {
                  if (setSquadGoal) setSquadGoal(val);
                  setGoalInput("");
                  toast.success(`Squad goal set to $${val.toLocaleString()}`);
                } else {
                  toast.error("Enter a valid goal amount");
                }
              }}
              className="bg-white/10 text-white border border-white/20 px-4 py-2.5 rounded-[14px] font-bold text-[10px] uppercase tracking-widest hover:bg-[#DBFF00] hover:text-black hover:border-[#DBFF00] transition-colors active:scale-[0.98]"
            >
              Set
            </button>
          </div>

          {/* Squad Progress Bar */}
          <div>
            <div className="flex justify-between items-end text-[10px] font-mono text-white/50 mb-2 uppercase tracking-widest">
              <span className="flex items-center gap-1.5 text-white/70">
                <Target className="w-3.5 h-3.5" />
                Goal: ${squadGoal.toLocaleString()}
              </span>
              <span className="text-[#DBFF00] font-semibold text-[11px] tabular-nums">{progressPercent.toFixed(1)}%</span>
            </div>
            <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden border border-white/[0.05] relative shadow-inner">
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-transparent via-[#DBFF00]/80 to-[#DBFF00] transition-all duration-1000 ease-out flex justify-end items-center"
                style={{ width: `${Math.max(progressPercent, topSquad ? 2 : 0)}%` }}
              >
                <div className="w-1.5 h-1.5 bg-white rounded-full mr-0.5 shadow-[0_0_10px_2px_#DBFF00]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Action */}
      <div className="w-full rounded-[20px] border border-dashed border-white/20 bg-white/[0.02] p-4 backdrop-blur-sm">
        <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center">
          <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 min-[420px]:flex">
            <Plus className="w-4 h-4 text-[#DBFF00]" />
          </div>
          <input
            value={squadName}
            onChange={(event) => setSquadName(event.target.value)}
            placeholder="Create a squad"
            className="min-w-0 flex-1 bg-black/40 border border-white/10 rounded-[14px] py-2.5 px-3.5 outline-none focus:border-[#DBFF00]/50 transition-colors font-mono text-xs placeholder:text-white/20"
          />
          <button
            type="button"
            onClick={handleCreateSquad}
            disabled={isSubmitting || !waveId}
            className="flex items-center justify-center rounded-[14px] bg-[#DBFF00] px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-black transition-colors hover:bg-[#c4e600] active:scale-[0.98] disabled:opacity-60 min-[420px]:shrink-0"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
          </button>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="rounded-[20px] border border-white/10 bg-white/[0.02] p-2 backdrop-blur-xl sm:rounded-[24px]">
        <h3 className="text-[11px] uppercase tracking-[0.2em] font-mono text-white/50 p-4 pb-2 flex items-center gap-2">
          <Crown className="w-4 h-4 text-[#DBFF00]/80" />
          Squad Leaderboard
        </h3>

        <div className="flex flex-col gap-1 mt-2">
          {isLoading ? (
            <LoadingCard title="Loading squads" description="Refreshing current Wave leaderboard." rows={3} />
          ) : loadError ? (
            <ErrorState title="Squads unavailable" message={loadError} onRetry={loadSquads} />
          ) : !waveId ? (
            <EmptyState
              title="No active wave"
              description="Squads open when the backend reports an active Wave."
              actionLabel="Check again"
              onAction={loadSquads}
            />
          ) : squads.length === 0 ? (
            <EmptyState
              title="No squads yet"
              description="Create the first squad for this Wave, then invite members to join."
            />
          ) : (
            squads.map((squad, i) => {
              const locked = Number(squad.total_locked || 0);
              return (
                <div
                  key={squad.id}
                  className={`flex flex-col gap-3 rounded-[16px] p-4 transition-colors min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between ${
                    i === 0
                      ? "bg-[#DBFF00]/5 border border-[#DBFF00]/20"
                      : "hover:bg-white/[0.03] border border-transparent"
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-3.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-[10px] font-bold shadow-inner ${
                      i === 0 ? "bg-[#DBFF00] text-black shadow-[0_0_10px_rgba(219,255,0,0.3)]" : "bg-white/5 text-white/50 border border-white/10"
                    }`}>
                      #{squad.rank}
                    </div>
                    <div className="min-w-0">
                      <div className={`truncate font-medium text-sm tracking-wide ${i === 0 ? "text-[#DBFF00]" : "text-white/90"}`}>
                        {squad.name}
                      </div>
                      <div className="text-[9px] text-white/40 font-mono uppercase tracking-widest mt-0.5">
                        {squad.activated_member_count} activated
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 min-[420px]:justify-end">
                    <div className="font-mono text-sm text-right flex flex-col items-end">
                      <span className="tabular-nums font-semibold tracking-tight">${formatNumber(locked * tokenPrice)}</span>
                      <span className="text-[9px] text-white/40 tabular-nums uppercase tracking-widest mt-0.5">
                        ~{formatNumber(locked)} 72H
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleJoinSquad(squad.id)}
                      disabled={isSubmitting}
                      className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-black hover:bg-[#DBFF00] hover:border-[#DBFF00] transition-colors disabled:opacity-50"
                      aria-label={`Join ${squad.name}`}
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
