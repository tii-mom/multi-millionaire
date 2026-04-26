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
    <div className="bottom-nav-shell absolute left-1/2 z-50 w-[calc(100%-2rem)] max-w-[432px] -translate-x-1/2 overflow-hidden rounded-[22px] border border-white/[0.08] border-t-white/[0.14] bg-[#07090b]/[0.82] px-2 py-2 shadow-[0_24px_54px_rgba(0,0,0,0.72)] backdrop-blur-[30px] sm:w-[calc(100%-3rem)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.045),transparent),linear-gradient(90deg,transparent,rgba(215,180,106,0.055),transparent)]" />
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
                isActive ? "text-[#d7b46a]" : "text-white/[0.42] hover:bg-white/[0.035] hover:text-white/[0.76]"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-active"
                  className="absolute inset-0 rounded-[18px] border border-[#d7b46a]/15 bg-white/[0.065] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_28px_rgba(215,180,106,0.07)]"
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                />
              )}
              <Icon className="relative z-10 h-5 w-5 transition-transform duration-300" strokeWidth={isActive ? 2.5 : 2} style={{ transform: isActive ? 'translateY(-2px)' : 'translateY(0)' }} />
              <span className={`relative z-10 whitespace-nowrap text-[9px] font-mono uppercase tracking-[0.12em] transition-all duration-300 ${isActive ? 'opacity-100 font-bold' : 'opacity-80'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
