import { useState } from "react";
import { toast } from "sonner";
import { Users, Crown, Sparkles, Plus, Target } from "lucide-react";
import { motion } from "motion/react";

export default function Team({ tokenPrice, myDeposit, squadGoal, setSquadGoal }: any) {
  const [goalInput, setGoalInput] = useState("");
  
  // Mock Data
  const myFiat = myDeposit * tokenPrice;
  const members = [
    { id: 1, name: "CryptoWhale007", deposit: 1450000 * tokenPrice, rank: 1 },
    { id: 2, name: "DiamondHands", deposit: 850000 * tokenPrice, rank: 2 },
    { id: 3, name: "You (Me)", deposit: myFiat, rank: 3 },
    { id: 4, name: "ApeInvestor_X", deposit: 12000 * tokenPrice, rank: 4 },
  ].sort((a, b) => b.deposit - a.deposit);

  const teamTotal = members.reduce((acc, curr) => acc + curr.deposit, 0);
  const progressPercent = Math.min((teamTotal / squadGoal) * 100, 100);

  return (
    <div className="px-6 flex flex-col gap-6 pb-10">
      {/* Squad Header */}
      <div className="bg-white/[0.02] border border-white/10 rounded-[24px] p-6 backdrop-blur-xl relative overflow-hidden group">
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-[#DBFF00]/10 blur-3xl rounded-full" />
        
        <div className="flex items-center justify-between mb-4 relative z-10">
          <div className="flex items-center gap-2 text-white/50">
            <Users className="w-5 h-5" />
            <span className="text-[11px] uppercase tracking-widest font-mono">Alpha Squad</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#DBFF00] bg-[#DBFF00]/10 px-3 py-1.5 rounded-full text-[10px] font-mono border border-[#DBFF00]/20 font-semibold tracking-wider">
            <Sparkles className="w-3 h-3" /> Rank #42
          </div>
        </div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-end mt-5 mb-1.5">
            <div className="text-[10px] text-white/50 font-mono uppercase tracking-widest">
              Squad Market Value
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-[5px] w-[5px]">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#DBFF00] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-[5px] w-[5px] bg-[#DBFF00]"></span>
              </span>
              <span className="text-[9px] uppercase tracking-widest font-mono text-[#DBFF00]/70 flex items-center gap-1">
                Rate: 
                <motion.span key={tokenPrice} initial={{ color: "#fff" }} animate={{ color: "#DBFF00" }} className="tabular-nums font-bold">
                  ${tokenPrice.toFixed(3)}
                </motion.span>
              </span>
            </div>
          </div>
          <motion.div 
            key={teamTotal}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 1 }}
            className="text-4xl font-mono text-transparent bg-clip-text bg-gradient-to-br from-[#DBFF00] to-[#DBFF00]/60 font-semibold tracking-tighter mb-6 tabular-nums"
          >
            ${teamTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </motion.div>
          
          {/* Custom Goal Input */}
          <div className="flex items-center gap-2 mb-5">
            <input 
              type="number" 
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="Set custom goal ($)"
              className="flex-1 bg-black/40 border border-white/10 rounded-[14px] py-2.5 px-3.5 outline-none focus:border-[#DBFF00]/50 transition-colors font-mono text-xs tabular-nums placeholder:text-white/20 focus:bg-black/80 shadow-inner"
            />
            <button 
              onClick={() => {
                const val = Number(goalInput);
                if (val > 0) {
                  if (setSquadGoal) setSquadGoal(val);
                  setGoalInput("");
                  toast.success(`Squad goal set to $${val.toLocaleString()}`);
                } else {
                  toast.error("Enter a valid goal amount");
                }
              }}
              className="bg-white/10 text-white border border-white/20 px-4 py-2.5 rounded-[14px] font-bold text-[10px] uppercase tracking-widest hover:bg-[#DBFF00] hover:text-black hover:border-[#DBFF00] transition-colors active:scale-[0.98]"
            >
              Set
            </button>
          </div>

          {/* Squad Progress Bar */}
          <div>
            <div className="flex justify-between items-end text-[10px] font-mono text-white/50 mb-2 uppercase tracking-widest">
              <span className="flex items-center gap-1.5 text-white/70">
                <Target className="w-3.5 h-3.5" />
                Goal: ${squadGoal.toLocaleString()}
              </span>
              <span className="text-[#DBFF00] font-semibold text-[11px] tabular-nums">{progressPercent.toFixed(1)}%</span>
            </div>
            <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden border border-white/[0.05] relative shadow-inner">
              <div 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-transparent via-[#DBFF00]/80 to-[#DBFF00] transition-all duration-1000 ease-out flex justify-end items-center" 
                style={{ width: `${Math.max(progressPercent, 2)}%` }}
              >
                <div className="w-1.5 h-1.5 bg-white rounded-full mr-0.5 shadow-[0_0_10px_2px_#DBFF00]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Invite Action */}
      <button className="w-full bg-white/[0.02] border border-dashed border-white/20 hover:border-[#DBFF00]/50 hover:bg-[#DBFF00]/5 transition-all active:scale-[0.98] rounded-[20px] p-5 flex items-center justify-center gap-2.5 group backdrop-blur-sm">
        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-[#DBFF00]/20 transition-colors">
          <Plus className="w-4 h-4 text-white/50 group-hover:text-[#DBFF00]" />
        </div>
        <span className="font-mono uppercase text-xs tracking-wider text-white/70 group-hover:text-[#DBFF00]">
          Invite Squad Member
        </span>
      </button>

      {/* Leaderboard */}
      <div className="bg-white/[0.02] border border-white/10 rounded-[24px] p-2 backdrop-blur-xl">
        <h3 className="text-[11px] uppercase tracking-[0.2em] font-mono text-white/50 p-4 pb-2 flex items-center gap-2">
          <Crown className="w-4 h-4 text-[#DBFF00]/80" />
          Top Contributors
        </h3>
        
        <div className="flex flex-col gap-1 mt-2">
          {members.map((m, i) => (
            <div 
              key={m.id} 
              className={`flex items-center justify-between p-4 rounded-[16px] transition-colors ${
                m.name === "You (Me)" 
                  ? "bg-[#DBFF00]/5 border border-[#DBFF00]/20" 
                  : "hover:bg-white/[0.03] border border-transparent"
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-[10px] font-bold shadow-inner ${
                   i === 0 ? "bg-[#DBFF00] text-black shadow-[0_0_10px_rgba(219,255,0,0.3)]" : "bg-white/5 text-white/50 border border-white/10"
                }`}>
                  #{i + 1}
                </div>
                <span className={`font-medium text-sm tracking-wide ${m.name === "You (Me)" ? "text-[#DBFF00]" : "text-white/90"}`}>{m.name}</span>
              </div>
              <div className="font-mono text-sm text-right flex flex-col items-end">
                <span className="tabular-nums font-semibold tracking-tight">${m.deposit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                <span className="text-[9px] text-white/40 tabular-nums uppercase tracking-widest mt-0.5">~{(m.deposit / tokenPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })} 72H</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
