import type { useI18n } from "@/src/lib/i18n";
import type { WalletBindIntent, WalletBinding } from "@/src/lib/types";

type WalletBindingFlowProps = {
  chainActionDisabled: boolean;
  chainDisabledReason: string | null;
  chainMainlineEnabled: boolean;
  walletAddress: string;
  walletLoading: boolean;
  bindIntent: WalletBindIntent | null;
  walletSignature: string;
  wallets: WalletBinding[];
  onWalletAddressChange: (value: string) => void;
  onWalletSignatureChange: (value: string) => void;
  onRequestBindIntent: () => void;
  onSubmitWalletBind: () => void;
  t: ReturnType<typeof useI18n>["t"];
};

export default function WalletBindingFlow({
  chainActionDisabled,
  chainDisabledReason,
  chainMainlineEnabled,
  walletAddress,
  walletLoading,
  bindIntent,
  walletSignature,
  wallets,
  onWalletAddressChange,
  onWalletSignatureChange,
  onRequestBindIntent,
  onSubmitWalletBind,
  t,
}: WalletBindingFlowProps) {
  if (!chainMainlineEnabled) {
    return null;
  }

  return (
    <details className="rounded-[18px] border border-white/10 bg-black/25 p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">{t("home.wallet.title")}</div>
            <div className="mt-1 text-[11px] text-white/35">{chainDisabledReason || t("home.deposit.walletFlowRequired")}</div>
          </div>
          <div className="shrink-0 text-[9px] uppercase tracking-widest text-[#DBFF00]">
            {t("home.wallet.enabled")}
          </div>
        </div>
      </summary>

      <div className="mt-4 flex flex-col gap-3">
        <input
          type="text"
          value={walletAddress}
          onChange={(event) => onWalletAddressChange(event.target.value)}
          placeholder={t("home.wallet.addressPlaceholder")}
          disabled={chainActionDisabled || walletLoading}
          className="w-full rounded-xl border border-white/10 bg-[#050505]/[0.62] px-3 py-3 font-mono text-xs outline-none transition-colors placeholder:text-white/[0.22] focus:border-[#DBFF00]/[0.42] disabled:opacity-50"
        />

        {bindIntent && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 text-[9px] uppercase tracking-widest text-white/35">{t("home.wallet.signableMessage")}</div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-white/55">{bindIntent.signable_message}</pre>
          </div>
        )}

        <input
          type="text"
          value={walletSignature}
          onChange={(event) => onWalletSignatureChange(event.target.value)}
          placeholder={t("home.wallet.signaturePlaceholder")}
          disabled={chainActionDisabled || walletLoading || !bindIntent}
          className="w-full rounded-xl border border-white/10 bg-[#050505]/[0.62] px-3 py-3 font-mono text-xs outline-none transition-colors placeholder:text-white/[0.22] focus:border-[#DBFF00]/[0.42] disabled:opacity-50"
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onRequestBindIntent}
            disabled={chainActionDisabled || walletLoading || !walletAddress.trim()}
            className="depth-button focus-ring rounded-xl border border-white/10 bg-white/10 py-3 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {walletLoading ? t("common.working") : t("home.wallet.getNonce")}
          </button>
          <button
            type="button"
            onClick={onSubmitWalletBind}
            disabled={chainActionDisabled || walletLoading || !bindIntent || !walletSignature.trim()}
            className="depth-button focus-ring rounded-xl bg-[#DBFF00] py-3 text-[10px] font-bold uppercase tracking-widest text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("home.wallet.bind")}
          </button>
        </div>

        {wallets.length > 0 && (
          <div className="break-all font-mono text-[10px] text-white/45">
            {t("home.wallet.bound", { wallet: wallets[0].wallet_address, status: wallets[0].status })}
          </div>
        )}
      </div>
    </details>
  );
}
