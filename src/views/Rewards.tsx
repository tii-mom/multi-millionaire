import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Coins, Gift, Loader2, RefreshCw, Share2, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import { useTonConnectUI } from "@tonconnect/ui-react";
import { api } from "@/src/lib/api";
import { formatNumber, useI18n } from "@/src/lib/i18n";
import { readBackendAuthToken, readTonWalletSession } from "@/src/lib/tonSession";
import { buildClaimRewardBody, createTonQueryId, rawTokenAmountToDisplayNumber } from "@/src/lib/tonTransactions";
import type { BootstrapData, RewardEstimate, RewardLedger, RewardSummary } from "@/src/lib/types";

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
  const [rewardEstimate, setRewardEstimate] = useState<RewardEstimate | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [proofLoadingId, setProofLoadingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingClaimReceipt, setPendingClaimReceipt] = useState<PendingClaimReceipt | null>(null);
  const [claimTxHash, setClaimTxHash] = useState("");
  const [claimReceiptLoading, setClaimReceiptLoading] = useState(false);

  const displayRaw = useCallback((value: string | number | null | undefined, decimals = rewardEstimate?.token_decimals || Number(bootstrap?.contracts?.token_decimals || 9)) => {
    try {
      return rawTokenAmountToDisplayNumber(String(value ?? "0"), decimals);
    } catch {
      return 0;
    }
  }, [bootstrap?.contracts?.token_decimals, rewardEstimate?.token_decimals]);

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
        return t("rewards.status.unknown");
    }
  };
  const rewardTypeLabel = (rewardType: string) => {
    const key = `rewards.type.${rewardType.toLowerCase()}`;
    const translated = t(key);
    return translated === key ? t("rewards.type.unknown") : translated;
  };

  const loadRewards = useCallback(async () => {
    const token = readBackendAuthToken();
    setLoadError(null);
    if (!token) {
      setSummary(emptySummary);
      setRewards([]);
      setRewardEstimate(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const wave = await api.currentWave().catch(() => null);
      const [nextSummary, nextRewards, nextEstimate] = await Promise.all([
        api.rewardSummary(token),
        api.listRewards(token),
        wave?.wave_id ? api.rewardEstimate(Number(wave.wave_id), token).catch(() => null) : Promise.resolve(null),
      ]);
      setSummary(nextSummary);
      setRewards(nextRewards);
      setRewardEstimate(nextEstimate);
    } catch (error) {
      const message = formatError(error, "rewards.unavailable");
      setLoadError(message);
      setSummary(emptySummary);
      setRewards([]);
      setRewardEstimate(null);
    } finally {
      setIsLoading(false);
    }
  }, [formatError]);

  useEffect(() => {
    loadRewards();
  }, [loadRewards]);

  useEffect(() => {
    api.bootstrap()
      .then((data) => {
        setBootstrap(data);
        setBootstrapError(null);
      })
      .catch((error) => {
        setBootstrap(null);
        setBootstrapError(formatError(error, "error.network"));
      });
  }, [formatError]);

  const bootstrapUnavailable = !!bootstrapError && !bootstrap;
  const chainMainlineEnabled = !!bootstrap?.feature_flags?.chain_mainline_writes_enabled;
  const merkleClaimVerifierConfigured = !!bootstrap?.ops?.merkle_claim_verifier?.configured;
  const rewardClaimsPaused = true; // P0 safety: production claim route is not live; records-only UI.
  const merkleClaimAddress = bootstrap?.contracts?.merkle_claim || "";
  const categoryValue = (category: string, fallbackRaw: string) => (
    rewardEstimate?.categories.find((item) => item.category === category)?.pool_amount_raw || fallbackRaw
  );
  const rewardClaimDisabledReason = bootstrapUnavailable
    ? t("rewards.bootstrapUnavailable")
    : rewardClaimsPaused
    ? bootstrap?.controls?.pause_reward_claims?.reason || t("rewards.claimsPaused")
    : !chainMainlineEnabled
      ? t("rewards.chainWritesDisabled")
      : !merkleClaimVerifierConfigured
        ? t("rewards.verifierNotReady")
        : !merkleClaimAddress
          ? t("rewards.claimContractMissing")
          : null;
  const shareText = t("rewards.share.text", { pool: formatNumber(90_000_000_000, locale, { maximumFractionDigits: 0 }) });

  const shareRewardPool = async () => {
    const url = window.location.origin;
    const text = `${shareText} ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: t("share.nativeTitle"), text: shareText, url });
        toast.success(t("share.shared"));
        return;
      } catch {
        // Fall through to clipboard copy when native share is cancelled or unavailable.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("share.copied"));
    } catch {
      toast.error(t("share.copyFailed"));
    }
  };

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
    <div className="tab-content-safe flex flex-col gap-4 px-6">
      {bootstrapUnavailable && (
        <div className="status-notice rounded-[14px] px-4 py-3">
          <div className="flex gap-3">
            <span className="status-dot mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/42" />
            <div className="min-w-0">
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/38">{t("home.banner.backendUnavailableTitle")}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-white/68">{t("rewards.bootstrapUnavailableDetail", { error: bootstrapError })}</div>
            </div>
          </div>
        </div>
      )}
      <section className="financial-panel relative overflow-hidden rounded-[16px] p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d7b46a]/45 to-transparent" />
        <div className="relative z-10 mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/[0.52]">
            <Gift className="h-4 w-4 text-[#d7b46a]/80" />
            <span className="ui-label">{t("rewards.title")}</span>
          </div>
          <div className="rounded-md border border-[#d7b46a]/25 bg-[#d7b46a]/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.08em] text-[#d7b46a]">
            {t("rewards.receiptGated")}
          </div>
        </div>

        <div className="relative z-10 mb-2 text-[11px] font-semibold text-white/82">{t("rewards.myRewards")}</div>
        <div className="relative z-10 mb-4 grid grid-cols-3 gap-2">
          {[
            [t("rewards.review"), summary.pending_amount],
            [t("rewards.proofReady"), summary.approved_amount],
            [t("rewards.recorded"), summary.claimed_amount],
          ].map(([label, value]) => (
            <div key={label} className="metric-card rounded-[12px] px-3 py-3">
              <div className={`mb-2 text-[9px] uppercase text-white/35 ${locale.startsWith("zh") ? "tracking-normal" : "tracking-widest"}`}>{label}</div>
              <motion.div
                key={value}
                initial={{ opacity: 0.6 }}
                animate={{ opacity: 1 }}
                className="font-mono text-lg font-semibold text-[#8fd9ad] tabular-nums"
              >
                {formatNumber(displayRaw(value), locale, { maximumFractionDigits: 0 })}
              </motion.div>
            </div>
          ))}
        </div>

        <div className="relative z-10 mb-4 rounded-[12px] border border-white/10 bg-black/30 px-4 py-3 font-mono text-[10px] uppercase leading-5 tracking-[0.08em] text-white/[0.46]">
          {t("rewards.notice")}
        </div>

        <div className="relative z-10 mb-4 rounded-[12px] border border-white/10 bg-white/[0.025] p-3">
          <div className="mb-1 ui-label">{t("rewards.pool.title")}</div>
          <p className="mb-3 text-[11px] leading-relaxed text-white/[0.46]">
            {t("rewards.pool.subtitle")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              [t("rewards.pool.personal"), categoryValue("personal", "250000000000000000")],
              [t("rewards.pool.team"), categoryValue("team", "125000000000000000")],
              [t("rewards.pool.referral"), categoryValue("referral", "75000000000000000")],
              [t("rewards.pool.leaderboard"), categoryValue("leaderboard", "50000000000000000")],
            ].map(([label, value]) => (
              <div key={label} className="metric-card rounded-[10px] px-3 py-2.5">
                <div className={`text-[9px] uppercase text-white/[0.36] ${locale.startsWith("zh") ? "tracking-normal" : "tracking-widest"}`}>{label}</div>
                <div className="mt-1.5 font-mono text-xs font-semibold text-[#8fd9ad] tabular-nums">
                  {formatNumber(displayRaw(value), locale, { maximumFractionDigits: 0 })} 72H
                </div>
              </div>
            ))}
          </div>
        </div>

        {rewardEstimate && (
          <div className="relative z-10 mb-4 grid grid-cols-2 gap-2 rounded-[12px] border border-[#8fd9ad]/15 bg-[#8fd9ad]/[0.045] p-3">
            {rewardEstimate.categories.map((category) => (
              <div key={category.category} className="min-w-0">
                <div className={`text-[9px] uppercase text-white/[0.34] ${locale.startsWith("zh") ? "tracking-normal" : "tracking-widest"}`}>
                  {t(`rewards.estimate.${category.category}`)}
                </div>
                <div className="mt-1 truncate font-mono text-xs font-semibold text-[#8fd9ad] tabular-nums">
                  {formatNumber(displayRaw(category.estimate_amount_raw), locale, { maximumFractionDigits: 2 })} 72H
                </div>
              </div>
            ))}
          </div>
        )}

      </section>

      <section className="financial-panel rounded-[16px] p-2">
        <h3 className="flex items-center gap-2 px-3 py-3 ui-label">
          <Coins className="h-4 w-4 text-[#d7b46a]/85" />
          {t("rewards.records")}
        </h3>

        {pendingClaimReceipt && (
          <div className="mx-1 mb-2 rounded-[12px] border border-[#d7b46a]/25 bg-[#d7b46a]/[0.07] p-4">
            <div className="mb-2 text-[9px] uppercase tracking-widest text-[#d7b46a]">
              {t("rewards.claimReceiptTitle")}
            </div>
            <div className="mb-3 grid gap-1 font-mono text-[10px] leading-5 text-white/50">
              <div>{t("rewards.claimReceiptLedger", { ledger: shortValue(pendingClaimReceipt.ledgerId) })}</div>
              <div>{t("rewards.claimReceiptAmount", { amount: formatNumber(displayRaw(pendingClaimReceipt.amountRaw), locale, { maximumFractionDigits: 4 }) })}</div>
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
                className="w-full rounded-[10px] border border-white/10 bg-[#050505]/[0.62] px-3 py-3 font-mono text-xs outline-none transition-colors placeholder:text-white/[0.22] focus:border-[#8fd9ad]/45 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={submitClaimReceipt}
                disabled={claimReceiptLoading || !claimTxHash.trim()}
                className="depth-button focus-ring rounded-[10px] border border-[#8fd9ad]/35 bg-[#8fd9ad]/15 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[#b7f3cc] hover:bg-[#8fd9ad]/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {claimReceiptLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t("rewards.submitClaimReceipt")}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1">
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
                className="depth-button focus-ring mt-1 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white/80 hover:border-[#8fd9ad]/40 hover:bg-[#8fd9ad]/10 hover:text-[#b7f3cc]"
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
                className="flex items-center justify-between gap-3 rounded-[12px] border border-transparent px-3 py-3 transition-colors hover:bg-white/[0.035]"
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-white/5 text-[#8fd9ad]">
                    {reward.status === "approved" ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium tracking-wide text-white/90">
                      {rewardTypeLabel(reward.reward_type)}
                    </div>
                    <div className="mt-0.5 text-[9px] uppercase tracking-widest text-white/[0.42]">
                      {rewardStatusLabel(reward.status)} · {t("rewards.wave")} #{reward.wave_id}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end text-right font-mono text-sm">
                    <span className="font-semibold tracking-tight text-[#8fd9ad] tabular-nums">
                      {formatNumber(displayRaw(reward.final_amount), locale, { maximumFractionDigits: 4 })}
                    </span>
                    <span className="mt-0.5 text-[9px] uppercase tracking-widest text-white/[0.42] tabular-nums">72H</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => handleProof(reward.id)}
                      disabled={reward.status !== "approved" || proofLoadingId === reward.id}
                      className="depth-button focus-ring min-w-[68px] rounded-[10px] border border-[#8fd9ad]/30 bg-[#8fd9ad]/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#b7f3cc] hover:border-[#8fd9ad]/50 hover:bg-[#8fd9ad]/18 disabled:opacity-40 disabled:hover:border-[#8fd9ad]/30 disabled:hover:bg-[#8fd9ad]/10 disabled:hover:text-[#b7f3cc]"
                    >
                      {proofLoadingId === reward.id ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t("rewards.proof")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClaim(reward.id)}
                      disabled={true}
                      title={rewardClaimDisabledReason || t("rewards.claimsPaused")}
                      className="depth-button focus-ring min-w-[68px] rounded-[10px] border border-white/10 bg-white/[0.07] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white/85 hover:bg-white/[0.12] disabled:opacity-40"
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

      <section className="financial-panel rounded-[14px] border-[#d7b46a]/20 bg-[#d7b46a]/[0.055] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#d7b46a]/25 bg-[#d7b46a]/10">
            <Share2 className="h-5 w-5 text-[#d7b46a]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white">{t("rewards.share.title")}</div>
            <p className="mt-1 text-[11px] leading-5 text-white/55">{shareText}</p>
            <button
              type="button"
              onClick={shareRewardPool}
              className="depth-button focus-ring mt-3 inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#d7b46a]/30 bg-[#d7b46a]/12 px-4 text-[10px] font-bold uppercase tracking-widest text-[#e1c07b]"
            >
              <Share2 className="h-4 w-4" />
              {t("share.share")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
