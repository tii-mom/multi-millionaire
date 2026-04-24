import { Gift, Home as HomeIcon, Users, Share2 } from "lucide-react";
import { motion } from "motion/react";
import { useI18n } from "@/src/lib/i18n";

export default function BottomNav({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) {
  const { t } = useI18n();
  const tabs = [
    { id: "home", label: t("nav.deposit"), icon: HomeIcon },
    { id: "team", label: t("nav.squad"), icon: Users },
    { id: "rewards", label: t("nav.reward"), icon: Gift },
    { id: "share", label: t("nav.share"), icon: Share2 },
  ];

  return (
    <div className="absolute bottom-5 left-1/2 z-50 w-[calc(100%-3rem)] -translate-x-1/2 overflow-hidden rounded-[30px] border border-white/[0.08] border-t-white/[0.16] bg-[#050505]/[0.78] px-2 py-2 shadow-[0_30px_70px_rgba(0,0,0,0.78)] backdrop-blur-[34px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(219,255,0,0.08),transparent_42%),linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent)]" />
      <div className="flex justify-between items-center w-full relative z-10">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
              className={`focus-ring relative flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1.5 rounded-full py-2.5 transition-colors duration-300 ${
                isActive ? "text-[#DBFF00]" : "text-white/[0.38] hover:bg-white/[0.03] hover:text-white/[0.72]"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-active"
                  className="absolute inset-0 rounded-full border border-[#DBFF00]/10 bg-white/[0.075] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_28px_rgba(219,255,0,0.08)]"
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                />
              )}
              <Icon className="relative z-10 h-5 w-5 transition-transform duration-300" strokeWidth={isActive ? 2.5 : 2} style={{ transform: isActive ? 'translateY(-2px)' : 'translateY(0)' }} />
              <span className={`relative z-10 text-[9px] font-mono uppercase tracking-[0.12em] transition-all duration-300 ${isActive ? 'opacity-100 font-bold' : 'opacity-80'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
