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
    <div className="financial-panel flex flex-col gap-3 rounded-[14px] p-4">
      {pendingDepositReceipt && (
        <div className="rounded-[10px] border border-[#d7b46a]/22 bg-[#d7b46a]/[0.07] p-3 font-mono text-[10px] leading-5 text-white/55">
          <div className="mb-2 text-[9px] uppercase tracking-widest text-[#d7b46a]/80">{t("home.receipt.pendingTitle")}</div>
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
        className="w-full rounded-[10px] border border-white/10 bg-[#030405]/[0.68] px-3 py-3 font-mono text-xs outline-none transition-colors placeholder:text-white/[0.22] focus:border-[#d7b46a]/[0.44] disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onSubmitReceipt}
        disabled={chainActionDisabled || receiptLoading || !pendingDepositReceipt || !txHash.trim()}
        className="depth-button focus-ring rounded-[10px] border border-[#d7b46a]/25 bg-[#d7b46a]/10 py-3 text-[10px] font-bold uppercase tracking-widest text-[#d7b46a] hover:bg-[#d7b46a] hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        {receiptLoading ? t("home.receipt.submitting") : t("home.receipt.submit")}
      </button>
    </div>
  );
}
