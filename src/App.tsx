/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent } from "react";
import { toast } from "sonner";
import { LogOut, RefreshCw, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { THEME, TonConnectUIProvider, useIsConnectionRestored, useTonAddress, useTonConnectModal, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import Home from "./views/Home";
import BottomNav from "./components/BottomNav";
import LanguageToggle from "./components/LanguageToggle";
import { Toaster } from "@/src/components/ui/sonner";
import { LanguageProvider, useI18n } from "@/src/lib/i18n";
import { api } from "@/src/lib/api";
import type { BootstrapData, WalletAuthIntent } from "@/src/lib/types";
import { clearBackendAuthToken, clearTonWalletSession, readBackendAuthToken, shortWalletAddress, writeBackendAuthToken, writeTonWalletSession } from "@/src/lib/tonSession";
import { rawTokenAmountToDisplayNumber } from "@/src/lib/tonTransactions";

const BRAND_LOGO_SRC = "/logo-mark-transparent.png";
const TAB_ORDER = ["home", "team", "live", "rewards"];
const TAB_PATHS: Record<string, string> = {
  home: "/",
  team: "/team",
  leaderboard: "/leaderboard",
  live: "/war-room",
  rewards: "/rewards",
};

function tabFromPathname(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  switch (normalized) {
    case "/team":
      return "team";
    case "/leaderboard":
      return "leaderboard";
    case "/live":
    case "/war-room":
      return "live";
    case "/rewards":
      return "rewards";
    default:
      return "home";
  }
}

const Admin = lazy(() => import("./views/Admin"));
const Team = lazy(() => import("./views/Team"));
const Leaderboard = lazy(() => import("./views/Leaderboard"));
const WarRoom = lazy(() => import("./views/WarRoom"));
const Rewards = lazy(() => import("./views/Rewards"));

function isLocalPreviewHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function normalizeTonConnectChainId(chain: unknown): string | null {
  const value = String(chain || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "-239" || value === "mainnet" || value === "ton-mainnet") return "ton-mainnet";
  if (value === "-3" || value === "testnet" || value === "ton-testnet") return "ton-testnet";
  return value;
}

function notifyWalletAuthenticated() {
  window.dispatchEvent(new Event("72h-wallet-authenticated"));
}

function notifyWalletDisconnected() {
  window.dispatchEvent(new Event("72h-wallet-disconnected"));
}

export default function App() {
  const manifestUrl =
    typeof window === "undefined"
      ? "/tonconnect-manifest.json"
      : isLocalPreviewHost(window.location.hostname)
        ? "https://mm.72h.lol/tonconnect-manifest.json"
        : `${window.location.origin}/tonconnect-manifest.json`;

  return (
    <TonConnectUIProvider
      manifestUrl={manifestUrl}
      restoreConnection
      uiPreferences={{
        theme: THEME.DARK,
        borderRadius: "m",
        colorsSet: {
          [THEME.DARK]: {
            accent: "#D7B46A",
            connectButton: {
              background: "#D7B46A",
              foreground: "#050505",
            },
            background: {
              primary: "#080808",
              secondary: "#111111",
              segment: "#1A1A1A",
              tint: "#D7B46A",
              qr: "#FFFFFF",
            },
            text: {
              primary: "#F7F7F7",
              secondary: "rgba(255,255,255,0.62)",
            },
          },
        },
      }}
      actionsConfiguration={{ returnStrategy: "back" }}
    >
      <LanguageProvider>
        <AppRoutes />
      </LanguageProvider>
    </TonConnectUIProvider>
  );
}

function AppRoutes() {
  const isAdminRoute = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");

  if (isAdminRoute) {
    return (
      <>
        <Suspense fallback={<RouteLoading />}>
          <Admin />
        </Suspense>
        <AppToaster />
      </>
    );
  }

  return (
    <>
      <MainApp />
      <AppToaster />
    </>
  );
}

function RouteLoading() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070707] font-mono text-xs uppercase tracking-widest text-white/45">
      {t("common.loading")}
    </div>
  );
}

