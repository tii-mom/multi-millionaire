import { ArrowRight, Loader2, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { formatNumber, type useI18n } from "@/src/lib/i18n";

type DepositFlowProps = {
  availableBalance: number;
  backendUnavailable: boolean;
  chainActionDisabled: boolean;
  chainMainlineEnabled: boolean;
  inputValue: string;
  isConfirming: boolean;
  myDeposit: number;
  onDeposit: () => void;
  onInputChange: (value: string) => void;
  locale: string;
  t: ReturnType<typeof useI18n>["t"];
};

export default function DepositFlow({
  availableBalance,
  backendUnavailable,
  chainActionDisabled,
  chainMainlineEnabled,
  inputValue,
  isConfirming,
  myDeposit,
  onDeposit,
  onInputChange,
  locale,
  t,
}: DepositFlowProps) {
  return (
    <section className="glass-panel overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.025] backdrop-blur-2xl">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.025] px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <Wallet className="h-4 w-4 text-[#DBFF00]" />
          </div>
          <span className="text-sm font-medium tracking-wide">{t("home.deposit.title")}</span>
        </div>
        <div className="relative flex h-[28px] min-w-[110px] justify-end overflow-hidden font-mono text-xl tabular-nums">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={myDeposit}
              initial={{ y: -20, opacity: 0, color: "#DBFF00" }}
              animate={{ y: 0, opacity: 1, color: "#ffffff" }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="absolute right-0"
            >
              {formatNumber(myDeposit, locale)} <span className="text-[10px] uppercase tracking-widest text-white/50">72H</span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-6">
        <div className="group relative flex flex-col gap-2">
          <div className="absolute right-5 top-1/2 z-20 flex -translate-y-1/2 items-center gap-2">
            <button
              type="button"
              onClick={() => onInputChange(availableBalance.toString())}
              className="depth-button focus-ring rounded border border-[#DBFF00]/20 bg-white/5 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-[#DBFF00] hover:bg-[#DBFF00] hover:text-black"
            >
              {t("common.max")}
            </button>
            <div className="pointer-events-none font-mono text-2xl font-black uppercase tracking-tighter text-white/10 transition-colors group-focus-within:text-[#DBFF00]/10">
              72H
            </div>
          </div>

          <input
            type="number"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="0"
            disabled={isConfirming || backendUnavailable}
            className="w-full rounded-[18px] border border-white/[0.07] bg-[#050505]/[0.62] py-6 pl-6 pr-[120px] font-mono text-4xl tabular-nums shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] outline-none ring-[#DBFF00]/5 transition-colors placeholder:text-white/[0.08] hover:bg-[#050505]/[0.82] focus:border-[#DBFF00]/[0.42] focus:bg-black/70 focus:ring-2 disabled:opacity-50"
          />

          <div className="absolute -top-3 right-2 z-30 flex items-center gap-1 bg-[#070707] px-2 text-[9px] uppercase tracking-widest text-white/30">
            {t("common.display")}:
            <div className="relative inline-flex min-w-[54px] justify-end">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={availableBalance}
                  initial={{ y: -10, opacity: 0, color: "#DBFF00" }}
                  animate={{ y: 0, opacity: 1, color: "rgba(255,255,255,0.3)" }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="absolute bottom-0 right-0 top-0 flex"
                >
                  {formatNumber(availableBalance, locale)}
                </motion.span>
              </AnimatePresence>
              <span className="invisible">{formatNumber(availableBalance, locale)}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onDeposit}
          disabled={isConfirming || backendUnavailable || !inputValue || Number(inputValue) <= 0 || (chainMainlineEnabled && chainActionDisabled)}
          className="depth-button focus-ring group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-[18px] bg-[#DBFF00] py-4 font-bold tracking-wide text-black shadow-[0_0_22px_rgba(219,255,0,0.16)] hover:bg-[#d3f51c] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <div className="absolute inset-0 h-full w-full -translate-x-[150%] skew-x-[30deg] bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:animate-[shine_1s_ease-out]" />
          {isConfirming ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{chainMainlineEnabled ? t("home.deposit.sendingChainTx") : t("home.deposit.recording")}</span>
            </>
          ) : (
            <>
              <span>{backendUnavailable ? t("home.deposit.backendUnavailable") : chainMainlineEnabled ? t("home.deposit.sendChainTx") : t("home.deposit.recordStaging")}</span>
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>

        <div className="mt-1 flex w-full items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-white/[0.32]">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            {chainMainlineEnabled ? t("home.deposit.chainReceiptRequired") : t("home.deposit.offChainRecord")}
          </p>
          <div className="flex items-center gap-1.5 text-white/45">
            <div className="h-2 w-0.5 animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-white/40" />
            <div className="h-3 w-0.5 animate-[pulse_1.5s_ease-in-out_infinite_0.2s] rounded-full bg-white/40" />
            <div className="h-1.5 w-0.5 animate-[pulse_0.8s_ease-in-out_infinite_0.4s] rounded-full bg-white/40" />
            <span className="ml-1 text-[8px] uppercase tracking-widest">{chainMainlineEnabled ? t("home.deposit.receiptMode") : t("home.deposit.stagingMode")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
