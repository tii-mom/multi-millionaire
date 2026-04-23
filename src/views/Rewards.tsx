import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Coins, Gift, Loader2, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import { api } from "@/src/lib/api";
import type { RewardLedger, RewardSummary } from "@/src/lib/types";
import EmptyState from "@/src/components/ui/EmptyState";
import ErrorState from "@/src/components/ui/ErrorState";
import LoadingCard from "@/src/components/ui/LoadingCard";

const emptySummary: RewardSummary = {
  pending_amount: "0",
  approved_amount: "0",
  claimed_amount: "0",
};

function formatAmount(value: string) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function Rewards() {
  const [summary, setSummary] = useState<RewardSummary>(emptySummary);
  const [rewards, setRewards] = useState<RewardLedger[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasAuthToken, setHasAuthToken] = useState(() => Boolean(localStorage.getItem("auth_token")));
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const loadRewards = useCallback(async () => {
    const token = localStorage.getItem("auth_token");
    setHasAuthToken(Boolean(token));
    setLoadError(null);
    if (!token) {
      setSummary(emptySummary);
      setRewards([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [nextSummary, nextRewards] = await Promise.all([
        api.rewardSummary(token),
        api.listRewards(token),
      ]);
      setSummary(nextSummary);
      setRewards(nextRewards);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load rewards.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRewards();
  }, [loadRewards]);

  const handleClaim = async (ledgerId: string) => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      toast.error("Sign in before claiming rewards.");
      return;
    }

    setClaimingId(ledgerId);
    try {
      await api.claimReward(ledgerId, token);
      toast.success("Reward marked as claimed.");
      await loadRewards();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to claim reward.";
      toast.error(message);
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 sm:gap-6 sm:px-6 sm:pb-10">
      <div className="relative overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl sm:rounded-[24px] sm:p-6">
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-[#DBFF00]/10 blur-3xl rounded-full" />
        <div className="relative z-10 mb-5 flex items-center justify-between gap-3 sm:mb-6">
          <div className="flex items-center gap-2 text-white/50">
            <Gift className="w-5 h-5" />
            <span className="text-[11px] uppercase tracking-widest font-mono">Reward Ledger</span>
          </div>
          <div className="shrink-0 rounded-full border border-[#DBFF00]/20 bg-[#DBFF00]/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-[#DBFF00]/70">
            Claim Stub
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-2">
          {[
            ["Pending", summary.pending_amount],
            ["Approved", summary.approved_amount],
            ["Claimed", summary.claimed_amount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[16px] border border-white/10 bg-black/30 px-2.5 py-3 sm:px-3 sm:py-4">
              <div className="text-[9px] uppercase tracking-widest font-mono text-white/35 mb-2">{label}</div>
              <motion.div
                key={value}
                initial={{ opacity: 0.6 }}
                animate={{ opacity: 1 }}
                className="font-mono text-base font-semibold tabular-nums text-[#DBFF00] sm:text-lg"
              >
                {formatAmount(value)}
              </motion.div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[20px] border border-white/10 bg-white/[0.02] p-2 backdrop-blur-xl sm:rounded-[24px]">
        <h3 className="text-[11px] uppercase tracking-[0.2em] font-mono text-white/50 p-4 pb-2 flex items-center gap-2">
          <Coins className="w-4 h-4 text-[#DBFF00]/80" />
          Direct Referral Rewards
        </h3>

        <div className="flex flex-col gap-1 mt-2">
          {isLoading ? (
            <LoadingCard title="Loading rewards" description="Fetching summary and ledger entries." rows={3} />
          ) : loadError ? (
            <ErrorState title="Rewards unavailable" message={loadError} onRetry={loadRewards} />
          ) : !hasAuthToken ? (
            <EmptyState
              title="Sign in required"
              description="Reward ledgers are tied to the current authenticated user."
            />
          ) : rewards.length === 0 ? (
            <EmptyState
              title="No rewards yet"
              description="Direct referral rewards appear after eligible referred locks are processed."
              actionLabel="Refresh"
              onAction={loadRewards}
            />
          ) : (
            rewards.map((reward) => (
              <div
                key={reward.id}
                className="flex flex-col gap-3 rounded-[16px] border border-transparent p-4 transition-colors hover:bg-white/[0.03] min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between"
              >
                <div className="min-w-0 flex items-center gap-3.5">
                  <div className="w-8 h-8 rounded-full bg-white/5 text-[#DBFF00] border border-white/10 flex items-center justify-center">
                    {reward.status === "approved" ? <CheckCircle2 className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm tracking-wide text-white/90 truncate">
                      {reward.reward_type.replace(/_/g, " ")}
                    </div>
                    <div className="text-[9px] text-white/40 font-mono uppercase tracking-widest mt-0.5">
                      {reward.status} · wave #{reward.wave_id}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 min-[420px]:justify-end">
                  <div className="font-mono text-sm text-right flex flex-col items-end">
                    <span className="tabular-nums font-semibold tracking-tight text-[#DBFF00]">{formatAmount(reward.final_amount)}</span>
                    <span className="text-[9px] text-white/40 tabular-nums uppercase tracking-widest mt-0.5">72H</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleClaim(reward.id)}
                    disabled={reward.status !== "approved" || claimingId === reward.id}
                    className="min-w-[64px] bg-white/10 text-white border border-white/10 px-3 py-2 rounded-[14px] font-bold text-[10px] uppercase tracking-widest hover:bg-[#DBFF00] hover:text-black hover:border-[#DBFF00] transition-colors disabled:opacity-40 disabled:hover:bg-white/10 disabled:hover:text-white disabled:hover:border-white/10"
                  >
                    {claimingId === reward.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Claim"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
