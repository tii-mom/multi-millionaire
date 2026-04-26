import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, LogOut, PlugZap, ShieldCheck, Target, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { useIsConnectionRestored, useTonAddress, useTonConnectModal, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { api } from "@/src/lib/api";
import { formatNumber, useI18n } from "@/src/lib/i18n";
import { buildDepositTransferBody, createTonQueryId, deriveLockVaultPositionId, rawTokenAmountToDisplayNumber, toRawTokenAmount } from "@/src/lib/tonTransactions";
import {
  clearBackendAuthToken,
  clearTonWalletSession,
  readBackendAuthToken,
  readTonWalletSession,
  shortWalletAddress,
  writeBackendAuthToken,
  writeTonWalletSession,
} from "@/src/lib/tonSession";
import type { BootstrapData, WalletAuthIntent, WalletBindIntent, WalletBinding } from "@/src/lib/types";
import DepositFlow from "./home/DepositFlow";
import ReceiptSubmission from "./home/ReceiptSubmission";
import WalletBindingFlow from "./home/WalletBindingFlow";
import type { PendingDepositReceipt } from "./home/types";

interface HomeProps {
  tokenPrice: number;
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

export default function Home({ tokenPrice, myDeposit, setMyDeposit, targetValue }: HomeProps) {
  const { formatError, locale, t } = useI18n();
  const [tonConnectUI] = useTonConnectUI();
  const tonModal = useTonConnectModal();
  const tonWallet = useTonWallet();
  const tonAddress = useTonAddress();
  const rawTonAddress = useTonAddress(false);
  const connectionRestored = useIsConnectionRestored();
  const [inputValue, setInputValue] = useState("");
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
  const [walletAuthIntent, setWalletAuthIntent] = useState<WalletAuthIntent | null>(null);
  const [wallets, setWallets] = useState<WalletBinding[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [pendingDepositReceipt, setPendingDepositReceipt] = useState<PendingDepositReceipt | null>(null);
  const previousTonAddressRef = useRef<string | null>(tonSession?.address ?? null);
  const walletAuthInFlightRef = useRef(false);

  const availableBalance = 2450000 - myDeposit;
  const currentFiatValue = myDeposit * tokenPrice;
  const progressPercent = Math.min((currentFiatValue / targetValue) * 100, 100);
  const needed72H = Math.max(0, (targetValue - currentFiatValue) / tokenPrice);
  const goalMilestones = [25, 50, 75, 100];
  const backendUnavailable = !!bootstrapError && !bootstrap;
  const chainMainlineEnabled = bootstrap?.ops?.runtime_path === "production-chain" || !!bootstrap?.feature_flags?.chain_mainline_writes_enabled;
  const depositsPaused = !!bootstrap?.controls?.pause_deposits?.enabled;
  const maintenanceBanner = bootstrap?.controls?.maintenance_banner;
  const receiptVerifierConfigured = !!bootstrap?.ops?.receipt_verifier?.configured;
  const expectedChainId = bootstrap?.contracts?.chain_id || walletAuthIntent?.chain_id || "";
  const tonAccount = (tonWallet as any)?.account;
  const connectedChainId = normalizeTonConnectChainId(tonAccount?.chain);
  const chainMismatch =
    !!expectedChainId && !!connectedChainId && normalizeTonConnectChainId(expectedChainId) !== connectedChainId;
  const missingWalletStateInit =
    !!tonAccount?.address && !!tonAccount?.publicKey && !tonAccount?.walletStateInit;
  const localizedBootstrapError = bootstrapError
    ? formatError(new Error(bootstrapError), "error.network")
    : "";
  const activeWalletLabel = tonSession?.walletName || t("home.ton.walletFallback");
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
          setBootstrapError(error instanceof Error ? error.message : "Backend bootstrap failed.");
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

  const openTonWallet = async () => {
    setApiError(null);
    try {
      tonConnectUI.setConnectRequestParameters({ state: "loading" });
      const intent = await api.createWalletAuthIntent();
      setWalletAuthIntent(intent);
      tonConnectUI.setConnectRequestParameters({
        state: "ready",
        value: { tonProof: intent.payload },
      });
      tonModal.open();
    } catch (error) {
      tonConnectUI.setConnectRequestParameters(null);
      const message = formatError(error, "home.wallet.intentFailed");
      setApiError(message);
      toast.error(message);
    }
  };

  const disconnectTonWallet = async () => {
    try {
      await tonConnectUI.disconnect();
    } catch {
      // The local UI session is still cleared below if the wallet bridge is already gone.
    }

    setAuthToken(null);
    clearBackendAuthToken();
    clearTonWalletSession();
    setTonSession(null);
    previousTonAddressRef.current = null;
    setWallets([]);
    setBindIntent(null);
    setWalletAuthIntent(null);
    setWalletSignature("");
    setPendingDepositReceipt(null);
    setApiError(null);
    toast.message(t("home.ton.disconnected"));
  };

  useEffect(() => {
    if (!connectionRestored || !tonWallet || authToken || walletAuthInFlightRef.current) return;

    const account = (tonWallet as any).account;
    const tonProof = (tonWallet as any).connectItems?.tonProof;
    if (!account?.address || !account?.publicKey) {
      setApiError(t("home.ton.backendAuthWaiting"));
      return;
    }
    if (chainMismatch) {
      setApiError(t("home.ton.chainMismatch", { expected: expectedChainId, actual: connectedChainId }));
      return;
    }
    if (!account.walletStateInit) {
      setApiError(t("home.ton.stateInitMissing"));
      return;
    }
    if (!tonProof || !("proof" in tonProof)) {
      setApiError(t("home.ton.backendAuthWaiting"));
      return;
    }

    const intentToken = walletAuthIntent?.intent_token;
    if (!intentToken) {
      setApiError(t("home.ton.backendPending"));
      return;
    }

    walletAuthInFlightRef.current = true;
    api.walletLogin({
      walletAddress: account.address,
      signature: JSON.stringify({
        account: {
          address: account.address,
          chain: account.chain,
          publicKey: account.publicKey,
          walletStateInit: account.walletStateInit,
        },
        publicKey: account.publicKey,
        walletStateInit: account.walletStateInit,
        proof: tonProof.proof,
      }),
      intentToken,
      walletType: tonWallet.device?.appName || "tonconnect",
    })
      .then((result) => {
        writeBackendAuthToken(result.token);
        setAuthToken(result.token);
        if (result.wallet) {
          setWallets((current) => [result.wallet!, ...current.filter((item) => item.id !== result.wallet!.id)]);
        }
        setWalletAuthIntent(null);
        tonConnectUI.setConnectRequestParameters(null);
        setApiError(null);
        toast.success(t("home.ton.backendReady"));
      })
      .catch((error) => {
        const message = formatError(error, "home.ton.backendPending");
        setApiError(message);
        toast.error(message);
      })
      .finally(() => {
        walletAuthInFlightRef.current = false;
      });
  }, [authToken, chainMismatch, connectedChainId, connectionRestored, expectedChainId, formatError, t, tonConnectUI, tonWallet, walletAuthIntent]);

  const handleDeposit = async () => {
    if (backendUnavailable) {
      const message = t("home.banner.backendUnavailable", { error: localizedBootstrapError });
      setApiError(message);
      toast.error(message);
      return;
    }
    if (bootstrap?.controls?.pause_deposits?.enabled) {
      toast.error(bootstrap.controls.pause_deposits.reason || t("home.banner.depositsPaused"));
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
      const lockVaultAddress = bootstrap?.contracts?.vault;
      if (!lockVaultAddress) {
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
        const body = buildDepositTransferBody({
          waveId,
          amountRaw,
          lockVaultAddress,
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
          waveId,
          positionId,
          ownerAddress,
          vaultAddress: lockVaultAddress,
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
        throw new Error(precheck.reasons?.join(", ") || t("home.deposit.precheckFailed"));
      }

      await api.deposit(waveId, val.toString(), authToken);

      setMyDeposit((p: number) => p + val);
      setInputValue("");
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
        },
        authToken
      );
      const tokenDecimals = Number(bootstrap?.contracts?.token_decimals || 9);
      setMyDeposit((p: number) => p + rawTokenAmountToDisplayNumber(result.position.amount_raw || "0", tokenDecimals));
      setTxHash("");
      setInputValue("");
      setPendingDepositReceipt(null);
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
    <div className="flex flex-col gap-5 px-6 pb-10">
      {(backendUnavailable || maintenanceBanner?.enabled || depositsPaused || !chainMainlineEnabled) && (
        <div className={`rounded-[20px] border px-4 py-3 text-[11px] font-mono leading-relaxed ${
          backendUnavailable ? "border-red-300/25 bg-red-500/10 text-red-100" : "border-amber-200/20 bg-amber-200/10 text-amber-50/90"
        }`}>
          {backendUnavailable
            ? t("home.banner.backendUnavailable", { error: localizedBootstrapError })
            : maintenanceBanner?.enabled
              ? maintenanceBanner.reason || t("home.banner.maintenance")
              : depositsPaused
                ? bootstrap?.controls?.pause_deposits?.reason || t("home.banner.depositsPaused")
                : t("home.banner.staging")}
        </div>
      )}

      <section className="glass-panel relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.035] p-5 backdrop-blur-2xl">
        <div className="pointer-events-none absolute -left-10 -top-10 h-24 w-24 rounded-full bg-[#DBFF00]/[0.08] blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white/[0.62]">
              <Wallet className="h-4 w-4 text-[#DBFF00]" />
              <span className="text-[10px] uppercase tracking-[0.2em]">{t("home.account.title")}</span>
            </div>
            <div className={`text-[9px] uppercase tracking-widest ${tonSession ? "text-[#DBFF00]" : "text-white/35"}`}>
              {!connectionRestored ? t("common.loading") : tonSession ? t("common.connected") : t("common.required")}
            </div>
          </div>

          {!tonSession ? (
            <div className="grid gap-3">
              <div className="rounded-[18px] border border-white/10 bg-black/30 px-4 py-4">
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-white/90">
                  <ShieldCheck className="h-4 w-4 text-[#DBFF00]" />
                  {t("home.ton.title")}
                </div>
                <p className="text-[11px] leading-5 text-white/[0.42]">
                  {t("home.ton.helper")}
                </p>
              </div>
              <button
                type="button"
                onClick={openTonWallet}
                disabled={!connectionRestored}
                className="depth-button focus-ring flex items-center justify-center gap-2 rounded-[18px] bg-[#DBFF00] py-3 text-xs font-bold uppercase tracking-widest text-black hover:bg-[#d3f51c] disabled:cursor-wait disabled:opacity-60"
              >
                {!connectionRestored ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                {connectionRestored ? t("home.ton.connect") : t("home.ton.restoring")}
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3 rounded-[18px] border border-[#DBFF00]/20 bg-[#DBFF00]/[0.06] px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DBFF00] text-black">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white/90">{activeWalletLabel}</div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-[#DBFF00]/80">
                      {shortWalletAddress(tonSession.address)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={disconnectTonWallet}
                  className="flex shrink-0 items-center gap-2 text-[10px] uppercase tracking-widest text-white/[0.52] transition-colors hover:text-white"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {t("home.ton.disconnect")}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[16px] border border-white/10 bg-black/30 px-3 py-3">
                  <div className="text-[9px] uppercase tracking-widest text-white/35">{t("home.account.currentWave")}</div>
                  <div className="mt-1 font-mono text-sm text-white/[0.82]">{waveId ? `#${waveId}` : t("home.account.loadingWave")}</div>
                </div>
                <div className="rounded-[16px] border border-white/10 bg-black/30 px-3 py-3">
                  <div className="text-[9px] uppercase tracking-widest text-white/35">{t("home.ton.backend")}</div>
                  <div className={`mt-1 text-[10px] uppercase tracking-widest ${authToken ? "text-[#DBFF00]" : "text-amber-100/85"}`}>
                    {authToken ? t("home.ton.backendReady") : t("home.ton.backendPendingShort")}
                  </div>
                </div>
              </div>

              {!authToken && (
                <div className="rounded-xl border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-[10px] font-mono leading-relaxed text-amber-50/85">
                  {t("home.ton.backendPending")}
                </div>
              )}
            </div>
          )}

          {apiError && (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-[10px] font-mono text-red-200">
              {apiError}
            </div>
          )}
        </div>
      </section>

      <section className="glass-panel relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl">
        <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-[#DBFF00]/[0.06] blur-[62px]" />
        <div className="relative z-10">
          <div className="mb-4 flex items-end justify-between">
            <div className="flex items-center gap-2 text-white/[0.52]">
              <Target className="h-5 w-5" />
              <span className="text-[11px] uppercase tracking-widest">{t("home.goal.title")}</span>
            </div>
            <div className="font-mono text-lg font-semibold text-[#DBFF00] tabular-nums">
              {formatNumber(progressPercent, locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%
            </div>
          </div>

          <div className="relative flex h-2 w-full items-center overflow-hidden rounded-full border border-white/[0.05] bg-black/55 shadow-inner">
            <div className="absolute inset-x-0 top-1/2 z-0 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            {goalMilestones.map((milestone) => (
              <div
                key={milestone}
                className={`absolute top-1/2 z-10 h-3 w-px -translate-y-1/2 ${
                  progressPercent >= milestone ? "bg-[#DBFF00]/80" : "bg-white/[0.18]"
                }`}
                style={{ left: `${milestone}%` }}
                aria-hidden="true"
              />
            ))}
            <div
              className="absolute left-0 top-0 z-20 flex h-full items-center justify-end bg-gradient-to-r from-transparent via-[#DBFF00]/80 to-[#DBFF00] transition-all duration-1000 ease-out"
              style={{ width: `${Math.max(progressPercent, 2)}%` }}
            >
              <div className="mr-0.5 h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_10px_2px_#DBFF00]" />
            </div>
          </div>

          <div className="mt-4 flex justify-between text-[11px] font-mono tracking-wider text-white/40">
            <span className="text-white/[0.72] tabular-nums">
              ${formatNumber(currentFiatValue, locale, { maximumFractionDigits: 2 })}
            </span>
            <span className="tabular-nums">${formatNumber(targetValue, locale)}</span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1 text-center font-mono text-[8px] uppercase tracking-widest text-white/[0.26]">
            {goalMilestones.map((milestone) => (
              <span key={milestone} className={progressPercent >= milestone ? "text-[#DBFF00]/70" : ""}>
                {milestone}%
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="glass-panel relative flex flex-col items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.035] p-6 text-center backdrop-blur-2xl">
        <div className="absolute right-4 top-3 flex items-center gap-1.5">
          <span className="relative flex h-[5px] w-[5px]">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#DBFF00] opacity-70" />
            <span className="relative inline-flex h-[5px] w-[5px] rounded-full bg-[#DBFF00]" />
          </span>
          <span className="text-[8px] uppercase tracking-widest text-[#DBFF00]/[0.72]">{t("home.need.auto")}</span>
        </div>

        <h3 className="mb-1.5 mt-1 text-[11px] uppercase tracking-[0.2em] text-white/[0.52]">{t("home.need.label")}</h3>
        <motion.div
          key={needed72H}
          initial={{ opacity: 0.8, scale: 0.99 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-3 flex items-baseline gap-2 font-mono text-4xl font-semibold tracking-tighter"
        >
          <span className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent tabular-nums">
            {formatNumber(needed72H, locale, { maximumFractionDigits: 0 })}
          </span>
        </motion.div>

        <div className="text-[10px] uppercase tracking-widest text-white/[0.42]">
          {t("home.need.basedOn")}
          <motion.span
            key={tokenPrice}
            initial={{ color: "#ffffff" }}
            animate={{ color: "#DBFF00" }}
            className="ml-1 font-mono font-bold text-[#DBFF00] tabular-nums"
          >
            ${formatNumber(tokenPrice, locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
          </motion.span>
        </div>
      </section>

      <DepositFlow
        availableBalance={availableBalance}
        backendUnavailable={backendUnavailable}
        chainActionDisabled={chainActionDisabled}
        chainMainlineEnabled={chainMainlineEnabled}
        inputValue={inputValue}
        isConfirming={isConfirming}
        myDeposit={myDeposit}
        onDeposit={handleDeposit}
        onInputChange={setInputValue}
        locale={locale}
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
