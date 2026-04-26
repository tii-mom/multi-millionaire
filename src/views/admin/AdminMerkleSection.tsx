import { Loader2, RefreshCw, Save } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/src/lib/i18n";
import type { MerkleRewardBatch, MerkleRewardProof } from "@/src/lib/types";
import { EmptyRows } from "./EmptyRows";
import { formatInteger } from "./format";
import { StatusPill } from "./StatusPill";

type AdminMerkleSectionProps = {
  batches: MerkleRewardBatch[];
  chainId: string;
  error: string | null;
  isCreating: boolean;
  isLoading: boolean;
  merkleDraftWritesDisabled: boolean;
  onChainIdChange: (value: string) => void;
  onCreateDraft: () => void;
  onReload: () => void;
  onTokenAddressChange: (value: string) => void;
  proofs: MerkleRewardProof[];
  tokenAddress: string;
  writesDisabled: boolean;
};

export function AdminMerkleSection({
  batches,
  chainId,
  error,
  isCreating,
  isLoading,
  merkleDraftWritesDisabled,
  onChainIdChange,
  onCreateDraft,
  onReload,
  onTokenAddressChange,
  proofs,
  tokenAddress,
  writesDisabled,
}: AdminMerkleSectionProps) {
  const { locale, t } = useI18n();
  const draftDisabled = writesDisabled || merkleDraftWritesDisabled || isCreating;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/55">{t("admin.merkle.title")}</h2>
          <p className="mt-1 text-xs text-white/35">{t("admin.merkle.detail")}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReload}
            disabled={isLoading || isCreating}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs uppercase tracking-widest text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {t("common.refresh")}
          </button>
          <button
            type="button"
            onClick={onCreateDraft}
            disabled={draftDisabled || isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#DBFF00]/20 bg-[#DBFF00]/10 px-3 py-2 text-xs uppercase tracking-widest text-[#DBFF00] transition-colors hover:bg-[#DBFF00] hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t("admin.merkle.createDraft")}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/65">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.merkle.chainId")}</span>
              <input
                value={chainId}
                onChange={(event) => onChainIdChange(event.target.value)}
                disabled={draftDisabled}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-[#DBFF00]/40 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="ton-mainnet"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.merkle.tokenAddress")}</span>
              <input
                value={tokenAddress}
                onChange={(event) => onTokenAddressChange(event.target.value)}
                disabled={draftDisabled}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-[#DBFF00]/40 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={t("admin.merkle.tokenPlaceholder")}
              />
            </label>
          </div>
        </div>

        <MerkleRows
          empty={!batches.length}
          isLoading={isLoading}
          title={t("admin.merkle.latestBatches")}
        >
          {batches.slice(0, 5).map((batch) => (
            <div key={batch.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate font-mono text-xs text-white/75">{batch.id}</div>
                <StatusPill status={batch.status} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/45">
                <span className="truncate">{t("admin.rows.root")} {batch.merkle_root}</span>
                <span className="text-right tabular-nums">{formatInteger(batch.total_amount_raw, locale)}</span>
              </div>
            </div>
          ))}
        </MerkleRows>

        <MerkleRows
          empty={!proofs.length}
          isLoading={isLoading}
          title={t("admin.merkle.latestProofs")}
        >
          {proofs.slice(0, 5).map((proof) => (
            <div key={proof.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate font-mono text-xs text-white/75">{proof.reward_ledger_id}</div>
                <StatusPill status={proof.claim_status} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/45">
                <span className="truncate">{proof.beneficiary_wallet}</span>
                <span className="text-right tabular-nums">{formatInteger(proof.amount_raw, locale)}</span>
              </div>
            </div>
          ))}
        </MerkleRows>
      </div>
    </section>
  );
}

function MerkleRows({
  children,
  empty,
  isLoading,
  title,
}: {
  children: ReactNode;
  empty: boolean;
  isLoading: boolean;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 text-[10px] uppercase tracking-widest text-white/35">{title}</div>
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-white/45" />
      ) : empty ? (
        <EmptyRows />
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </div>
  );
}
