/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import Home from "./views/Home";
import Team from "./views/Team";
import Rewards from "./views/Rewards";
import Share from "./views/Share";
import BottomNav from "./components/BottomNav";
import { Toaster } from "@/src/components/ui/sonner";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [direction, setDirection] = useState(0); // For animating tabs

  // App Global State (Persistent locally)
  const [tokenPrice, setTokenPrice] = useState(1.42);
  const [myDeposit, setMyDeposit] = useState(() => {
    const saved = localStorage.getItem("72h_deposit");
    return saved ? Number(saved) : 0;
  });
  const [squadGoal, setSquadGoal] = useState(() => {
    const saved = localStorage.getItem("72h_goal");
    return saved ? Number(saved) : 5000000;
  });
  const targetValue = 1000000; // $1,000,000

  // Persist State Changes
  useEffect(() => localStorage.setItem("72h_deposit", myDeposit.toString()), [myDeposit]);
  useEffect(() => localStorage.setItem("72h_goal", squadGoal.toString()), [squadGoal]);

  const handleSetTab = (newTab: string) => {
    const tabs = ["home", "team", "rewards", "share"];
    const currIndex = tabs.indexOf(activeTab);
    const newIndex = tabs.indexOf(newTab);
    setDirection(newIndex > currIndex ? 1 : -1);
    setActiveTab(newTab);
  };

  // Simulate price fluctuation
  useEffect(() => {
    const interval = setInterval(() => {
      setTokenPrice(prev => {
        const change = (Math.random() - 0.5) * 0.05;
        return Number(Math.max(0.1, prev + change).toFixed(3));
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const variants = {
    initial: (dir: number) => ({
      opacity: 0,
      x: dir * 20,
      scale: 0.98,
    }),
    animate: {
      opacity: 1,
      x: 0,
      scale: 1,
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: dir * -20,
      scale: 0.98,
    }),
  };

  return (
    <div className="dark min-h-screen bg-[#050505] text-white font-sans flex justify-center overflow-hidden selection:bg-[#DBFF00]/30 selection:text-[#DBFF00]">
      <div className="w-full max-w-[480px] h-[100dvh] flex flex-col relative sm:border-x sm:border-white/[0.05] shadow-2xl bg-black">
        {/* Grain Texture */}
        <div className="grain-overlay" />
        {/* Scanlines Effect */}
        <div className="scanlines" />

        {/* Background Video */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-[0.25] mix-blend-screen"
          >
            <source src="https://72h.lol/72hours.mp4" type="video/mp4" />
          </video>
          {/* Advanced gradient overlay to seamlessly blend the video into the dark UI */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-transparent via-[#050505]/80 to-[#050505]" />
        </div>

        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[100%] h-[200px] bg-gradient-to-b from-[#DBFF00]/10 to-transparent blur-[50px] pointer-events-none z-0" />

        {/* Web3 Wallet Simulator (Mock) */}
        <div
          onClick={() => toast.success("Wallet fully synchronized. 18ms latency.")}
          className="absolute top-4 right-6 flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 z-20 backdrop-blur-md cursor-pointer hover:bg-white/10 transition-colors shadow-lg group"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[#DBFF00] shadow-[0_0_8px_#DBFF00] group-hover:animate-ping" />
          <span className="text-[10px] font-mono text-white/80 tracking-widest pl-0.5">0x3F<span className="opacity-50">...</span>b9A</span>

          <div className="absolute top-full mt-2 right-0 bg-[#111] border border-white/10 rounded-xl p-2.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-200 min-w-[120px] shadow-2xl">
             <div className="flex justify-between items-center text-[9px] font-mono mb-1 text-white/50">
               <span>Status</span>
               <span className="text-[#DBFF00]">Connected</span>
             </div>
             <div className="h-0.5 w-full bg-white/5 rounded-full mb-2"><div className="h-full bg-[#DBFF00] w-full rounded-full"></div></div>
             <div className="text-[8px] uppercase tracking-widest text-[#DBFF00]/50 text-right">Mainnet</div>
          </div>
        </div>

        <header className="px-6 pt-16 pb-6 shrink-0 flex items-center justify-between z-10 relative">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#DBFF00] shadow-[0_0_8px_#DBFF00] animate-pulse" />
              <h1 className="text-[10px] uppercase tracking-[0.25em] text-white/50 font-mono font-medium">
                Project 72H
              </h1>
            </div>
            <div className="text-xl font-semibold tracking-tight text-white/90">
              Millionaire Path
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 top-terminal-panel">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-widest text-white/40 font-mono">Live Price</span>
              <svg className="w-2.5 h-2.5 text-[#DBFF00] animate-[spin_3s_linear_infinite]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div className="text-[#DBFF00] font-mono text-[17px] font-medium flex items-center gap-2 tabular-nums">
              <motion.span
                key={tokenPrice}
                initial={{ opacity: 0.5, color: "#fff" }}
                animate={{ opacity: 1, color: "#DBFF00" }}
                transition={{ duration: 0.8 }}
              >
                ${tokenPrice.toFixed(3)}
              </motion.span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-[#DBFF00]/10 text-[#DBFF00] font-bold tracking-wider">
                +2.4%
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden z-10 pb-28 pt-2 no-scrollbar scroll-smooth relative">
          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
            {activeTab === "home" && (
              <motion.div
                key="home"
                custom={direction}
                variants={variants}
                initial="initial" animate="animate" exit="exit"
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                className="w-full absolute left-0 top-0 mb-28"
              >
                <Home tokenPrice={tokenPrice} myDeposit={myDeposit} setMyDeposit={setMyDeposit} targetValue={targetValue} />
              </motion.div>
            )}
            {activeTab === "team" && (
              <motion.div
                key="team"
                custom={direction}
                variants={variants}
                initial="initial" animate="animate" exit="exit"
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                className="w-full absolute left-0 top-0 mb-28"
              >
                <Team tokenPrice={tokenPrice} myDeposit={myDeposit} squadGoal={squadGoal} setSquadGoal={setSquadGoal} />
              </motion.div>
            )}
            {activeTab === "rewards" && (
              <motion.div
                key="rewards"
                custom={direction}
                variants={variants}
                initial="initial" animate="animate" exit="exit"
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                className="w-full absolute left-0 top-0 mb-28"
              >
                <Rewards />
              </motion.div>
            )}
            {activeTab === "share" && (
              <motion.div
                key="share"
                custom={direction}
                variants={variants}
                initial="initial" animate="animate" exit="exit"
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                className="w-full absolute left-0 top-0 mb-28"
              >
                <Share myDeposit={myDeposit} setMyDeposit={setMyDeposit} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <BottomNav activeTab={activeTab} setActiveTab={handleSetTab} />
      </div>
      <Toaster
        toastOptions={{
          className: "bg-[#111] border-white/10 text-white font-mono text-xs rounded-2xl",
        }}
        position="top-center"
      />
    </div>
  );
}
