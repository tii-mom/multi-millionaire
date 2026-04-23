import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, KeyRound, LogOut, Wallet, Target, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "@/src/lib/api";
import EmptyState from "@/src/components/ui/EmptyState";
import ErrorState from "@/src/components/ui/ErrorState";
import LoadingCard from "@/src/components/ui/LoadingCard";

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
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const availableBalance = 2450000 - myDeposit; // Make balance strictly dynamic according to local storage changes

  const loadBootstrap = useCallback(async () => {
    setBootstrapLoading(true);
    setBootstrapError(null);

    try {
      const data = await api.bootstrap();
      setWaveId(data.current_wave?.wave_id ? Number(data.current_wave.wave_id) : null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load Wave state.";
      setBootstrapError(message);
      setWaveId(null);
    } finally {
      setBootstrapLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  const persistToken = (token: string) => {
    setAuthToken(token);
    localStorage.setItem("auth_token", token);
  };

  const clearToken = () => {
    setAuthToken(null);
    localStorage.removeItem("auth_token");
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

  const currentFiatValue = myDeposit * tokenPrice;
  const progressPercent = Math.min((currentFiatValue / targetValue) * 100, 100);
  const needed72H = Math.max(0, (targetValue - currentFiatValue) / tokenPrice);

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 sm:gap-6 sm:px-6 sm:pb-10">
      {/* Account Section */}
      <div className="relative overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl sm:rounded-[24px] sm:p-5">
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
              <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
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
          ) : bootstrapLoading ? (
            <LoadingCard title="Loading wave" description="Checking the active lock window." rows={1} className="p-3 sm:p-3" />
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/30 border border-white/10 px-4 py-3">
              <div>
                <div className="text-[9px] uppercase tracking-widest text-white/35 font-mono">Current Wave</div>
                <div className="font-mono text-sm text-white/80">{waveId ? `#${waveId}` : "No active wave"}</div>
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

          {bootstrapError && (
            <ErrorState
              title="Wave unavailable"
              message={bootstrapError}
              onRetry={loadBootstrap}
              className="p-3 sm:p-3"
            />
          )}

          {!bootstrapLoading && !bootstrapError && !waveId && (
            <EmptyState
              title="No active wave"
              description="Locks can be prepared locally, but backend submission waits for the next active Wave."
              actionLabel="Check again"
              onAction={loadBootstrap}
              className="p-4"
            />
          )}

          {apiError && (
            <div className="text-[10px] font-mono text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              {apiError}
            </div>
          )}
        </div>
      </div>
      
      
      {/* Progress Section */}
      <div className="relative overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl sm:rounded-[24px] sm:p-6 group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#DBFF00]/5 blur-[60px] rounded-full group-hover:bg-[#DBFF00]/10 transition-colors duration-500" />
        <div className="relative z-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div className="flex items-center gap-2 text-white/50">
              <Target className="w-5 h-5" />
              <span className="text-[11px] uppercase tracking-widest font-mono">Millionaire Goal</span>
            </div>
            <div className="shrink-0 font-mono text-[#DBFF00] font-semibold text-lg tabular-nums">
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
      <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.02] p-5 text-center backdrop-blur-xl sm:rounded-[24px] sm:p-6 group">
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
          className="mb-3 flex items-baseline gap-2 font-mono text-3xl font-semibold tracking-tighter sm:text-4xl"
        >
          <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-white/70 tabular-nums">
            {needed72H.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </motion.div>
        
        <div className="flex flex-col gap-1 items-center">
          <div className="text-white/40 font-mono text-[10px] uppercase tracking-widest flex items-center gap-1.5">
            Based on Live Price: 
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
      <div className="overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.01] backdrop-blur-xl sm:rounded-[24px]">
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] bg-white/[0.02] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
              <Wallet className="w-4 h-4 text-[#DBFF00]" />
            </div>
            <span className="font-medium text-sm tracking-wide">My Deposit</span>
          </div>
          <div className="relative flex h-[28px] min-w-[80px] justify-end overflow-hidden font-mono text-lg tabular-nums sm:text-xl">
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
        
        <div className="flex flex-col gap-5 p-4 sm:p-6">
          <div className="flex flex-col gap-2 relative group">
            <div className="absolute right-5 flex items-center gap-2 top-1/2 -translate-y-1/2 z-20">
              <button 
                onClick={() => setInputValue(availableBalance.toString())}
                disabled={isConfirming}
                className="text-[9px] font-mono font-bold tracking-widest uppercase bg-white/5 hover:bg-[#DBFF00] hover:text-black text-[#DBFF00] px-2 py-1 rounded transition-colors active:scale-95 border border-[#DBFF00]/20 disabled:opacity-50"
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
              disabled={isConfirming}
              className="w-full bg-[#050505]/60 hover:bg-[#050505]/80 border border-white/5 rounded-2xl py-5 pl-5 pr-[112px] outline-none focus:border-[#DBFF00]/40 transition-colors font-mono text-3xl tabular-nums shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] placeholder:text-white/5 focus:bg-black/60 focus:ring-2 ring-[#DBFF00]/5 disabled:opacity-50 sm:py-6 sm:pl-6 sm:pr-[120px] sm:text-4xl"
            />
            
            <div className="absolute -top-3 right-2 bg-black px-2 text-[9px] text-white/30 font-mono tracking-widest uppercase flex items-center gap-1 z-30">
              Wallet:
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
          
          <button 
            onClick={handleDeposit}
            disabled={isConfirming || !inputValue || Number(inputValue) <= 0}
            className="w-full bg-[#DBFF00] text-black shadow-[0_0_20px_rgba(219,255,0,0.15)] rounded-2xl py-4 flex items-center justify-center gap-2 hover:bg-[#c4e600] transition-all active:scale-[0.98] font-bold tracking-wide disabled:opacity-70 disabled:cursor-not-allowed group relative overflow-hidden"
          >
            {/* Shimmer effect inside button */}
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[150%] skew-x-[30deg] group-hover:animate-[shine_1s_ease-out]" />
            
            {isConfirming ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Submitting Lock...</span>
              </>
            ) : (
              <>
                <span>Lock & Deposit</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
          
          <div className="mt-2 flex w-full flex-col gap-3 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
            <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              72H Lock • Gas paid by user
            </p>
            {/* Network Pulse Tracker */}
            <div className="flex items-center gap-1.5 opacity-50">
              <div className="h-2 w-0.5 bg-white/40 rounded-full animate-[pulse_1s_ease-in-out_infinite]" />
              <div className="h-3 w-0.5 bg-white/40 rounded-full animate-[pulse_1.5s_ease-in-out_infinite_0.2s]" />
              <div className="h-1.5 w-0.5 bg-white/40 rounded-full animate-[pulse_0.8s_ease-in-out_infinite_0.4s]" />
              <span className="text-[8px] font-mono tracking-widest uppercase ml-1">Network Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
