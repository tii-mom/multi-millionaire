import { Gift, Radio, Users, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { useI18n } from "@/src/lib/i18n";

export default function BottomNav({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) {
  const { locale, t } = useI18n();
  const tabs = [
    { id: "home", label: t("nav.deposit"), icon: Wallet },
    { id: "team", label: t("nav.squad"), icon: Users },
    { id: "live", label: t("nav.live"), icon: Radio },
    { id: "rewards", label: t("nav.reward"), icon: Gift },
  ];

  return (
    <div className="bottom-nav-shell relative z-50 mx-auto w-[calc(100%-2rem)] max-w-[432px] overflow-hidden rounded-[18px] border border-white/[0.07] bg-[#07090b]/[0.9] px-2 py-2 shadow-[0_24px_54px_rgba(0,0,0,0.72)] backdrop-blur-[30px] sm:w-[calc(100%-3rem)]">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#d7b46a]/35 to-transparent" />
      <div className="relative z-10 grid w-full grid-cols-4 items-center gap-1">
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
              className={`focus-ring relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-[14px] transition-colors duration-300 ${
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
                className={`relative z-10 transition-transform duration-300 ${isPrimary ? "h-[21px] w-[21px]" : "h-[19px] w-[19px]"}`}
                strokeWidth={isActive ? 2.35 : 1.9}
                style={{ transform: isActive ? "translateY(-1px)" : "translateY(0)" }}
              />
              <span
                className={`relative z-10 max-w-[4.25rem] text-center text-[10px] font-bold leading-none transition-all duration-300 ${
                  locale.startsWith("zh") ? "tracking-[0.02em]" : "truncate tracking-[0.08em]"
                } ${isActive ? "translate-y-0 opacity-100 drop-shadow-[0_0_10px_rgba(215,180,106,0.18)]" : "translate-y-0.5 opacity-0"}`}
                aria-hidden={!isActive}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