function AppToaster() {
  return (
    <Toaster
      theme="dark"
      toastOptions={{
        classNames: {
          toast: "border-white/10 bg-[#111]/95 text-white shadow-2xl backdrop-blur-xl font-mono text-xs rounded-2xl",
          title: "text-white",
          description: "text-white/70",
        },
      }}
      position="top-center"
    />
  );
}

function MainApp() {
  const { formatError, t } = useI18n();
  const [tonConnectUI] = useTonConnectUI();
  const tonModal = useTonConnectModal();
  const tonAddress = useTonAddress();
  const rawTonAddress = useTonAddress(false);
  const tonWallet = useTonWallet();
  const connectionRestored = useIsConnectionRestored();
  const shellRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState(() => tabFromPathname(window.location.pathname));
  const [direction, setDirection] = useState(0);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [walletAuthIntent, setWalletAuthIntent] = useState<WalletAuthIntent | null>(null);
  const walletAuthInFlightRef = useRef(false);
  const tokenPrice: number | null = null;
  const [myDeposit, setMyDeposit] = useState(0);
  const [squadGoal, setSquadGoal] = useState(() => {
    const saved = localStorage.getItem("72h_goal");
    return saved ? Number(saved) : 5000000;
  });
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const targetValue = 1000000;
  useEffect(() => localStorage.setItem("72h_goal", squadGoal.toString()), [squadGoal]);
  useEffect(() => {
    let cancelled = false;
    api.bootstrap()
      .then((data) => {
        if (!cancelled) {
          setBootstrap(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBootstrap(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const waveId = bootstrap?.current_wave?.wave_id;
    const token = readBackendAuthToken();
    if (!waveId || !token) return;

    let cancelled = false;
    api.myWavePositionTotal(waveId, token)
      .then((total) => {
        if (cancelled) return;
        const decimals = Number(bootstrap?.contracts?.token_decimals || 9);
        const displayAmount = total.total_locked_raw === "0"
          ? 0
          : rawTokenAmountToDisplayNumber(total.total_locked_raw, decimals);
        setMyDeposit(displayAmount);
      })
      .catch(() => {
        if (!cancelled) setMyDeposit(0);
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrap?.contracts?.token_decimals, bootstrap?.current_wave?.wave_id]);
  useEffect(() => {
    if (!connectionRestored) return;
    if (!tonAddress) {
      clearTonWalletSession();
      return;
    }
    const walletName = tonWallet && "name" in tonWallet ? tonWallet.name : tonWallet?.device.appName || t("home.ton.walletFallback");
    const walletAppName = tonWallet && "appName" in tonWallet ? tonWallet.appName : tonWallet?.device.appName || "ton-wallet";
    writeTonWalletSession({
      address: tonAddress,
      rawAddress: rawTonAddress || tonAddress,
      walletName,
      walletAppName,
      provider: tonWallet?.provider || "tonconnect",
      connectedAt: new Date().toISOString(),
    });
  }, [connectionRestored, rawTonAddress, t, tonAddress, tonWallet]);
  useEffect(() => {
    if (
      isLocalPreviewHost(window.location.hostname)
      || !connectionRestored
      || !tonWallet
      || readBackendAuthToken()
      || walletAuthInFlightRef.current
    ) {
      return;
    }

    const account = (tonWallet as any).account;
    const tonProof = (tonWallet as any).connectItems?.tonProof;
    const expectedChainId = bootstrap?.contracts?.chain_id || walletAuthIntent?.chain_id || "";
    const connectedChainId = normalizeTonConnectChainId(account?.chain);
    const chainMismatch =
      !!expectedChainId && !!connectedChainId && normalizeTonConnectChainId(expectedChainId) !== connectedChainId;
    if (!account?.address || !account?.publicKey || !account.walletStateInit || chainMismatch || !tonProof || !("proof" in tonProof)) {
      return;
    }
    const intentToken = walletAuthIntent?.intent_token;
    if (!intentToken) return;

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
        setWalletAuthIntent(null);
        tonConnectUI.setConnectRequestParameters(null);
        notifyWalletAuthenticated();
        toast.success(t("home.ton.backendReady"));
      })
      .catch((error) => {
        toast.error(formatError(error, "home.ton.backendPending"));
      })
      .finally(() => {
        walletAuthInFlightRef.current = false;
      });
  }, [bootstrap?.contracts?.chain_id, connectionRestored, formatError, t, tonConnectUI, tonWallet, walletAuthIntent]);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);
  useEffect(() => {
    const handlePopState = () => {
      const nextTab = tabFromPathname(window.location.pathname);
      const currIndex = TAB_ORDER.indexOf(activeTab);
      const newIndex = TAB_ORDER.indexOf(nextTab);
      if (currIndex !== -1 && newIndex !== -1) {
        setDirection(newIndex > currIndex ? 1 : -1);
      }
      setActiveTab(nextTab);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activeTab]);

  const handleSetTab = (newTab: string) => {
    const currIndex = TAB_ORDER.indexOf(activeTab);
    const newIndex = TAB_ORDER.indexOf(newTab);
    if (currIndex !== -1 && newIndex !== -1) {
      setDirection(newIndex > currIndex ? 1 : -1);
    }
    setActiveTab(newTab);

    const nextPath = TAB_PATHS[newTab] || "/";
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath + window.location.search + window.location.hash);
    }
  };

  const handleShellPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
  };

  const openTonWallet = async () => {
    setWalletMenuOpen(false);
    if (isLocalPreviewHost(window.location.hostname)) {
      tonConnectUI.setConnectRequestParameters(null);
      setWalletAuthIntent(null);
      tonModal.open();
      return;
    }
    try {
      tonConnectUI.setConnectRequestParameters({ state: "loading" });
      const intent = await api.createWalletAuthIntent();
      setWalletAuthIntent(intent);
      tonConnectUI.setConnectRequestParameters({
        state: "ready",
        value: { tonProof: intent.payload },
      });
    } catch {
      tonConnectUI.setConnectRequestParameters(null);
      setWalletAuthIntent(null);
    }
    tonModal.open();
  };

  const disconnectTonWallet = async () => {
    setWalletMenuOpen(false);
    try {
      await tonConnectUI.disconnect();
    } catch {
      // Local app state is still cleared if the wallet bridge is already unavailable.
    }
    clearBackendAuthToken();
    clearTonWalletSession();
    setWalletAuthIntent(null);
    notifyWalletDisconnected();
  };

  const switchTonWallet = async () => {
    await disconnectTonWallet();
    window.setTimeout(() => {
      openTonWallet();
    }, 120);
  };

  const variants = {
    initial: (dir: number) => ({
      opacity: 0,
      x: dir * 18,
      scale: 0.992,
    }),
    animate: {
      opacity: 1,
      x: 0,
      scale: 1,
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: dir * -18,
      scale: 0.992,
    }),
  };

  const activeContent = (() => {
    switch (activeTab) {
      case "team":
        return (
          <Suspense fallback={<TabLoading />}>
            <Team tokenPrice={tokenPrice} myDeposit={myDeposit} squadGoal={squadGoal} setSquadGoal={setSquadGoal} />
          </Suspense>
        );
      case "leaderboard":
        return (
          <Suspense fallback={<TabLoading />}>
            <Leaderboard tokenPrice={tokenPrice} />
          </Suspense>
        );
      case "live":
        return (
          <Suspense fallback={<TabLoading />}>
            <WarRoom />
          </Suspense>
        );
      case "rewards":
        return (
          <Suspense fallback={<TabLoading />}>
            <Rewards />
          </Suspense>
        );
      case "home":
      default:
        return <Home tokenPrice={tokenPrice} myDeposit={myDeposit} setMyDeposit={setMyDeposit} targetValue={targetValue} />;
    }
  })();

  return (
    <div className="app-viewport dark flex min-h-screen justify-center overflow-hidden font-sans text-white selection:bg-[#d7b46a]/30 selection:text-[#d7b46a]">
      <div
        ref={shellRef}
        onPointerMove={handleShellPointerMove}
        onPointerLeave={() => {
          shellRef.current?.style.setProperty("--pointer-x", "50%");
          shellRef.current?.style.setProperty("--pointer-y", "18%");
        }}
        className="app-shell relative flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden bg-[#05080a] shadow-[0_40px_120px_rgba(0,0,0,0.72)] sm:border-x sm:border-white/[0.06]"
      >
        <div className="grain-overlay" />
        <div className="scanlines" />

        <div className="app-background" />

        <header className="relative z-10 shrink-0 px-6 pb-4 pt-6">
          <div className="flex min-h-[58px] items-center justify-between gap-4 rounded-[22px] border border-white/[0.035] bg-black/[0.08] px-1 py-1">
            <div className="relative flex h-12 w-13 shrink-0 items-center justify-center">
              <div className="absolute inset-1 rounded-[16px] bg-[#d7b46a]/10 blur-xl" />
              <img
                src={BRAND_LOGO_SRC}
                alt={t("app.brand.name")}
                className="relative h-full w-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
              />
            </div>

            <div className="flex min-w-0 items-center justify-end gap-2">
              <LanguageToggle />
              <div className="relative">
                {!tonAddress ? (
                  <button
                    type="button"
                    onClick={openTonWallet}
                    disabled={!connectionRestored}
                    className="status-chip focus-ring flex h-11 items-center gap-2 rounded-full border border-[#d7b46a]/35 bg-[#d7b46a]/[0.055] px-4 text-[11px] font-bold tracking-[0.16em] text-[#d7b46a] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl disabled:cursor-wait disabled:opacity-55"
                  >
                    <Wallet className="h-4 w-4" />
                    {connectionRestored ? t("home.ton.connectShort") : t("common.loading")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setWalletMenuOpen((open) => !open)}
                    className="status-chip focus-ring flex h-11 items-center gap-2 rounded-full border border-[#d7b46a]/35 bg-[#d7b46a]/[0.055] px-4 font-mono text-[10px] font-bold tracking-[0.08em] text-[#d7b46a] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl"
                    aria-expanded={walletMenuOpen}
                  >
                    <Wallet className="h-4 w-4" />
                    {shortWalletAddress(tonAddress)}
                  </button>
                )}
                {walletMenuOpen && tonAddress && (
                  <div className="absolute right-0 top-13 w-36 overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#080a0b]/95 p-1.5 shadow-[0_18px_38px_rgba(0,0,0,0.58)] backdrop-blur-2xl">
                    <button
                      type="button"
                      onClick={switchTonWallet}
                      className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[11px] font-semibold text-white/72 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-[#d7b46a]" />
                      {t("home.ton.switch")}
                    </button>
                    <button
                      type="button"
                      onClick={disconnectTonWallet}
                      className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[11px] font-semibold text-white/72 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      <LogOut className="h-3.5 w-3.5 text-[#d7b46a]" />
                      {t("home.ton.disconnect")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main ref={mainRef} className="app-scroll relative z-10 flex-1 overflow-y-auto overflow-x-hidden pt-0 no-scrollbar scroll-smooth">
          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
            <motion.div
              key={activeTab}
              custom={direction}
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
              className="w-full"
            >
              {activeContent}
            </motion.div>
          </AnimatePresence>
        </main>

        <BottomNav activeTab={activeTab} setActiveTab={handleSetTab} />
      </div>
    </div>
  );
}

function TabLoading() {
  const { t } = useI18n();
  return (
    <div className="px-6 pb-4">
      <div className="glass-panel rounded-[24px] border border-white/10 bg-white/[0.035] p-8 text-center font-mono text-xs uppercase tracking-widest text-white/45">
        {t("common.loading")}
      </div>
    </div>
  );
}
