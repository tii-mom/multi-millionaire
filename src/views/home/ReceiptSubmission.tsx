import type { useI18n } from "@/src/lib/i18n";
import { shortWalletAddress } from "@/src/lib/tonSession";
import type { PendingDepositReceipt } from "./types";

function shortHash(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-8)}` : value;
}

type ReceiptSubmissionProps = {
  chainActionDisabled: boolean;
  receiptLoading: boolean;
  pendingDepositReceipt: PendingDepositReceipt | null;
  txHash: string;
  onTxHashChange: (value: string) => void;
  onSubmitReceipt: () => void;
  t: ReturnType<typeof useI18n>["t"];
};

export default function ReceiptSubmission({
  chainActionDisabled,
  receiptLoading,
  pendingDepositReceipt,
  txHash,
  onTxHashChange,
  onSubmitReceipt,
  t,
}: ReceiptSubmissionProps) {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-white/10 bg-black/25 p-4">
      {pendingDepositReceipt && (
        <div className="rounded-xl border border-[#DBFF00]/20 bg-[#DBFF00]/[0.06] p-3 font-mono text-[10px] leading-5 text-white/55">
          <div className="mb-2 text-[9px] uppercase tracking-widest text-[#DBFF00]/75">{t("home.receipt.pendingTitle")}</div>
          <div>{t("home.receipt.pendingAmount", { amount: pendingDepositReceipt.amountRaw })}</div>
          <div>{t("home.receipt.pendingWave", { wave: pendingDepositReceipt.waveId })}</div>
          <div>{t("home.receipt.pendingQuery", { query: pendingDepositReceipt.queryId })}</div>
          <div>{t("home.receipt.pendingPosition", { position: shortHash(pendingDepositReceipt.positionId) })}</div>
          <div>{t("home.receipt.pendingVault", { vault: shortWalletAddress(pendingDepositReceipt.vaultAddress) })}</div>
          <div>{t("home.receipt.pendingDestination", { destination: shortWalletAddress(pendingDepositReceipt.jettonWalletAddress) })}</div>
        </div>
      )}

      <input
        type="text"
        value={txHash}
        onChange={(event) => onTxHashChange(event.target.value)}
        placeholder={t("home.receipt.placeholder")}
        disabled={chainActionDisabled || receiptLoading}
        className="w-full rounded-xl border border-white/10 bg-[#050505]/[0.62] px-3 py-3 font-mono text-xs outline-none transition-colors placeholder:text-white/[0.22] focus:border-[#DBFF00]/[0.42] disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onSubmitReceipt}
        disabled={chainActionDisabled || receiptLoading || !pendingDepositReceipt || !txHash.trim()}
        className="depth-button focus-ring rounded-xl border border-[#DBFF00]/20 bg-[#DBFF00]/10 py-3 text-[10px] font-bold uppercase tracking-widest text-[#DBFF00] hover:bg-[#DBFF00] hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        {receiptLoading ? t("home.receipt.submitting") : t("home.receipt.submit")}
      </button>
    </div>
  );
}
