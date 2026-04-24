import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Coins, Gift, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import { api } from "@/src/lib/api";
import type { RewardLedger, RewardSummary } from "@/src/lib/types";

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
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [proofLoadingId, setProofLoadingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRewards = useCallback(async () => {
    const token = localStorage.getItem("auth_token");
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
      setSummary(emptySummary);
      setRewards([]);
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
      toast.success("Staging reward marked as claimed.");
      await loadRewards();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to claim reward.";
      toast.error(message);
    } finally {
      setClaimingId(null);
    }
  };

  const handleProof = async (ledgerId: string) => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      toast.error("Sign in before loading a claim proof.");
      return;
    }
    setProofLoadingId(ledgerId);
    try {
      const proof = await api.merkleClaimProof(ledgerId, token);
      toast.success(`Merkle proof available: ${proof.proof.length} proof nodes.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Merkle proof is not available yet.";
      toast.error(message);
    } finally {
      setProofLoadingId(null);
    }
  };

  return (
    <div className="px-6 flex flex-col gap-6 pb-10">
      <div className="bg-white/[0.02] border border-white/10 rounded-[24px] p-6 backdrop-blur-xl relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-[#DBFF00]/10 blur-3xl rounded-full" />
        <div className="relative z-10 flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-white/50">
            <Gift className="w-5 h-5" />
            <span className="text-[11px] uppercase tracking-widest font-mono">Reward Ledger</span>
          </div>
          <div className="text-[9px] uppercase tracking-widest font-mono text-[#DBFF00]/70 border border-[#DBFF00]/20 bg-[#DBFF00]/10 rounded-full px-3 py-1.5">
            Chain-gated
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 relative z-10">
          {[
            ["Pending", summary.pending_amount],
            ["Approved", summary.approved_amount],
            ["Claimed", summary.claimed_amount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[16px] border border-white/10 bg-black/30 px-3 py-4">
              <div className="text-[9px] uppercase tracking-widest font-mono text-white/35 mb-2">{label}</div>
              <motion.div
                key={value}
                initial={{ opacity: 0.6 }}
                animate={{ opacity: 1 }}
                className="text-[#DBFF00] font-mono text-lg font-semibold tabular-nums"
              >
                {formatAmount(value)}
              </motion.div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white/[0.02] border border-white/10 rounded-[24px] p-2 backdrop-blur-xl">
        <h3 className="text-[11px] uppercase tracking-[0.2em] font-mono text-white/50 p-4 pb-2 flex items-center gap-2">
          <Coins className="w-4 h-4 text-[#DBFF00]/80" />
          Direct Referral Rewards
        </h3>

        <div className="flex flex-col gap-1 mt-2">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 text-white/40 font-mono text-xs py-8">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading rewards
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center gap-3 text-center py-8 px-4">
              <div className="font-mono text-xs text-white/55 uppercase tracking-widest">
                Rewards unavailable
              </div>
              <div className="max-w-[280px] text-[11px] leading-5 text-white/35 font-mono">
                {loadError}
              </div>
              <button
                type="button"
                onClick={loadRewards}
                className="mt-1 inline-flex items-center gap-2 rounded-[14px] border border-white/15 bg-white/5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white/80 transition-colors hover:border-[#DBFF00]/40 hover:bg-[#DBFF00]/10 hover:text-[#DBFF00]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          ) : rewards.length === 0 ? (
            <div className="text-center text-white/40 font-mono text-xs py-8 uppercase tracking-widest">
              No rewards yet
            </div>
          ) : (
            rewards.map((reward) => (
              <div
                key={reward.id}
                className="flex items-center justify-between gap-3 p-4 rounded-[16px] transition-colors hover:bg-white/[0.03] border border-transparent"
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
                <div className="flex items-center gap-3">
                  <div className="font-mono text-sm text-right flex flex-col items-end">
                    <span className="tabular-nums font-semibold tracking-tight text-[#DBFF00]">{formatAmount(reward.final_amount)}</span>
                    <span className="text-[9px] text-white/40 tabular-nums uppercase tracking-widest mt-0.5">72H</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => handleProof(reward.id)}
                      disabled={reward.status !== "approved" || proofLoadingId === reward.id}
                      className="min-w-[64px] bg-[#DBFF00]/10 text-[#DBFF00] border border-[#DBFF00]/20 px-3 py-2 rounded-[14px] font-bold text-[10px] uppercase tracking-widest hover:bg-[#DBFF00] hover:text-black hover:border-[#DBFF00] transition-colors disabled:opacity-40 disabled:hover:bg-[#DBFF00]/10 disabled:hover:text-[#DBFF00] disabled:hover:border-[#DBFF00]/20"
                    >
                      {proofLoadingId === reward.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Proof"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClaim(reward.id)}
                      disabled={reward.status !== "approved" || claimingId === reward.id}
                      className="min-w-[64px] bg-white/10 text-white border border-white/10 px-3 py-2 rounded-[14px] font-bold text-[10px] uppercase tracking-widest hover:bg-white/15 transition-colors disabled:opacity-40"
                    >
                      {claimingId === reward.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Stage"}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
