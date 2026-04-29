import { Gift, Share2, Trophy, Users, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { useI18n } from "@/src/lib/i18n";

export default function BottomNav({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) {
  const { t } = useI18n();
  const tabs = [
    { id: "team", label: t("nav.squad"), icon: Users },
    { id: "leaderboard", label: t("nav.leaderboard"), icon: Trophy },
    { id: "home", label: t("nav.deposit"), icon: Wallet },
    { id: "rewards", label: t("nav.reward"), icon: Gift },
    { id: "share", label: t("nav.share"), icon: Share2 },
  ];

  return (
    <div className="bottom-nav-shell relative z-50 mx-auto w-[calc(100%-2rem)] max-w-[432px] overflow-hidden rounded-[18px] border border-white/[0.07] bg-[#07090b]/[0.9] px-2 py-2 shadow-[0_24px_54px_rgba(0,0,0,0.72)] backdrop-blur-[30px] sm:w-[calc(100%-3rem)]">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#d7b46a]/35 to-transparent" />
      <div className="relative z-10 grid w-full grid-cols-5 items-center gap-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const isPrimary = tab.id === "home";
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
              className={`focus-ring relative flex h-12 items-center justify-center rounded-[14px] transition-colors duration-300 ${
                isActive ? "text-[#d7b46a]" : "text-white/[0.38] hover:bg-white/[0.035] hover:text-white/[0.72]"
              } ${
                isPrimary ? "h-[52px]" : ""
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-active"
                  className="absolute inset-1 rounded-[12px] border border-[#d7b46a]/18 bg-[#d7b46a]/[0.075] shadow-[inset_0_1px_0_rgba(255,255,255,0.055),0_10px_26px_rgba(215,180,106,0.06)]"
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                />
              )}
              <Icon
                className={`relative z-10 transition-transform duration-300 ${isPrimary ? "h-[22px] w-[22px]" : "h-5 w-5"}`}
                strokeWidth={isActive ? 2.35 : 1.9}
                style={{ transform: isActive ? "translateY(-1px)" : "translateY(0)" }}
              />
              <span className="sr-only">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
