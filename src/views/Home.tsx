import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, KeyRound, LogOut, Wallet, Target, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "@/src/lib/api";
import type { BootstrapData, WalletBindIntent, WalletBinding } from "@/src/lib/types";

interface HomeProps {
  tokenPrice: number;
  myDeposit: number;
  setMyDeposit: Dispatch<SetStateAction<number>>;
  targetValue: number;
}

export default function Home({ tokenPrice, myDeposit, setMyDeposit, targetValue }: HomeProps) {
  const [inputValue, setInputValue] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("auth_token"));
  const [waveId, setWaveId] = useState<number | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletSignature, setWalletSignature] = useState("");
  const [bindIntent, setBindIntent] = useState<WalletBindIntent | null>(null);
  const [wallets, setWallets] = useState<WalletBinding[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [receiptLoading, setReceiptLoading] = useState(false);
  const availableBalance = 2450000 - myDeposit; // Display-only balance for staging/off-chain flows.

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

  const persistToken = (token: string) => {
    setAuthToken(token);
    localStorage.setItem("auth_token", token);
  };

  const clearToken = () => {
    setAuthToken(null);
    localStorage.removeItem("auth_token");
    setWallets([]);
    setBindIntent(null);
    toast.message("Signed out.");
  };

  const authenticate = async (mode: "register" | "login") => {
    if (!email || !password) {
      setApiError("Email and password are required.");
      return;
    }

    setAuthLoading(true);
    setApiError(null);

    try {
      const result = mode === "register" ? await api.register(email, password) : await api.login(email, password);
      persistToken(result.token);
      toast.success(mode === "register" ? "Account created." : "Signed in.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";
      setApiError(message);
      toast.error(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (bootstrapError && !bootstrap) {
      setApiError("Backend is unavailable. Deposits are disabled until bootstrap succeeds.");
      toast.error("Backend unavailable.");
      return;
    }
    if (bootstrap?.controls?.pause_deposits?.enabled) {
      toast.error(bootstrap.controls.pause_deposits.reason || "Deposits are paused.");
      return;
    }
    const val = Number(inputValue);
    if (!val || val <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!Number.isInteger(val)) {
      toast.error("Use a whole-number 72H amount for this MVP backend.");
      return;
    }
    if (val > availableBalance) {
      toast.error("Insufficient balance");
      return;
    }
    if (!authToken) {
      setApiError("Register or sign in before submitting a lock.");
      toast.error("Sign in required before locking 72H.");
      return;
    }
    if (!waveId) {
      setApiError("No active Wave loaded from backend.");
      toast.error("No active Wave available.");
      return;
    }
    if (bootstrap?.feature_flags?.chain_mainline_writes_enabled) {
      setApiError("Production deposits require the wallet binding and receipt submit form.");
      toast.error("Wallet transaction flow required.");
      return;
    }

    setIsConfirming(true);
    setApiError(null);

    try {
      const precheck = await api.depositPrecheck(waveId, authToken);
      if (!precheck.ok) {
        throw new Error(precheck.reasons?.join(", ") || "Deposit precheck failed.");
      }

      await api.deposit(waveId, val.toString(), authToken);

      setMyDeposit((p: number) => p + val);
      setInputValue("");
      toast.success(`Backend lock recorded for ${val.toLocaleString()} 72H.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Deposit failed.";
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
      // Wallet binding is optional in staging/off-chain mode.
    }
  };

  const requestBindIntent = async () => {
    if (!chainMainlineEnabled) {
      setApiError("Wallet binding is disabled while chain mainline writes are off.");
      return;
    }
    if (!authToken) {
      setApiError("Sign in before binding a wallet.");
      return;
    }
    if (!walletAddress.trim()) {
      setApiError("Wallet address is required.");
      return;
    }

    setWalletLoading(true);
    setApiError(null);

    try {
      const intent = await api.createWalletBindIntent(walletAddress.trim(), authToken);
      setBindIntent(intent);
      setWalletSignature("");
      toast.success("Wallet bind nonce created.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wallet bind intent failed.";
      setApiError(message);
      toast.error(message);
    } finally {
      setWalletLoading(false);
    }
  };

  const submitWalletBind = async () => {
    if (!chainMainlineEnabled) {
      setApiError("Wallet binding is disabled while chain mainline writes are off.");
      return;
    }
    if (!authToken || !bindIntent) {
      setApiError("Create a wallet bind nonce first.");
      return;
    }
    if (!walletSignature.trim()) {
      setApiError("Signature is required.");
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
      toast.success("Wallet binding submitted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wallet binding failed.";
      setApiError(message);
      toast.error(message);
    } finally {
      setWalletLoading(false);
    }
  };

  const submitReceipt = async () => {
    if (!chainMainlineEnabled) {
      setApiError("Receipt submit is disabled while chain mainline writes are off.");
      return;
    }
    if (!authToken) {
      setApiError("Sign in before submitting a receipt.");
      return;
    }
    if (!waveId) {
      setApiError("No active Wave loaded from backend.");
      return;
    }
    if (!txHash.trim()) {
      setApiError("Transaction hash is required.");
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
      toast.success("Deposit receipt submitted for backend verification.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Receipt submit failed.";
      setApiError(message);
      toast.error(message);
    } finally {
      setReceiptLoading(false);
    }
  };

  const currentFiatValue = myDeposit * tokenPrice;
  const progressPercent = Math.min((currentFiatValue / targetValue) * 100, 100);
  const needed72H = Math.max(0, (targetValue - currentFiatValue) / tokenPrice);
  const backendUnavailable = !!bootstrapError && !bootstrap;
  const chainMainlineEnabled = !!bootstrap?.feature_flags?.chain_mainline_writes_enabled;
  const depositsPaused = !!bootstrap?.controls?.pause_deposits?.enabled;
  const maintenanceBanner = bootstrap?.controls?.maintenance_banner;
  const receiptVerifierConfigured = !!bootstrap?.ops?.receipt_verifier?.configured;
  const chainDisabledReason = backendUnavailable
    ? "Backend unavailable: wallet and receipt actions are disabled."
    : !authToken
      ? "Sign in to bind a wallet or submit a receipt."
      : depositsPaused
        ? bootstrap?.controls?.pause_deposits?.reason || "Deposits are paused."
        : !chainMainlineEnabled
          ? "Chain mainline writes are disabled for this environment."
          : !receiptVerifierConfigured
            ? "Receipt verifier is not configured yet."
            : null;
  const chainActionDisabled = !!chainDisabledReason;

  useEffect(() => {
    if (authToken && chainMainlineEnabled) {
      loadWallets();
    }
  }, [authToken, chainMainlineEnabled]);

  return (
    <div className="px-6 flex flex-col gap-6 pb-10">
      {(backendUnavailable || maintenanceBanner?.enabled || depositsPaused || !chainMainlineEnabled) && (
        <div className={`rounded-2xl border px-4 py-3 text-[11px] font-mono leading-relaxed ${backendUnavailable ? "border-red-400/25 bg-red-500/10 text-red-100" : "border-amber-300/20 bg-amber-300/10 text-amber-100"}`}>
          {backendUnavailable
            ? `Backend unavailable: ${bootstrapError}`
            : maintenanceBanner?.enabled
            ? maintenanceBanner.reason || "Maintenance mode is active."
            : depositsPaused
              ? bootstrap?.controls?.pause_deposits?.reason || "Deposits are paused."
              : "Staging mode: deposits and reward claims are backend records until the chain receipt flow is enabled."}
        </div>
      )}
      {/* Account Section */}
      <div className="bg-white/[0.02] border border-white/10 rounded-[24px] p-5 backdrop-blur-xl relative overflow-hidden">
        <div className="absolute -left-10 -top-10 w-24 h-24 bg-[#DBFF00]/10 blur-3xl rounded-full" />
        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white/60">
              <KeyRound className="w-4 h-4 text-[#DBFF00]" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-mono">Account Access</span>
            </div>
            <div className={`text-[9px] uppercase tracking-widest font-mono ${authToken ? "text-[#DBFF00]" : "text-white/35"}`}>
              {authToken ? "Signed In" : "Required"}
            </div>
          </div>

          {!authToken ? (
            <div className="grid gap-3">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 outline-none focus:border-[#DBFF00]/40 transition-colors font-mono text-sm placeholder:text-white/20"
              />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 outline-none focus:border-[#DBFF00]/40 transition-colors font-mono text-sm placeholder:text-white/20"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => authenticate("register")}
                  disabled={authLoading}
                  className="bg-[#DBFF00] text-black rounded-2xl py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-60"
                >
                  Register
                </button>
                <button
                  type="button"
                  onClick={() => authenticate("login")}
                  disabled={authLoading}
                  className="bg-white/10 text-white rounded-2xl py-3 text-xs font-bold uppercase tracking-widest border border-white/10 disabled:opacity-60"
                >
                  Login
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/30 border border-white/10 px-4 py-3">
              <div>
                <div className="text-[9px] uppercase tracking-widest text-white/35 font-mono">Current Wave</div>
                <div className="font-mono text-sm text-white/80">{waveId ? `#${waveId}` : "Loading..."}</div>
              </div>
              <button
                type="button"
                onClick={clearToken}
                className="flex items-center gap-2 text-white/50 hover:text-white text-xs uppercase tracking-widest font-mono"
              >
                <LogOut className="w-3.5 h-3.5" />
                Logout
              </button>
            </div>
          )}

          {apiError && (
            <div className="text-[10px] font-mono text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              {apiError}
            </div>
          )}
        </div>
      </div>
      
      
      {/* Progress Section */}
      <div className="bg-white/[0.02] border border-white/10 rounded-[24px] p-6 backdrop-blur-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#DBFF00]/5 blur-[60px] rounded-full group-hover:bg-[#DBFF00]/10 transition-colors duration-500" />
        <div className="relative z-10">
          <div className="flex justify-between items-end mb-4">
            <div className="flex items-center gap-2 text-white/50">
              <Target className="w-5 h-5" />
              <span className="text-[11px] uppercase tracking-widest font-mono">Millionaire Goal</span>
            </div>
            <div className="font-mono text-[#DBFF00] font-semibold text-lg tabular-nums">
              {progressPercent.toFixed(4)}%
            </div>
          </div>
          
          {/* Enhanced Progress Bar */}
          <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden border border-white/[0.05] relative shadow-inner flex items-center">
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-transparent via-[#DBFF00]/80 to-[#DBFF00] transition-all duration-1000 ease-out flex items-center justify-end" 
              style={{ width: `${Math.max(progressPercent, 2)}%` }}
            >
              <div className="w-1.5 h-1.5 bg-white rounded-full mr-0.5 shadow-[0_0_10px_2px_#DBFF00]" />
            </div>
          </div>
          
          <div className="flex justify-between mt-4 text-[11px] font-mono text-white/40 tracking-wider">
            <span className="text-white/70 tabular-nums">${currentFiatValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            <span className="tabular-nums">${targetValue.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Dynamic Needed Tokens Box */}
      <div className="bg-white/[0.02] border border-white/10 rounded-[24px] p-6 backdrop-blur-xl flex flex-col items-center justify-center text-center relative overflow-hidden group">
        <div className="absolute top-3 right-4 flex items-center gap-1.5">
          <span className="relative flex h-[5px] w-[5px]">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#DBFF00] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-[5px] w-[5px] bg-[#DBFF00]"></span>
          </span>
          <span className="text-[8px] uppercase tracking-widest font-mono text-[#DBFF00]/70">Auto-Refreshed</span>
        </div>
        
        <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/50 mb-1.5 mt-1">You still need</h3>
        <motion.div 
          key={needed72H}
          initial={{ opacity: 0.8, scale: 0.99 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-4xl font-mono tracking-tighter font-semibold flex items-baseline gap-2 mb-3"
        >
          <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-white/70 tabular-nums">
            {needed72H.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </motion.div>
        
        <div className="flex flex-col gap-1 items-center">
          <div className="text-white/40 font-mono text-[10px] uppercase tracking-widest flex items-center gap-1.5">
            Based on Display Price:
            <motion.span 
              key={tokenPrice}
              initial={{ color: "#ffffff" }}
              animate={{ color: "#DBFF00" }}
              className="text-[#DBFF00] font-bold tabular-nums"
            >
              ${tokenPrice.toFixed(3)}
            </motion.span>
          </div>
        </div>
      </div>

      {/* Deposit Action */}
      <div className="border border-white/10 rounded-[24px] overflow-hidden bg-white/[0.01] backdrop-blur-xl">
        <div className="px-6 py-5 border-b border-white/[0.05] flex justify-between items-center bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
              <Wallet className="w-4 h-4 text-[#DBFF00]" />
            </div>
            <span className="font-medium text-sm tracking-wide">My Deposit</span>
          </div>
          <div className="font-mono text-xl tabular-nums relative overflow-hidden h-[28px] min-w-[80px] flex justify-end">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={myDeposit}
                initial={{ y: -20, opacity: 0, color: "#DBFF00" }}
                animate={{ y: 0, opacity: 1, color: "#ffffff" }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="absolute right-0"
              >
                {myDeposit.toLocaleString()} <span className="text-[10px] text-white/50 uppercase tracking-widest">72H</span>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        
        <div className="p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2 relative group">
            <div className="absolute right-5 flex items-center gap-2 top-1/2 -translate-y-1/2 z-20">
              <button 
                onClick={() => setInputValue(availableBalance.toString())}
                className="text-[9px] font-mono font-bold tracking-widest uppercase bg-white/5 hover:bg-[#DBFF00] hover:text-black text-[#DBFF00] px-2 py-1 rounded transition-colors active:scale-95 border border-[#DBFF00]/20"
              >
                Max
              </button>
              <div className="text-white/10 font-mono text-2xl uppercase font-black tracking-tighter pointer-events-none group-focus-within:text-[#DBFF00]/10 transition-colors">
                72H
              </div>
            </div>
            
            <input 
              type="number" 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="0"
              disabled={isConfirming || backendUnavailable}
              className="w-full bg-[#050505]/60 hover:bg-[#050505]/80 border border-white/5 rounded-2xl py-6 pl-6 pr-[120px] outline-none focus:border-[#DBFF00]/40 transition-colors font-mono text-4xl tabular-nums shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] placeholder:text-white/5 focus:bg-black/60 focus:ring-2 ring-[#DBFF00]/5 disabled:opacity-50"
            />
            
            <div className="absolute -top-3 right-2 bg-black px-2 text-[9px] text-white/30 font-mono tracking-widest uppercase flex items-center gap-1 z-30">
              Display:
              <div className="relative inline-flex min-w-[50px] justify-end">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={availableBalance}
                    initial={{ y: -10, opacity: 0, color: "#DBFF00" }}
                    animate={{ y: 0, opacity: 1, color: "rgba(255,255,255,0.3)" }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="absolute right-0 top-0 bottom-0 flex"
                  >
                    {availableBalance.toLocaleString()}
                  </motion.span>
                </AnimatePresence>
                <span className="invisible">{availableBalance.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/45 font-mono">Wallet Binding</div>
                <div className="text-[11px] text-white/35 font-mono mt-1">
                  {chainDisabledReason || "Bind a verified wallet before submitting a chain receipt."}
                </div>
              </div>
              <div className={`text-[9px] uppercase tracking-widest font-mono ${chainMainlineEnabled ? "text-[#DBFF00]" : "text-amber-200"}`}>
                {chainMainlineEnabled ? "Chain Enabled" : "Off-Chain"}
              </div>
            </div>

            <input
              type="text"
              value={walletAddress}
              onChange={(event) => setWalletAddress(event.target.value)}
              placeholder="walletAddress"
              disabled={chainActionDisabled || walletLoading}
              className="w-full bg-[#050505]/60 border border-white/10 rounded-xl px-3 py-3 outline-none focus:border-[#DBFF00]/40 transition-colors font-mono text-xs placeholder:text-white/20 disabled:opacity-50"
            />

            {bindIntent && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[9px] uppercase tracking-widest text-white/35 font-mono mb-2">Signable Message</div>
                <pre className="whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/55 font-mono">{bindIntent.signable_message}</pre>
              </div>
            )}

            <input
              type="text"
              value={walletSignature}
              onChange={(event) => setWalletSignature(event.target.value)}
              placeholder="signature"
              disabled={chainActionDisabled || walletLoading || !bindIntent}
              className="w-full bg-[#050505]/60 border border-white/10 rounded-xl px-3 py-3 outline-none focus:border-[#DBFF00]/40 transition-colors font-mono text-xs placeholder:text-white/20 disabled:opacity-50"
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={requestBindIntent}
                disabled={chainActionDisabled || walletLoading || !walletAddress.trim()}
                className="rounded-xl border border-white/10 bg-white/10 py-3 text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {walletLoading ? "Working..." : "Get Nonce"}
              </button>
              <button
                type="button"
                onClick={submitWalletBind}
                disabled={chainActionDisabled || walletLoading || !bindIntent || !walletSignature.trim()}
                className="rounded-xl bg-[#DBFF00] py-3 text-[10px] font-bold uppercase tracking-widest text-black disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Bind Wallet
              </button>
            </div>

            {wallets.length > 0 && (
              <div className="text-[10px] font-mono text-white/45">
                Bound: {wallets[0].wallet_address} ({wallets[0].status})
              </div>
            )}

            <div className="h-px bg-white/10" />

            <input
              type="text"
              value={txHash}
              onChange={(event) => setTxHash(event.target.value)}
              placeholder="txHash receipt submit"
              disabled={chainActionDisabled || receiptLoading}
              className="w-full bg-[#050505]/60 border border-white/10 rounded-xl px-3 py-3 outline-none focus:border-[#DBFF00]/40 transition-colors font-mono text-xs placeholder:text-white/20 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={submitReceipt}
              disabled={chainActionDisabled || receiptLoading || !txHash.trim()}
              className="rounded-xl border border-[#DBFF00]/20 bg-[#DBFF00]/10 py-3 text-[10px] font-bold uppercase tracking-widest text-[#DBFF00] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {receiptLoading ? "Submitting..." : "Submit Receipt"}
            </button>
          </div>
          
          <button 
            onClick={handleDeposit}
            disabled={isConfirming || backendUnavailable || chainMainlineEnabled || !inputValue || Number(inputValue) <= 0}
            className="w-full bg-[#DBFF00] text-black shadow-[0_0_20px_rgba(219,255,0,0.15)] rounded-2xl py-4 flex items-center justify-center gap-2 hover:bg-[#c4e600] transition-all active:scale-[0.98] font-bold tracking-wide disabled:opacity-70 disabled:cursor-not-allowed group relative overflow-hidden"
          >
            {/* Shimmer effect inside button */}
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[150%] skew-x-[30deg] group-hover:animate-[shine_1s_ease-out]" />
            
            {isConfirming ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Recording Deposit...</span>
              </>
            ) : (
              <>
                <span>{backendUnavailable ? "Backend Unavailable" : chainMainlineEnabled ? "Use Receipt Form Above" : "Record Staging Deposit"}</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
          
          <div className="flex items-center justify-between w-full mt-2">
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/30 font-mono flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              {chainMainlineEnabled ? "Chain receipt required" : "Off-chain staging record"}
            </p>
            {/* Network Pulse Tracker */}
            <div className="flex items-center gap-1.5 opacity-50">
              <div className="h-2 w-0.5 bg-white/40 rounded-full animate-[pulse_1s_ease-in-out_infinite]" />
              <div className="h-3 w-0.5 bg-white/40 rounded-full animate-[pulse_1.5s_ease-in-out_infinite_0.2s]" />
              <div className="h-1.5 w-0.5 bg-white/40 rounded-full animate-[pulse_0.8s_ease-in-out_infinite_0.4s]" />
              <span className="text-[8px] font-mono tracking-widest uppercase ml-1">{chainMainlineEnabled ? "Receipt Mode" : "Staging Mode"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
