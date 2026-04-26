import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Coins, Gift, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import { useTonConnectUI } from "@tonconnect/ui-react";
import { api } from "@/src/lib/api";
import { formatNumber, useI18n } from "@/src/lib/i18n";
import { readBackendAuthToken, readTonWalletSession } from "@/src/lib/tonSession";
import { buildClaimRewardBody, createTonQueryId } from "@/src/lib/tonTransactions";
import type { BootstrapData, RewardLedger, RewardSummary } from "@/src/lib/types";

const emptySummary: RewardSummary = {
  pending_amount: "0",
  approved_amount: "0",
  claimed_amount: "0",
};

type PendingClaimReceipt = {
  ledgerId: string;
  amountRaw: string;
  batchId: string;
  queryId: string;
  recipientAddress: string;
  contractAddress: string;
};

function shortValue(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-8)}` : value;
}

export default function Rewards() {
  const { formatError, locale, t } = useI18n();
  const [tonConnectUI] = useTonConnectUI();
  const [summary, setSummary] = useState<RewardSummary>(emptySummary);
  const [rewards, setRewards] = useState<RewardLedger[]>([]);
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [proofLoadingId, setProofLoadingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingClaimReceipt, setPendingClaimReceipt] = useState<PendingClaimReceipt | null>(null);
  const [claimTxHash, setClaimTxHash] = useState("");
  const [claimReceiptLoading, setClaimReceiptLoading] = useState(false);

  const rewardStatusLabel = (status: RewardLedger["status"]) => {
    switch (status) {
      case "pending":
        return t("rewards.status.pending");
      case "approved":
        return t("rewards.status.approved");
      case "claimed":
        return t("rewards.status.claimed");
      case "rejected":
        return t("rewards.status.rejected");
      default:
        return status;
    }
  };

  const loadRewards = useCallback(async () => {
    const token = readBackendAuthToken();
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
      const message = formatError(error, "rewards.unavailable");
      setLoadError(message);
      setSummary(emptySummary);
      setRewards([]);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [formatError]);

  useEffect(() => {
    loadRewards();
  }, [loadRewards]);

  useEffect(() => {
    api.bootstrap().then(setBootstrap).catch(() => setBootstrap(null));
  }, []);

  const chainMainlineEnabled = !!bootstrap?.feature_flags?.chain_mainline_writes_enabled;
  const merkleClaimVerifierConfigured = !!bootstrap?.ops?.merkle_claim_verifier?.configured;
  const rewardClaimsPaused = !!bootstrap?.controls?.pause_reward_claims?.enabled;
  const merkleClaimAddress = bootstrap?.contracts?.merkle_claim || "";
  const rewardClaimDisabledReason = rewardClaimsPaused
    ? bootstrap?.controls?.pause_reward_claims?.reason || t("rewards.claimsPaused")
    : !chainMainlineEnabled
      ? t("rewards.chainWritesDisabled")
      : !merkleClaimVerifierConfigured
        ? t("rewards.verifierNotReady")
        : !merkleClaimAddress
          ? t("rewards.claimContractMissing")
          : null;

  const handleClaim = async (ledgerId: string) => {
    const walletSession = readTonWalletSession();
    if (!walletSession) {
      toast.error(t("rewards.signInClaim"));
      return;
    }
    const token = readBackendAuthToken();
    if (!token) {
      toast.error(t("rewards.backendAuthPending"));
      return;
    }

    if (rewardClaimDisabledReason) {
      toast.error(rewardClaimDisabledReason);
      return;
    }

    setClaimingId(ledgerId);
    try {
      const proof = await api.merkleClaimProof(ledgerId, token);
      const queryId = createTonQueryId();
      const body = await buildClaimRewardBody({
        ledgerId,
        proof,
        recipientAddress: walletSession.rawAddress,
        queryId,
      });
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{
          address: merkleClaimAddress,
          amount: "150000000",
          payload: body,
        }],
      });
      setPendingClaimReceipt({
        ledgerId,
        amountRaw: proof.amount_raw,
        batchId: String((proof as any).contract_batch_id || proof.batch_id),
        queryId,
        recipientAddress: walletSession.rawAddress,
        contractAddress: merkleClaimAddress,
      });
      setClaimTxHash("");
      toast.success(t("rewards.claimTxSubmitted"));
    } catch (error) {
      toast.error(formatError(error, "rewards.claimFailed"));
    } finally {
      setClaimingId(null);
    }
  };

  const submitClaimReceipt = async () => {
    const token = readBackendAuthToken();
    if (!token) {
      toast.error(t("rewards.backendAuthPending"));
      return;
    }
    if (!pendingClaimReceipt) {
      toast.error(t("rewards.claimReceiptRequired"));
      return;
    }
    if (!claimTxHash.trim()) {
      toast.error(t("rewards.claimReceiptHashRequired"));
      return;
    }

    setClaimReceiptLoading(true);
    try {
      await api.submitMerkleClaimReceipt(pendingClaimReceipt.ledgerId, claimTxHash.trim(), token);
      setPendingClaimReceipt(null);
      setClaimTxHash("");
      toast.success(t("rewards.claimRecorded"));
      await loadRewards();
    } catch (error) {
      toast.error(formatError(error, "rewards.claimReceiptFailed"));
    } finally {
      setClaimReceiptLoading(false);
    }
  };

  const handleProof = async (ledgerId: string) => {
    const walletSession = readTonWalletSession();
    if (!walletSession) {
      toast.error(t("rewards.signInProof"));
      return;
    }
    const token = readBackendAuthToken();
    if (!token) {
      toast.error(t("rewards.backendAuthPending"));
      return;
    }
    setProofLoadingId(ledgerId);
    try {
      const proof = await api.merkleClaimProof(ledgerId, token);
      toast.success(t("rewards.proofAvailable", { count: proof.proof.length }));
    } catch (error) {
      toast.error(formatError(error, "rewards.proofUnavailable"));
    } finally {
      setProofLoadingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5 px-6 pb-10">
      <section className="glass-panel relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#DBFF00]/[0.08] blur-3xl" />
        <div className="relative z-10 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/[0.52]">
            <Gift className="h-5 w-5" />
            <span className="text-[11px] uppercase tracking-widest">{t("rewards.title")}</span>
          </div>
          <div className="rounded-full border border-[#DBFF00]/20 bg-[#DBFF00]/10 px-3 py-1.5 text-[9px] uppercase tracking-widest text-[#DBFF00]/75">
            {t("rewards.receiptGated")}
          </div>
        </div>

        <div className="relative z-10 mb-5 rounded-[18px] border border-white/10 bg-black/30 px-4 py-3 font-mono text-[10px] uppercase leading-5 tracking-wider text-white/[0.46]">
          {t("rewards.notice")}
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-2">
          {[
            [t("rewards.review"), summary.pending_amount],
            [t("rewards.proofReady"), summary.approved_amount],
            [t("rewards.recorded"), summary.claimed_amount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[18px] border border-white/10 bg-black/30 px-3 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="mb-2 text-[9px] uppercase tracking-widest text-white/35">{label}</div>
              <motion.div
                key={value}
                initial={{ opacity: 0.6 }}
                animate={{ opacity: 1 }}
                className="font-mono text-lg font-semibold text-[#DBFF00] tabular-nums"
              >
                {formatNumber(value, locale, { maximumFractionDigits: 0 })}
              </motion.div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel rounded-[24px] border border-white/10 bg-white/[0.035] p-2 backdrop-blur-2xl">
        <h3 className="flex items-center gap-2 p-4 pb-2 text-[11px] uppercase tracking-[0.2em] text-white/[0.52]">
          <Coins className="h-4 w-4 text-[#DBFF00]/80" />
          {t("rewards.records")}
        </h3>

        {pendingClaimReceipt && (
          <div className="mx-2 mb-2 rounded-[18px] border border-[#DBFF00]/20 bg-[#DBFF00]/[0.06] p-4">
            <div className="mb-2 text-[9px] uppercase tracking-widest text-[#DBFF00]/75">
              {t("rewards.claimReceiptTitle")}
            </div>
            <div className="mb-3 grid gap-1 font-mono text-[10px] leading-5 text-white/50">
              <div>{t("rewards.claimReceiptLedger", { ledger: shortValue(pendingClaimReceipt.ledgerId) })}</div>
              <div>{t("rewards.claimReceiptAmount", { amount: pendingClaimReceipt.amountRaw })}</div>
              <div>{t("rewards.claimReceiptBatch", { batch: pendingClaimReceipt.batchId })}</div>
              <div>{t("rewards.claimReceiptQuery", { query: pendingClaimReceipt.queryId })}</div>
              <div>{t("rewards.claimReceiptContract", { contract: shortValue(pendingClaimReceipt.contractAddress) })}</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                type="text"
                value={claimTxHash}
                onChange={(event) => setClaimTxHash(event.target.value)}
                placeholder={t("rewards.claimReceiptPlaceholder")}
                disabled={claimReceiptLoading}
                className="w-full rounded-xl border border-white/10 bg-[#050505]/[0.62] px-3 py-3 font-mono text-xs outline-none transition-colors placeholder:text-white/[0.22] focus:border-[#DBFF00]/[0.42] disabled:opacity-50"
              />
              <button
                type="button"
                onClick={submitClaimReceipt}
                disabled={claimReceiptLoading || !claimTxHash.trim()}
                className="depth-button focus-ring rounded-xl border border-[#DBFF00]/20 bg-[#DBFF00]/10 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[#DBFF00] hover:bg-[#DBFF00] hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {claimReceiptLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t("rewards.submitClaimReceipt")}
              </button>
            </div>
          </div>
        )}

        <div className="mt-2 flex flex-col gap-1">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 font-mono text-xs text-white/[0.42]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("rewards.loading")}
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
              <div className="font-mono text-xs uppercase tracking-widest text-white/[0.58]">
                {t("rewards.unavailable")}
              </div>
              <div className="max-w-[280px] font-mono text-[11px] leading-5 text-white/[0.38]">
                {loadError}
              </div>
              <button
                type="button"
                onClick={loadRewards}
                className="depth-button focus-ring mt-1 inline-flex items-center gap-2 rounded-[16px] border border-white/15 bg-white/5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white/80 hover:border-[#DBFF00]/40 hover:bg-[#DBFF00]/10 hover:text-[#DBFF00]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("common.retry")}
              </button>
            </div>
          ) : rewards.length === 0 ? (
            <div className="py-8 text-center font-mono text-xs uppercase tracking-widest text-white/[0.42]">
              {t("rewards.empty")}
            </div>
          ) : (
            rewards.map((reward) => (
              <div
                key={reward.id}
                className="flex items-center justify-between gap-3 rounded-[18px] border border-transparent p-4 transition-colors hover:bg-white/[0.035]"
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[#DBFF00]">
                    {reward.status === "approved" ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium tracking-wide text-white/90">
                      {reward.reward_type.replace(/_/g, " ")}
                    </div>
                    <div className="mt-0.5 text-[9px] uppercase tracking-widest text-white/[0.42]">
                      {rewardStatusLabel(reward.status)} · wave #{reward.wave_id}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end text-right font-mono text-sm">
                    <span className="font-semibold tracking-tight text-[#DBFF00] tabular-nums">
                      {formatNumber(reward.final_amount, locale, { maximumFractionDigits: 0 })}
                    </span>
                    <span className="mt-0.5 text-[9px] uppercase tracking-widest text-white/[0.42] tabular-nums">72H</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => handleProof(reward.id)}
                      disabled={reward.status !== "approved" || proofLoadingId === reward.id}
                      className="depth-button focus-ring min-w-[68px] rounded-[14px] border border-[#DBFF00]/20 bg-[#DBFF00]/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#DBFF00] hover:border-[#DBFF00] hover:bg-[#DBFF00] hover:text-black disabled:opacity-40 disabled:hover:border-[#DBFF00]/20 disabled:hover:bg-[#DBFF00]/10 disabled:hover:text-[#DBFF00]"
                    >
                      {proofLoadingId === reward.id ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t("rewards.proof")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClaim(reward.id)}
                      disabled={!!rewardClaimDisabledReason || reward.status !== "approved" || claimingId === reward.id}
                      title={rewardClaimDisabledReason || undefined}
                      className="depth-button focus-ring min-w-[68px] rounded-[14px] border border-white/10 bg-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-white/15 disabled:opacity-40"
                    >
                      {claimingId === reward.id ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t("rewards.claim")}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
