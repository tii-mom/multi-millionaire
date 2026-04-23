import { Gift, Home as HomeIcon, Users, Share2 } from "lucide-react";

export default function BottomNav({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) {
  const tabs = [
    { id: "home", label: "Deposit", icon: HomeIcon },
    { id: "team", label: "Squad", icon: Users },
    { id: "rewards", label: "Reward", icon: Gift },
    { id: "share", label: "Share", icon: Share2 },
  ];

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] bg-[#050505]/80 backdrop-blur-[32px] border border-white/[0.08] border-t-white/[0.12] rounded-[32px] px-2 py-2 z-50 shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
      <div className="flex justify-between items-center w-full relative z-10">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-full transition-all duration-300 relative ${
                isActive ? "bg-white/[0.06] text-[#DBFF00]" : "text-white/40 hover:text-white/70 hover:bg-white/[0.02]"
              }`}
            >
              <Icon className="w-5 h-5 transition-transform duration-300" strokeWidth={isActive ? 2.5 : 2} style={{ transform: isActive ? 'translateY(-2px)' : 'translateY(0)' }} />
              <span className={`text-[9px] font-mono uppercase tracking-[0.15em] transition-all duration-300 ${isActive ? 'opacity-100 font-bold' : 'opacity-80'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
