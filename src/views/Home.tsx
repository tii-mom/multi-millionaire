import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2, LogOut, PlugZap, ShieldCheck, Target, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useIsConnectionRestored, useTonAddress, useTonConnectModal, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { api } from "@/src/lib/api";
import { formatNumber, useI18n } from "@/src/lib/i18n";
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

interface HomeProps {
  tokenPrice: number;
  myDeposit: number;
  setMyDeposit: Dispatch<SetStateAction<number>>;
  targetValue: number;
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
  const previousTonAddressRef = useRef<string | null>(tonSession?.address ?? null);
  const walletAuthInFlightRef = useRef(false);

  const availableBalance = 2450000 - myDeposit;
  const currentFiatValue = myDeposit * tokenPrice;
  const progressPercent = Math.min((currentFiatValue / targetValue) * 100, 100);
  const needed72H = Math.max(0, (targetValue - currentFiatValue) / tokenPrice);
  const goalMilestones = [25, 50, 75, 100];
  const backendUnavailable = !!bootstrapError && !bootstrap;
  const chainMainlineEnabled = !!bootstrap?.feature_flags?.chain_mainline_writes_enabled;
  const depositsPaused = !!bootstrap?.controls?.pause_deposits?.enabled;
  const maintenanceBanner = bootstrap?.controls?.maintenance_banner;
  const receiptVerifierConfigured = !!bootstrap?.ops?.receipt_verifier?.configured;
  const localizedBootstrapError = bootstrapError
    ? formatError(new Error(bootstrapError), "error.network")
    : "";
  const activeWalletLabel = tonSession?.walletName || t("home.ton.walletFallback");
  const chainDisabledReason = backendUnavailable
    ? t("home.wallet.disabledBackend")
    : !tonSession
      ? t("home.wallet.disabledConnect")
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
    setApiError(null);
    toast.message(t("home.ton.disconnected"));
  };

  useEffect(() => {
    if (!connectionRestored || !tonWallet || authToken || walletAuthInFlightRef.current) return;

    const account = (tonWallet as any).account;
    const tonProof = (tonWallet as any).connectItems?.tonProof;
    if (!account?.address || !account?.publicKey || !tonProof || !("proof" in tonProof)) {
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
      signature: JSON.stringify({ publicKey: account.publicKey, proof: tonProof.proof }),
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
  }, [authToken, connectionRestored, formatError, t, tonConnectUI, tonWallet, walletAuthIntent]);

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
      setApiError(t("home.deposit.walletFlowRequired"));
      toast.error(t("home.deposit.walletFlowRequired"));
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
      // Wallet binding is optional while staging/off-chain mode is active.
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
    if (!txHash.trim()) {
      setApiError(t("home.receipt.txRequired"));
      return;
    }

    setReceiptLoading(true);
    setApiError(null);

    try {
      const result = await api.submitDepositReceipt(
        waveId,
        {
          txHash: txHash.trim(),
          amount: inputValue || undefined,
          walletAddress: walletAddress.trim() || undefined,
        },
        authToken
      );
      setMyDeposit((p: number) => p + Number(result.position.amount_raw || 0));
      setTxHash("");
      setInputValue("");
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

      <section className="glass-panel overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.025] backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.025] px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5">
              <Wallet className="h-4 w-4 text-[#DBFF00]" />
            </div>
            <span className="text-sm font-medium tracking-wide">{t("home.deposit.title")}</span>
          </div>
          <div className="relative flex h-[28px] min-w-[110px] justify-end overflow-hidden font-mono text-xl tabular-nums">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={myDeposit}
                initial={{ y: -20, opacity: 0, color: "#DBFF00" }}
                animate={{ y: 0, opacity: 1, color: "#ffffff" }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="absolute right-0"
              >
                {formatNumber(myDeposit, locale)} <span className="text-[10px] uppercase tracking-widest text-white/50">72H</span>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="flex flex-col gap-5 p-6">
          <div className="group relative flex flex-col gap-2">
            <div className="absolute right-5 top-1/2 z-20 flex -translate-y-1/2 items-center gap-2">
              <button
                type="button"
                onClick={() => setInputValue(availableBalance.toString())}
                className="depth-button focus-ring rounded border border-[#DBFF00]/20 bg-white/5 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-[#DBFF00] hover:bg-[#DBFF00] hover:text-black"
              >
                {t("common.max")}
              </button>
              <div className="pointer-events-none font-mono text-2xl font-black uppercase tracking-tighter text-white/10 transition-colors group-focus-within:text-[#DBFF00]/10">
                72H
              </div>
            </div>

            <input
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="0"
              disabled={isConfirming || backendUnavailable}
              className="w-full rounded-[18px] border border-white/[0.07] bg-[#050505]/[0.62] py-6 pl-6 pr-[120px] font-mono text-4xl tabular-nums shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] outline-none ring-[#DBFF00]/5 transition-colors placeholder:text-white/[0.08] hover:bg-[#050505]/[0.82] focus:border-[#DBFF00]/[0.42] focus:bg-black/70 focus:ring-2 disabled:opacity-50"
            />

            <div className="absolute -top-3 right-2 z-30 flex items-center gap-1 bg-[#070707] px-2 text-[9px] uppercase tracking-widest text-white/30">
              {t("common.display")}:
              <div className="relative inline-flex min-w-[54px] justify-end">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={availableBalance}
                    initial={{ y: -10, opacity: 0, color: "#DBFF00" }}
                    animate={{ y: 0, opacity: 1, color: "rgba(255,255,255,0.3)" }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="absolute bottom-0 right-0 top-0 flex"
                  >
                    {formatNumber(availableBalance, locale)}
                  </motion.span>
                </AnimatePresence>
                <span className="invisible">{formatNumber(availableBalance, locale)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-[18px] border border-white/10 bg-black/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">{t("home.wallet.title")}</div>
                <div className="mt-1 text-[11px] text-white/35">{chainDisabledReason || t("home.deposit.walletFlowRequired")}</div>
              </div>
              <div className={`shrink-0 text-[9px] uppercase tracking-widest ${chainMainlineEnabled ? "text-[#DBFF00]" : "text-amber-100"}`}>
                {chainMainlineEnabled ? t("home.wallet.enabled") : t("home.wallet.offChain")}
              </div>
            </div>

            <input
              type="text"
              value={walletAddress}
              onChange={(event) => setWalletAddress(event.target.value)}
              placeholder={t("home.wallet.addressPlaceholder")}
              disabled={chainActionDisabled || walletLoading}
              className="w-full rounded-xl border border-white/10 bg-[#050505]/[0.62] px-3 py-3 font-mono text-xs outline-none transition-colors placeholder:text-white/[0.22] focus:border-[#DBFF00]/[0.42] disabled:opacity-50"
            />

            {bindIntent && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-2 text-[9px] uppercase tracking-widest text-white/35">{t("home.wallet.signableMessage")}</div>
                <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-white/55">{bindIntent.signable_message}</pre>
              </div>
            )}

            <input
              type="text"
              value={walletSignature}
              onChange={(event) => setWalletSignature(event.target.value)}
              placeholder={t("home.wallet.signaturePlaceholder")}
              disabled={chainActionDisabled || walletLoading || !bindIntent}
              className="w-full rounded-xl border border-white/10 bg-[#050505]/[0.62] px-3 py-3 font-mono text-xs outline-none transition-colors placeholder:text-white/[0.22] focus:border-[#DBFF00]/[0.42] disabled:opacity-50"
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={requestBindIntent}
                disabled={chainActionDisabled || walletLoading || !walletAddress.trim()}
                className="depth-button focus-ring rounded-xl border border-white/10 bg-white/10 py-3 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {walletLoading ? t("common.working") : t("home.wallet.getNonce")}
              </button>
              <button
                type="button"
                onClick={submitWalletBind}
                disabled={chainActionDisabled || walletLoading || !bindIntent || !walletSignature.trim()}
                className="depth-button focus-ring rounded-xl bg-[#DBFF00] py-3 text-[10px] font-bold uppercase tracking-widest text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("home.wallet.bind")}
              </button>
            </div>

            {wallets.length > 0 && (
              <div className="break-all font-mono text-[10px] text-white/45">
                {t("home.wallet.bound", { wallet: wallets[0].wallet_address, status: wallets[0].status })}
              </div>
            )}

            <div className="h-px bg-white/10" />

            <input
              type="text"
              value={txHash}
              onChange={(event) => setTxHash(event.target.value)}
              placeholder={t("home.receipt.placeholder")}
              disabled={chainActionDisabled || receiptLoading}
              className="w-full rounded-xl border border-white/10 bg-[#050505]/[0.62] px-3 py-3 font-mono text-xs outline-none transition-colors placeholder:text-white/[0.22] focus:border-[#DBFF00]/[0.42] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={submitReceipt}
              disabled={chainActionDisabled || receiptLoading || !txHash.trim()}
              className="depth-button focus-ring rounded-xl border border-[#DBFF00]/20 bg-[#DBFF00]/10 py-3 text-[10px] font-bold uppercase tracking-widest text-[#DBFF00] hover:bg-[#DBFF00] hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {receiptLoading ? t("home.receipt.submitting") : t("home.receipt.submit")}
            </button>
          </div>

          <button
            type="button"
            onClick={handleDeposit}
            disabled={isConfirming || backendUnavailable || chainMainlineEnabled || !inputValue || Number(inputValue) <= 0}
            className="depth-button focus-ring group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-[18px] bg-[#DBFF00] py-4 font-bold tracking-wide text-black shadow-[0_0_22px_rgba(219,255,0,0.16)] hover:bg-[#d3f51c] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <div className="absolute inset-0 h-full w-full -translate-x-[150%] skew-x-[30deg] bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:animate-[shine_1s_ease-out]" />
            {isConfirming ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>{t("home.deposit.recording")}</span>
              </>
            ) : (
              <>
                <span>{backendUnavailable ? t("home.deposit.backendUnavailable") : chainMainlineEnabled ? t("home.deposit.useReceipt") : t("home.deposit.recordStaging")}</span>
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>

          <div className="mt-1 flex w-full items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-white/[0.32]">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              {chainMainlineEnabled ? t("home.deposit.chainReceiptRequired") : t("home.deposit.offChainRecord")}
            </p>
            <div className="flex items-center gap-1.5 text-white/45">
              <div className="h-2 w-0.5 animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-white/40" />
              <div className="h-3 w-0.5 animate-[pulse_1.5s_ease-in-out_infinite_0.2s] rounded-full bg-white/40" />
              <div className="h-1.5 w-0.5 animate-[pulse_0.8s_ease-in-out_infinite_0.4s] rounded-full bg-white/40" />
              <span className="ml-1 text-[8px] uppercase tracking-widest">{chainMainlineEnabled ? t("home.deposit.receiptMode") : t("home.deposit.stagingMode")}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
