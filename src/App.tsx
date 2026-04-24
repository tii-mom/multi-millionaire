/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { THEME, TonConnectUIProvider } from "@tonconnect/ui-react";
import Home from "./views/Home";
import Team from "./views/Team";
import Rewards from "./views/Rewards";
import Share from "./views/Share";
import Admin from "./views/Admin";
import BottomNav from "./components/BottomNav";
import LanguageToggle from "./components/LanguageToggle";
import { Toaster } from "@/src/components/ui/sonner";
import { LanguageProvider, formatNumber, useI18n } from "@/src/lib/i18n";

export default function App() {
  const manifestUrl =
    typeof window === "undefined"
      ? "/tonconnect-manifest.json"
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
            accent: "#DBFF00",
            connectButton: {
              background: "#DBFF00",
              foreground: "#050505",
            },
            background: {
              primary: "#080808",
              secondary: "#111111",
              segment: "#1A1A1A",
              tint: "#DBFF00",
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
        <Admin />
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
  const { locale, t } = useI18n();
  const shellRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState("home");
  const [direction, setDirection] = useState(0);
  const [tokenPrice] = useState(1.42);
  const [myDeposit, setMyDeposit] = useState(() => {
    const saved = localStorage.getItem("72h_deposit");
    return saved ? Number(saved) : 0;
  });
  const [squadGoal, setSquadGoal] = useState(() => {
    const saved = localStorage.getItem("72h_goal");
    return saved ? Number(saved) : 5000000;
  });
  const targetValue = 1000000;

  useEffect(() => localStorage.setItem("72h_deposit", myDeposit.toString()), [myDeposit]);
  useEffect(() => localStorage.setItem("72h_goal", squadGoal.toString()), [squadGoal]);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  const handleSetTab = (newTab: string) => {
    const tabs = ["home", "team", "rewards", "share"];
    const currIndex = tabs.indexOf(activeTab);
    const newIndex = tabs.indexOf(newTab);
    setDirection(newIndex > currIndex ? 1 : -1);
    setActiveTab(newTab);
  };

  const handleShellPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
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

  return (
    <div className="app-viewport dark flex min-h-screen justify-center overflow-hidden font-sans text-white selection:bg-[#DBFF00]/30 selection:text-[#DBFF00]">
      <div
        ref={shellRef}
        onPointerMove={handleShellPointerMove}
        onPointerLeave={() => {
          shellRef.current?.style.setProperty("--pointer-x", "50%");
          shellRef.current?.style.setProperty("--pointer-y", "18%");
        }}
        className="app-shell relative flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden bg-[#060606] shadow-[0_40px_120px_rgba(0,0,0,0.7)] sm:border-x sm:border-white/[0.06]"
      >
        <div className="grain-overlay" />
        <div className="scanlines" />

        <div className="app-background" />

        <div className="absolute right-5 top-4 z-20 flex items-center gap-2">
          <LanguageToggle />
          <div className="flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-200/10 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-100" />
            <span className="text-[10px] font-medium tracking-widest text-amber-50/90">{t("app.env.staging")}</span>
          </div>
        </div>

        <header className="relative z-10 flex shrink-0 items-end justify-between px-6 pb-5 pt-20">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#DBFF00] shadow-[0_0_10px_#DBFF00]" />
              <h1 className="truncate text-[10px] font-medium uppercase tracking-[0.25em] text-white/[0.48]">
                {t("app.brand.kicker")}
              </h1>
            </div>
            <div className="mt-2 truncate text-[22px] font-semibold tracking-tight text-white/95">
              {t("app.brand.name")}
            </div>
          </div>

          <div className="top-terminal-panel flex shrink-0 flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-widest text-white/[0.38]">{t("app.price.label")}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#DBFF00]/85" />
            </div>
            <div className="flex items-center gap-2 font-mono text-[17px] font-semibold text-[#DBFF00] tabular-nums">
              <motion.span
                key={tokenPrice}
                initial={{ opacity: 0.5, color: "#fff" }}
                animate={{ opacity: 1, color: "#DBFF00" }}
                transition={{ duration: 0.55 }}
              >
                ${formatNumber(tokenPrice, locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </motion.span>
              <span className="rounded-full bg-amber-200/10 px-2 py-0.5 text-[9px] font-bold tracking-wider text-amber-50/80">
                {t("app.price.offChain")}
              </span>
            </div>
          </div>
        </header>

        <main ref={mainRef} className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden pb-28 pt-1 no-scrollbar scroll-smooth">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            {activeTab === "home" && (
              <motion.div
                key="home"
                custom={direction}
                variants={variants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
                className="w-full"
              >
                <Home tokenPrice={tokenPrice} myDeposit={myDeposit} setMyDeposit={setMyDeposit} targetValue={targetValue} />
              </motion.div>
            )}
            {activeTab === "team" && (
              <motion.div
                key="team"
                custom={direction}
                variants={variants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
                className="w-full"
              >
                <Team tokenPrice={tokenPrice} myDeposit={myDeposit} squadGoal={squadGoal} setSquadGoal={setSquadGoal} />
              </motion.div>
            )}
            {activeTab === "rewards" && (
              <motion.div
                key="rewards"
                custom={direction}
                variants={variants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
                className="w-full"
              >
                <Rewards />
              </motion.div>
            )}
            {activeTab === "share" && (
              <motion.div
                key="share"
                custom={direction}
                variants={variants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
                className="w-full"
              >
                <Share myDeposit={myDeposit} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <BottomNav activeTab={activeTab} setActiveTab={handleSetTab} />
      </div>
    </div>
  );
}
