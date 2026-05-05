import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Target } from "lucide-react";
import { motion } from "motion/react";
import { useIsConnectionRestored, useTonAddress, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { api } from "@/src/lib/api";
import { formatNumber, useI18n } from "@/src/lib/i18n";
import { DEPOSIT_GOAL_TARGETS, buildDepositTransferBody, createTonQueryId, deriveLockVaultPositionId, rawTokenAmountToDisplayNumber, toRawTokenAmount } from "@/src/lib/tonTransactions";
import {
  clearBackendAuthToken,
  clearTonWalletSession,
  readBackendAuthToken,
  readTonWalletSession,
  writeTonWalletSession,
} from "@/src/lib/tonSession";
import type { BootstrapData, DepositStreakView, WalletBindIntent, WalletBinding } from "@/src/lib/types";
import DepositFlow from "./home/DepositFlow";
import DepositStreakPanel from "./home/DepositStreakPanel";
import ReceiptSubmission from "./home/ReceiptSubmission";
import WalletBindingFlow from "./home/WalletBindingFlow";
import type { PendingDepositReceipt } from "./home/types";

interface HomeProps {
  tokenPrice: number | null;
  myDeposit: number;
  setMyDeposit: Dispatch<SetStateAction<number>>;
  targetValue: number;
}

function normalizeTonConnectChainId(chain: unknown): string | null {
  const value = String(chain || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "-239" || value === "mainnet" || value === "ton-mainnet") return "ton-mainnet";
  if (value === "-3" || value === "testnet" || value === "ton-testnet") return "ton-testnet";
  return value;
}

function wholeUsdToUsd9(value: number) {
  return (BigInt(Math.round(value)) * 1_000_000_000n).toString();
}

const PREVIEW_STREAK_STORAGE_KEY = "72h_deposit_streak_preview";
const PREVIEW_STREAK_PRICE_RAW = "200000000";
const TOKEN_SCALE_RAW = 1_000_000_000n;

function calculatePreviewRequiredRaw(targetUsd: number) {
  const dailyUsd9 = BigInt(Math.round(targetUsd)) * 1_000_000_000n / 100n;
  const price = BigInt(PREVIEW_STREAK_PRICE_RAW);
  return ((dailyUsd9 * TOKEN_SCALE_RAW + price - 1n) / price).toString();
}

function buildPreviewDepositStreak(targetUsd: number, waveId: number | null): DepositStreakView {
  const now = new Date().toISOString();
  const targetUsd9 = wholeUsdToUsd9(targetUsd);
  return {
    goal: {
      id: "preview-deposit-streak",
      user_id: "preview-user",
      wave_id: waveId || 1,
      target_usd9: targetUsd9,
      status: "active",
      started_at: null,
      completed_week_at: null,
      completed_month_at: null,
      created_at: now,
      updated_at: now,
    },
    daily_target_usd9: (BigInt(targetUsd9) / 100n).toString(),
    latest_price_raw: PREVIEW_STREAK_PRICE_RAW,
    required_today_raw: calculatePreviewRequiredRaw(targetUsd),
    current_day_index: null,
    week_completed: false,
    month_completed: false,
    current_consecutive_days: 0,
    monthly_progress_days: 0,
    claimed_week_rewards: 0,
    next_week_reward_index: 1,
    next_week_reward_days_remaining: 7,
    weekly_reward_cap: 4,
    reward_pool_sufficient: true,
    blocked_reward_reason: null,
    streak_broken: false,
    last_missed_day_index: null,
    last_missed_day_start_at: null,
    last_missed_required_usd9: null,
    last_missed_deposited_usd9: null,
    days: [],
    pool: {
      total_raw: "100000000000000000",
      allocated_raw: "0",
      remaining_raw: "100000000000000000",
    },
  };
}

function readPreviewDepositStreak(): DepositStreakView | null {
  try {
    const raw = window.localStorage.getItem(PREVIEW_STREAK_STORAGE_KEY);
    return raw ? JSON.parse(raw) as DepositStreakView : null;
  } catch {
    return null;
  }
}

export default function Home({ tokenPrice, myDeposit, setMyDeposit, targetValue }: HomeProps) {
  const { formatError, locale, t } = useI18n();
  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();
  const tonAddress = useTonAddress();
  const rawTonAddress = useTonAddress(false);
  const connectionRestored = useIsConnectionRestored();
  const [inputValue, setInputValue] = useState("");
  const [selectedTargetValue, setSelectedTargetValue] = useState(() => DEPOSIT_GOAL_TARGETS.includes(targetValue as (typeof DEPOSIT_GOAL_TARGETS)[number]) ? targetValue : 1_000_000);
  const [isConfirming, setIsConfirming] = useState(false);
  const [authToken, setAuthToken] = useState(readBackendAuthToken);
  const [tonSession, setTonSession] = useState(readTonWalletSession);
  const [waveId, setWaveId] = useState<number | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletSignature, setWalletSignature] = useState("");
  const [bindIntent, setBindIntent] = useState<WalletBindIntent | null>(null);
  const [wallets, setWallets] = useState<WalletBinding[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [pendingDepositReceipt, setPendingDepositReceipt] = useState<PendingDepositReceipt | null>(null);
  const [depositStreak, setDepositStreak] = useState<DepositStreakView | null>(null);
  const [depositStreakLoading, setDepositStreakLoading] = useState(false);
  const [depositStreakSaving, setDepositStreakSaving] = useState(false);
  const previousTonAddressRef = useRef<string | null>(tonSession?.address ?? null);

  const availableBalance = 2450000 - myDeposit;
  const hasConfirmedPrice = typeof tokenPrice === "number" && Number.isFinite(tokenPrice) && tokenPrice > 0;
  const currentFiatValue = hasConfirmedPrice ? myDeposit * tokenPrice : null;
  const progressPercent = currentFiatValue == null ? 0 : Math.min((currentFiatValue / selectedTargetValue) * 100, 100);
  const needed72H = currentFiatValue == null ? null : Math.max(0, (selectedTargetValue - currentFiatValue) / tokenPrice);
  const goalMilestones = [25, 50, 75, 100];
  const backendUnavailable = !!bootstrapError && !bootstrap;
  const chainMainlineEnabled = !!bootstrap?.feature_flags?.chain_mainline_writes_enabled;
  const stagingMvpEnabled = !!bootstrap?.feature_flags?.staging_mvp_enabled;
  const depositRuntimeEnabled = chainMainlineEnabled || stagingMvpEnabled;
  const depositsPaused = !!bootstrap?.controls?.pause_deposits?.enabled;
  const maintenanceBanner = bootstrap?.controls?.maintenance_banner;
  const receiptVerifierConfigured = !!bootstrap?.ops?.receipt_verifier?.configured;
  const expectedChainId = bootstrap?.contracts?.chain_id || "";
  const tonAccount = (tonWallet as any)?.account;
  const connectedChainId = normalizeTonConnectChainId(tonAccount?.chain);
  const chainMismatch =
    !!expectedChainId && !!connectedChainId && normalizeTonConnectChainId(expectedChainId) !== connectedChainId;
  const missingWalletStateInit =
    !!tonAccount?.address && !!tonAccount?.publicKey && !tonAccount?.walletStateInit;
  const localizedBootstrapError = bootstrapError
    ? formatError(new Error(bootstrapError), "error.network")
    : "";
  const statusBannerTitle = backendUnavailable
    ? t("home.banner.backendUnavailableTitle")
    : maintenanceBanner?.enabled
      ? t("home.banner.maintenanceTitle")
      : depositsPaused
        ? t("home.banner.depositsPausedTitle")
        : !depositRuntimeEnabled
          ? t("home.banner.readOnlyTitle")
        : stagingMvpEnabled
          ? t("home.banner.stagingTitle")
          : "";
  const statusBannerMessage = backendUnavailable
    ? t("home.banner.backendUnavailableDetail")
    : maintenanceBanner?.enabled
      ? maintenanceBanner.reason || t("home.banner.maintenance")
      : depositsPaused
        ? bootstrap?.controls?.pause_deposits?.reason || t("home.banner.depositsPaused")
        : !depositRuntimeEnabled
          ? t("home.banner.readOnly")
        : stagingMvpEnabled
          ? t("home.banner.staging")
          : "";
  const statusBannerTechnicalDetail = backendUnavailable ? localizedBootstrapError : "";
  const showStatusBannerTechnicalDetail = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV && statusBannerTechnicalDetail);
  const showApiError = !!apiError && apiError !== statusBannerMessage;
  const chainDisabledReason = backendUnavailable
    ? t("home.wallet.disabledBackend")
    : !tonSession
      ? t("home.wallet.disabledConnect")
      : chainMismatch
        ? t("home.ton.chainMismatch", { expected: expectedChainId, actual: connectedChainId })
      : missingWalletStateInit
        ? t("home.ton.stateInitMissing")
      : !authToken
        ? t("home.wallet.disabledBackendAuth")
      : depositsPaused
        ? bootstrap?.controls?.pause_deposits?.reason || t("home.wallet.disabledPaused")
        : !chainMainlineEnabled
          ? t("home.wallet.disabledChain")
          : !receiptVerifierConfigured
            ? t("home.wallet.disabledVerifier")
            : null;
  const chainActionDisabled = !!chainDisabledReason;

  const loadDepositStreak = useCallback(async () => {
    if (!authToken || !waveId) {
      setDepositStreak(readPreviewDepositStreak());
      return;
    }
    setDepositStreakLoading(true);
    try {
      setDepositStreak(await api.depositStreakMe(waveId, authToken));
    } catch {
      setDepositStreak(readPreviewDepositStreak());
    } finally {
      setDepositStreakLoading(false);
    }
  }, [authToken, waveId]);

  useEffect(() => {
    let cancelled = false;

    async function loadBootstrap() {
      try {
        const data = await api.bootstrap();
        if (!cancelled) {
          setBootstrap(data);
          setBootstrapError(null);
          if (data.current_wave?.wave_id) {
            setWaveId(Number(data.current_wave.wave_id));
          }
        }
      } catch (error) {
        if (!cancelled) {
          setBootstrapError(error instanceof Error ? error.message : t("error.bootstrapFailed"));
        }
      }
    }

    loadBootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!connectionRestored) return;

    if (!tonAddress) {
      if (previousTonAddressRef.current) {
        clearTonWalletSession();
        setTonSession(null);
        previousTonAddressRef.current = null;
      }
      return;
    }

    const walletName = tonWallet && "name" in tonWallet ? tonWallet.name : tonWallet?.device.appName || t("home.ton.walletFallback");
    const walletAppName = tonWallet && "appName" in tonWallet ? tonWallet.appName : tonWallet?.device.appName || "ton-wallet";
    const session = {
      address: tonAddress,
      rawAddress: rawTonAddress || tonAddress,
      walletName,
      walletAppName,
      provider: tonWallet?.provider || "tonconnect",
      connectedAt: new Date().toISOString(),
    };

    setTonSession(session);
    writeTonWalletSession(session);
    setWalletAddress(tonAddress);

    if (previousTonAddressRef.current !== tonAddress) {
      toast.success(t("home.ton.connected"));
      previousTonAddressRef.current = tonAddress;
    }
  }, [connectionRestored, rawTonAddress, t, tonAddress, tonWallet]);

  const clearWalletAuthState = useCallback(() => {
    setAuthToken(null);
    clearBackendAuthToken();
    clearTonWalletSession();
    setTonSession(null);
    previousTonAddressRef.current = null;
    setWallets([]);
    setBindIntent(null);
    setWalletSignature("");
    setPendingDepositReceipt(null);
    setApiError(null);
  }, []);

  useEffect(() => {
    loadDepositStreak();
  }, [loadDepositStreak]);

  useEffect(() => {
    const handleAuthenticated = () => {
      setAuthToken(readBackendAuthToken());
      setApiError(null);
    };
    const handleDisconnected = () => {
      clearWalletAuthState();
      toast.message(t("home.ton.disconnected"));
    };
    window.addEventListener("72h-wallet-authenticated", handleAuthenticated);
    window.addEventListener("72h-wallet-disconnected", handleDisconnected);
    return () => {
      window.removeEventListener("72h-wallet-authenticated", handleAuthenticated);
      window.removeEventListener("72h-wallet-disconnected", handleDisconnected);
    };
  }, [clearWalletAuthState, t]);

  const saveDepositStreakGoal = async () => {
    if (!authToken) {
      const preview = buildPreviewDepositStreak(selectedTargetValue, waveId);
      window.localStorage.setItem(PREVIEW_STREAK_STORAGE_KEY, JSON.stringify(preview));
      setDepositStreak(preview);
      setApiError(null);
      toast.success(t("home.streak.previewSaved"));
      return;
    }
    if (!waveId) {
      setApiError(t("home.deposit.noWave"));
      toast.error(t("home.deposit.noWave"));
      return;
    }

    setDepositStreakSaving(true);
    setApiError(null);
    try {
      const next = await api.saveDepositStreakGoal({
        waveId,
        targetUsd9: wholeUsdToUsd9(selectedTargetValue),
      }, authToken);
      setDepositStreak(next);
      toast.success(t("home.streak.goalSaved"));
    } catch (error) {
      const message = formatError(error, "home.streak.goalSaveFailed");
      setApiError(message);
      toast.error(message);
    } finally {
      setDepositStreakSaving(false);
    }
  };

  const handleDeposit = async () => {
    if (backendUnavailable) {
      const message = t("home.banner.backendUnavailableDetail", { error: localizedBootstrapError });
      setApiError(message);
      return;
    }
    if (bootstrap?.controls?.pause_deposits?.enabled) {
      toast.error(bootstrap.controls.pause_deposits.reason || t("home.banner.depositsPaused"));
      return;
    }
    if (!depositRuntimeEnabled) {
      setApiError(t("home.deposit.readOnly"));
      toast.error(t("home.deposit.readOnly"));
      return;
    }
    const val = Number(inputValue);
    if (!val || val <= 0) {
      toast.error(t("home.deposit.invalid"));
      return;
    }
    if (!Number.isInteger(val)) {
      toast.error(t("home.deposit.integer"));
      return;
    }
    if (val > availableBalance) {
      toast.error(t("home.deposit.insufficient"));
      return;
    }
    if (!tonSession) {
      setApiError(t("home.deposit.connectRequired"));
      toast.error(t("home.deposit.connectToast"));
      return;
    }
    if (!authToken) {
      setApiError(t("home.deposit.backendAuthPending"));
      toast.error(t("home.deposit.backendAuthPending"));
      return;
    }
    if (!waveId) {
      setApiError(t("home.deposit.noWave"));
      toast.error(t("home.deposit.noWave"));
      return;
    }
    if (chainMainlineEnabled) {
      if (chainMismatch) {
        const message = t("home.ton.chainMismatch", { expected: expectedChainId, actual: connectedChainId });
        setApiError(message);
        toast.error(message);
        return;
      }
      if (missingWalletStateInit) {
        const message = t("home.ton.stateInitMissing");
        setApiError(message);
        toast.error(message);
        return;
      }
      const depositVaultAddress = bootstrap?.contracts?.deposit_vault;
      if (!depositVaultAddress || bootstrap?.contracts?.deposit_contract_kind !== "deposit_vault") {
        setApiError(t("home.deposit.depositVaultRequired"));
        toast.error(t("home.deposit.depositVaultRequired"));
        return;
      }
      if (!depositVaultAddress) {
        setApiError(t("home.deposit.contractMissing"));
        toast.error(t("home.deposit.contractMissing"));
        return;
      }
      try {
        setIsConfirming(true);
        setApiError(null);
        const tokenDecimals = Number(bootstrap?.contracts?.token_decimals || 9);
        const amountRaw = toRawTokenAmount(inputValue, tokenDecimals);
        const ownerAddress = rawTonAddress || tonSession.rawAddress || tonSession.address;
        const derived = await api.deriveJettonWallet(ownerAddress, authToken);
        const queryId = createTonQueryId();
        const positionId = deriveLockVaultPositionId({ walletAddress: ownerAddress, queryId });
        const seasonId = Number(bootstrap?.contracts?.deposit_season_id || 1);
        const targetUsd9 = (BigInt(selectedTargetValue) * 1_000_000_000n).toString();
        const body = buildDepositTransferBody({
          seasonId,
          waveId,
          targetUsd9,
          amountRaw,
          lockVaultAddress: depositVaultAddress,
          responseAddress: ownerAddress,
          queryId,
        });
        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 300,
          messages: [{
            address: derived.jetton_wallet,
            amount: "150000000",
            payload: body,
          }],
        });
        setPendingDepositReceipt({
          amountRaw,
          queryId,
          seasonId,
          waveId,
          targetUsd9,
          positionId,
          ownerAddress,
          vaultAddress: depositVaultAddress,
          jettonWalletAddress: derived.jetton_wallet,
        });
        setTxHash("");
        setInputValue("");
        toast.success(t("home.deposit.txSubmitted"));
        setApiError(t("home.deposit.txSubmittedFollowup"));
      } catch (error) {
        const message = formatError(error, "home.deposit.failed");
        setApiError(message);
        toast.error(message);
      } finally {
        setIsConfirming(false);
      }
      return;
    }

    setIsConfirming(true);
    setApiError(null);

    try {
      const precheck = await api.depositPrecheck(waveId, authToken);
      if (!precheck.ok) {
        const translatedReasons = precheck.reasons?.map((reason) => {
          const key = `home.deposit.precheckReason.${reason.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
          const translated = t(key);
          return translated === key ? t("home.deposit.precheckReason.unknown") : translated;
        });
        throw new Error(translatedReasons?.join(", ") || t("home.deposit.precheckFailed"));
      }

      const tokenDecimals = Number(bootstrap?.contracts?.token_decimals || 9);
      const amountRaw = toRawTokenAmount(inputValue, tokenDecimals);
      const position = await api.deposit(waveId, amountRaw, authToken);

      setMyDeposit((p: number) => p + rawTokenAmountToDisplayNumber(position.amount_raw || "0", tokenDecimals));
      setInputValue("");
      await loadDepositStreak();
      toast.success(t("home.deposit.recorded", { amount: formatNumber(val, locale) }));
    } catch (error) {
      const message = formatError(error, "home.deposit.failed");
      setApiError(message);
      toast.error(message);
    } finally {
      setIsConfirming(false);
    }
  };

  const loadWallets = async () => {
    if (!authToken) return;

    try {
      setWallets(await api.myWallets(authToken));
    } catch {
      // Wallet binding stays optional when this environment only records display state.
    }
  };

  const requestBindIntent = async () => {
    if (!chainMainlineEnabled) {
      setApiError(t("home.wallet.bindDisabled"));
      return;
    }
    if (!tonSession) {
      setApiError(t("home.wallet.connectFirst"));
      return;
    }
    if (!authToken) {
      setApiError(t("home.wallet.backendAuthPending"));
      return;
    }
    if (!walletAddress.trim()) {
      setApiError(t("home.wallet.addressRequired"));
      return;
    }

    setWalletLoading(true);
    setApiError(null);

    try {
      const intent = await api.createWalletBindIntent(walletAddress.trim(), authToken);
      setBindIntent(intent);
      setWalletSignature("");
      toast.success(t("home.wallet.nonceCreated"));
    } catch (error) {
      const message = formatError(error, "home.wallet.intentFailed");
      setApiError(message);
      toast.error(message);
    } finally {
      setWalletLoading(false);
    }
  };

  const submitWalletBind = async () => {
    if (!chainMainlineEnabled) {
      setApiError(t("home.wallet.bindDisabled"));
      return;
    }
    if (!tonSession) {
      setApiError(t("home.wallet.connectFirst"));
      return;
    }
    if (!authToken) {
      setApiError(t("home.wallet.backendAuthPending"));
      return;
    }
    if (!bindIntent) {
      setApiError(t("home.wallet.nonceFirst"));
      return;
    }
    if (!walletSignature.trim()) {
      setApiError(t("home.wallet.signatureRequired"));
      return;
    }

    setWalletLoading(true);
    setApiError(null);

    try {
      const wallet = await api.bindWallet(
        {
          nonce: bindIntent.nonce,
          walletAddress: walletAddress.trim(),
          signature: walletSignature.trim(),
        },
        authToken
      );
      setWallets((current) => [wallet, ...current.filter((item) => item.id !== wallet.id)]);
      setBindIntent(null);
      setWalletSignature("");
      toast.success(t("home.wallet.submitted"));
    } catch (error) {
      const message = formatError(error, "home.wallet.failed");
      setApiError(message);
      toast.error(message);
    } finally {
      setWalletLoading(false);
    }
  };

  const submitReceipt = async () => {
    if (!chainMainlineEnabled) {
      setApiError(t("home.receipt.disabled"));
      return;
    }
    if (!tonSession) {
      setApiError(t("home.receipt.connectFirst"));
      return;
    }
    if (!authToken) {
      setApiError(t("home.receipt.backendAuthPending"));
      return;
    }
    if (!waveId) {
      setApiError(t("home.deposit.noWave"));
      return;
    }
    if (!pendingDepositReceipt) {
      setApiError(t("home.receipt.pendingRequired"));
      return;
    }
    if (!txHash.trim()) {
      setApiError(t("home.receipt.txRequired"));
      return;
    }

    setReceiptLoading(true);
    setApiError(null);

    try {
      const result = await api.submitDepositReceipt(
        pendingDepositReceipt.waveId,
        {
          txHash: txHash.trim(),
          amount: pendingDepositReceipt.amountRaw,
          walletAddress: pendingDepositReceipt.ownerAddress,
          seasonId: pendingDepositReceipt.seasonId,
          targetUsd9: pendingDepositReceipt.targetUsd9,
        },
        authToken
      );
      const tokenDecimals = Number(bootstrap?.contracts?.token_decimals || 9);
      setMyDeposit((p: number) => p + rawTokenAmountToDisplayNumber(result.position.amount_raw || "0", tokenDecimals));
      setTxHash("");
      setInputValue("");
      setPendingDepositReceipt(null);
      await loadDepositStreak();
      toast.success(t("home.receipt.submitted"));
    } catch (error) {
      const message = formatError(error, "home.receipt.failed");
      setApiError(message);
      toast.error(message);
    } finally {
      setReceiptLoading(false);
    }
  };

  useEffect(() => {
    if (authToken && chainMainlineEnabled) {
      loadWallets();
    }
  }, [authToken, chainMainlineEnabled]);

  return (
    <div className="tab-content-safe flex flex-col gap-4 px-6">
      {showApiError && (
        <div className="status-inline-error rounded-[12px] px-3 py-2 text-[10px] font-mono leading-relaxed">
          {apiError}
        </div>
      )}

      <section className="financial-panel relative overflow-hidden rounded-[16px] p-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="relative z-10">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-white/[0.56]">
              <Target className="h-4 w-4 text-[#d7b46a]" />
              <span className="ui-label">{t("home.goal.title")}</span>
            </div>
            <div className="rounded-md border border-[#d7b46a]/20 bg-[#d7b46a]/[0.07] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#d7b46a] tabular-nums">
              {formatNumber(progressPercent, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
            </div>
          </div>

          <div className="grid grid-cols-[1.1fr_0.9fr] gap-3">
            <div className="min-w-0 rounded-[12px] border border-white/[0.07] bg-black/[0.18] px-3.5 py-3">
              <div className="ui-label text-[9px]">{t("home.need.label")}</div>
              <motion.div
                key={needed72H ?? "unavailable"}
                initial={{ opacity: 0.8, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 flex min-w-0 items-baseline gap-1.5 font-mono text-[1.55rem] font-semibold leading-none tracking-tight text-white"
              >
                <span className="min-w-0 truncate tabular-nums">{needed72H == null ? "--" : formatNumber(needed72H, locale, { maximumFractionDigits: 0 })}</span>
                <span className="text-xs font-bold tracking-widest text-[#d7b46a]">{needed72H == null ? "" : "72H"}</span>
              </motion.div>
              <div className="mt-2 truncate text-[9px] uppercase tracking-[0.08em] text-white/[0.36]">
                {t("home.need.basedOn")}
                <motion.span
                  key={tokenPrice ?? "unavailable"}
                  initial={{ color: "#ffffff" }}
                  animate={{ color: "#d7b46a" }}
                  className="ml-1 font-mono font-bold text-[#d7b46a] tabular-nums"
                >
                  {tokenPrice == null ? t("app.price.unavailable") : `$${formatNumber(tokenPrice, locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`}
                </motion.span>
              </div>
            </div>

            <div className="grid min-w-0 gap-2">
              <div className="rounded-[12px] border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
                <div className="ui-label text-[9px]">{t("common.display")}</div>
                <div className="mt-1 truncate font-mono text-sm font-semibold text-white/85 tabular-nums">
                  {currentFiatValue == null ? "--" : `$${formatNumber(currentFiatValue, locale, { maximumFractionDigits: 0 })}`}
                </div>
              </div>
              <div className="rounded-[12px] border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
                <div className="ui-label text-[9px]">{t("common.goal")}</div>
                <div className="mt-1 truncate font-mono text-sm font-semibold text-white/85 tabular-nums">
                  ${formatNumber(selectedTargetValue, locale)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3">
            <div className="relative flex h-1.5 w-full items-center overflow-hidden rounded-full border border-white/[0.055] bg-black/55 shadow-inner">
              <div className="absolute inset-x-0 top-1/2 z-0 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              {goalMilestones.map((milestone) => (
                <div
                  key={milestone}
                  className={`absolute top-1/2 z-10 h-2.5 w-px -translate-y-1/2 ${
                    progressPercent >= milestone ? "bg-[#d7b46a]/80" : "bg-white/[0.18]"
                  }`}
                  style={{ left: `${milestone}%` }}
                  aria-hidden="true"
                />
              ))}
              <div
                className="absolute left-0 top-0 z-20 flex h-full items-center justify-end bg-gradient-to-r from-[#6f5a2d] via-[#d7b46a]/80 to-[#f0ce83] transition-all duration-1000 ease-out"
                style={{ width: `${Math.max(progressPercent, 2)}%` }}
              >
                <div className="mr-0.5 h-1 w-1 rounded-full bg-white shadow-[0_0_10px_2px_#d7b46a]" />
              </div>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center font-mono text-[8px] uppercase tracking-widest text-white/[0.26]">
              {goalMilestones.map((milestone) => (
                <span key={milestone} className={progressPercent >= milestone ? "text-[#d7b46a]/70" : ""}>
                  {milestone}%
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <DepositStreakPanel
        locale={locale}
        selectedTargetValue={selectedTargetValue}
        streak={depositStreak}
        loading={depositStreakLoading}
        saving={depositStreakSaving}
        onSaveGoal={saveDepositStreakGoal}
        t={t}
      />

      {statusBannerMessage && (
        <div className={`status-notice rounded-[14px] px-4 py-2.5 ${
          backendUnavailable ? "" : "status-notice-caution"
        }`}>
          <div className="flex gap-3">
            <span className={`status-dot mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${backendUnavailable ? "bg-white/42" : "bg-[#d7b46a]/80"}`} />
            <div className="min-w-0">
              <div className={`font-mono text-[9px] uppercase text-white/38 ${locale.startsWith("zh") ? "tracking-normal" : "tracking-[0.2em]"}`}>{statusBannerTitle}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-white/68">{statusBannerMessage}</div>
              {showStatusBannerTechnicalDetail && (
                <details className="mt-1 text-[10px] text-white/38">
                  <summary className="cursor-pointer select-none text-white/48">{t("home.banner.technicalDetail")}</summary>
                  <div className="mt-1 break-words font-mono">{statusBannerTechnicalDetail}</div>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      <DepositFlow
        availableBalance={availableBalance}
        backendUnavailable={backendUnavailable}
        chainActionDisabled={chainActionDisabled}
        chainMainlineEnabled={chainMainlineEnabled}
        depositRuntimeEnabled={depositRuntimeEnabled}
        inputValue={inputValue}
        isConfirming={isConfirming}
        myDeposit={myDeposit}
        onDeposit={handleDeposit}
        onInputChange={setInputValue}
        onTargetChange={setSelectedTargetValue}
        locale={locale}
        selectedTargetValue={selectedTargetValue}
        targetOptions={DEPOSIT_GOAL_TARGETS}
        t={t}
      />

      <WalletBindingFlow
        chainActionDisabled={chainActionDisabled}
        chainDisabledReason={chainDisabledReason}
        chainMainlineEnabled={chainMainlineEnabled}
        walletAddress={walletAddress}
        walletLoading={walletLoading}
        bindIntent={bindIntent}
        walletSignature={walletSignature}
        wallets={wallets}
        onWalletAddressChange={setWalletAddress}
        onWalletSignatureChange={setWalletSignature}
        onRequestBindIntent={requestBindIntent}
        onSubmitWalletBind={submitWalletBind}
        t={t}
      />

      {chainMainlineEnabled && (
        <ReceiptSubmission
          chainActionDisabled={chainActionDisabled}
          receiptLoading={receiptLoading}
          pendingDepositReceipt={pendingDepositReceipt}
          txHash={txHash}
          onTxHashChange={setTxHash}
          onSubmitReceipt={submitReceipt}
          t={t}
        />
      )}
    </div>
  );
}
