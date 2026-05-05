import { ArrowRight, Loader2, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { formatNumber, type useI18n } from "@/src/lib/i18n";

type DepositFlowProps = {
  availableBalance: number;
  backendUnavailable: boolean;
  chainActionDisabled: boolean;
  chainMainlineEnabled: boolean;
  depositRuntimeEnabled: boolean;
  inputValue: string;
  isConfirming: boolean;
  myDeposit: number;
  onDeposit: () => void;
  onInputChange: (value: string) => void;
  onTargetChange: (value: number) => void;
  locale: string;
  selectedTargetValue: number;
  targetOptions: readonly number[];
  t: ReturnType<typeof useI18n>["t"];
};

export default function DepositFlow({
  availableBalance,
  backendUnavailable,
  chainActionDisabled,
  chainMainlineEnabled,
  depositRuntimeEnabled,
  inputValue,
  isConfirming,
  myDeposit,
  onDeposit,
  onInputChange,
  onTargetChange,
  locale,
  selectedTargetValue,
  targetOptions,
  t,
}: DepositFlowProps) {
  return (
    <section className="financial-panel overflow-hidden rounded-[16px]">
      <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.022] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-black/25">
            <Wallet className="h-4 w-4 text-[#d7b46a]" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-white/90">{t("home.deposit.title")}</span>
        </div>
        <div className="relative flex h-[28px] min-w-[110px] justify-end overflow-hidden font-mono text-xl tabular-nums">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={myDeposit}
              initial={{ y: -20, opacity: 0, color: "#d7b46a" }}
              animate={{ y: 0, opacity: 1, color: "#ffffff" }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="absolute right-0"
            >
              {formatNumber(myDeposit, locale)} <span className="text-[10px] uppercase tracking-widest text-white/50">72H</span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {targetOptions.map((target) => {
            const selected = target === selectedTargetValue;
            return (
              <button
                key={target}
                type="button"
                onClick={() => onTargetChange(target)}
                disabled={isConfirming || backendUnavailable}
                className={`focus-ring rounded-[10px] border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  selected
                    ? "border-[#d7b46a]/50 bg-[#d7b46a]/14 text-[#d7b46a]"
                    : "border-white/[0.08] bg-white/[0.035] text-white/68 hover:border-white/16 hover:bg-white/[0.055]"
                }`}
              >
                <span className="block font-mono text-sm font-semibold tabular-nums">
                  ${formatNumber(target, locale, { maximumFractionDigits: 0 })}
                </span>
                <span className="mt-0.5 block text-[8px] uppercase tracking-widest text-white/32">
                  {t("home.deposit.targetTier")}
                </span>
              </button>
            );
          })}
        </div>

        <div className="rounded-[12px] border border-amber-200/18 bg-amber-200/8 px-3 py-2 text-[10px] leading-relaxed text-amber-50/80">
          {t("home.deposit.goalWarning")}
        </div>

        <div className="group relative flex flex-col gap-2">
          <div className="absolute right-5 top-1/2 z-20 flex -translate-y-1/2 items-center gap-2">
            <button
              type="button"
              onClick={() => onInputChange(availableBalance.toString())}
              className="depth-button focus-ring rounded-md border border-[#d7b46a]/25 bg-[#d7b46a]/10 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-[#d7b46a] hover:bg-[#d7b46a] hover:text-black"
            >
              {t("common.max")}
            </button>
            <div className="pointer-events-none font-mono text-2xl font-black uppercase tracking-tighter text-white/10 transition-colors group-focus-within:text-[#d7b46a]/14">
              72H
            </div>
          </div>

          <input
            type="number"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="0"
            disabled={isConfirming || backendUnavailable || !depositRuntimeEnabled}
            className="w-full rounded-[12px] border border-white/[0.08] bg-[#030405]/[0.72] py-6 pl-5 pr-[120px] font-mono text-[2rem] tabular-nums shadow-[inset_0_2px_10px_rgba(0,0,0,0.55)] outline-none ring-[#d7b46a]/5 transition-colors placeholder:text-white/[0.08] hover:bg-[#030405]/[0.88] focus:border-[#d7b46a]/[0.44] focus:bg-black/75 focus:ring-2 disabled:opacity-50"
          />

          <div className="absolute -top-3 right-2 z-30 flex items-center gap-1 bg-[#080a0c] px-2 text-[9px] uppercase tracking-widest text-white/34">
            {t("common.display")}:
            <div className="relative inline-flex min-w-[54px] justify-end">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={availableBalance}
                  initial={{ y: -10, opacity: 0, color: "#d7b46a" }}
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
          disabled={isConfirming || backendUnavailable || !depositRuntimeEnabled || !inputValue || Number(inputValue) <= 0 || (chainMainlineEnabled && chainActionDisabled)}
            className="depth-button focus-ring group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-[12px] bg-[#d7b46a] py-4 font-semibold tracking-wide text-black shadow-[0_16px_32px_rgba(0,0,0,0.26)] hover:bg-[#e1c07b] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <div className="absolute inset-0 h-full w-full -translate-x-[150%] skew-x-[30deg] bg-gradient-to-r from-transparent via-white/24 to-transparent group-hover:animate-[shine_1s_ease-out]" />
          {isConfirming ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{chainMainlineEnabled ? t("home.deposit.sendingChainTx") : t("home.deposit.recording")}</span>
            </>
          ) : (
            <>
              <span>{backendUnavailable ? t("home.deposit.backendUnavailable") : !depositRuntimeEnabled ? t("home.deposit.readOnlyCta") : chainMainlineEnabled ? t("home.deposit.sendChainTx") : t("home.deposit.recordStaging")}</span>
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>

        <div className="mt-1 flex w-full items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-white/[0.32]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
            {chainMainlineEnabled ? t("home.deposit.chainReceiptRequired") : depositRuntimeEnabled ? t("home.deposit.offChainRecord") : t("home.deposit.readOnly")}
          </p>
          <div className="flex items-center gap-1.5 text-white/45">
            <div className="h-2 w-0.5 animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-white/36" />
            <div className="h-3 w-0.5 animate-[pulse_1.5s_ease-in-out_infinite_0.2s] rounded-full bg-white/36" />
            <div className="h-1.5 w-0.5 animate-[pulse_0.8s_ease-in-out_infinite_0.4s] rounded-full bg-white/36" />
            <span className="ml-1 text-[8px] uppercase tracking-widest">{chainMainlineEnabled ? t("home.deposit.receiptMode") : depositRuntimeEnabled ? t("home.deposit.stagingMode") : t("home.deposit.readOnlyMode")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
