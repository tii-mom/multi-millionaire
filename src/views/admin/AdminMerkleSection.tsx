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
  onBatchChange: (batchId: string) => void;
  onChainIdChange: (value: string) => void;
  onCreateDraft: () => void;
  onReload: () => void;
  onTokenAddressChange: (value: string) => void;
  proofs: MerkleRewardProof[];
  selectedBatchId: string;
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
  onBatchChange,
  onChainIdChange,
  onCreateDraft,
  onReload,
  onTokenAddressChange,
  proofs,
  selectedBatchId,
  tokenAddress,
  writesDisabled,
}: AdminMerkleSectionProps) {
  const { locale, t } = useI18n();
  const draftDisabled = writesDisabled || merkleDraftWritesDisabled || isCreating;

  return (
    <section className="admin-panel rounded-[14px] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{t("admin.merkle.title")}</h2>
          <p className="mt-1 text-xs text-slate-500">{t("admin.merkle.detail")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onReload}
            disabled={isLoading || isCreating}
            className="admin-action inline-flex h-9 items-center justify-center gap-2 rounded-[10px] px-3 text-xs font-medium uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("common.refresh")}
          </button>
          <button
            type="button"
            onClick={onCreateDraft}
            disabled={draftDisabled || isLoading}
            className="admin-primary inline-flex h-9 items-center justify-center gap-2 rounded-[10px] px-3 text-xs font-semibold uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("admin.merkle.createDraft")}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-[12px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/85">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="admin-panel-quiet rounded-[12px] p-4 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">{t("admin.merkle.chainId")}</span>
              <input
                value={chainId}
                onChange={(event) => onChainIdChange(event.target.value)}
                disabled={draftDisabled}
                className="mt-2 h-10 w-full rounded-[10px] border border-slate-700 bg-slate-950/70 px-3 font-mono text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-[#d7b46a]/50 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="ton-mainnet"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">{t("admin.merkle.tokenAddress")}</span>
              <input
                value={tokenAddress}
                onChange={(event) => onTokenAddressChange(event.target.value)}
                disabled={draftDisabled}
                className="mt-2 h-10 w-full rounded-[10px] border border-slate-700 bg-slate-950/70 px-3 font-mono text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-[#d7b46a]/50 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={t("admin.merkle.tokenPlaceholder")}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onBatchChange("")}
              className={`h-8 rounded-[9px] border px-3 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                selectedBatchId
                  ? "border-slate-800 bg-slate-950/70 text-slate-500 hover:text-slate-200"
                  : "border-[#d7b46a]/25 bg-[#d7b46a]/10 text-[#f5deb3]"
              }`}
            >
              {t("admin.merkle.latest")}
            </button>
            {batches.slice(0, 5).map((batch) => (
              <button
                key={batch.id}
                type="button"
                onClick={() => onBatchChange(batch.id)}
                className={`h-8 max-w-[180px] truncate rounded-[9px] border px-3 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                  selectedBatchId === batch.id
                    ? "border-[#d7b46a]/25 bg-[#d7b46a]/10 text-[#f5deb3]"
                    : "border-slate-800 bg-slate-950/70 text-slate-500 hover:text-slate-200"
                }`}
                title={batch.id}
              >
                {batch.id.slice(0, 8)}
              </button>
            ))}
          </div>
        </div>

        <MerkleRows
          empty={!batches.length}
          isLoading={isLoading}
          title={t("admin.merkle.latestBatches")}
        >
          {batches.slice(0, 5).map((batch) => (
            <div key={batch.id} className="border-b border-slate-800 p-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate font-mono text-xs text-slate-300">{batch.id}</div>
                <StatusPill status={batch.status} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px] text-slate-500">
                <span className="truncate">{t("admin.rows.root")} {batch.merkle_root}</span>
                <span className="text-right tabular-nums text-slate-300">{formatInteger(batch.total_amount_raw, locale)}</span>
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
            <div key={proof.id} className="border-b border-slate-800 p-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate font-mono text-xs text-slate-300">{proof.reward_ledger_id}</div>
                <StatusPill status={proof.claim_status} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px] text-slate-500">
                <span className="truncate">{proof.beneficiary_wallet}</span>
                <span className="text-right tabular-nums text-slate-300">{formatInteger(proof.amount_raw, locale)}</span>
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
    <div className="admin-panel-quiet rounded-[12px] p-4">
      <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-slate-500">{title}</div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
      ) : empty ? (
        <EmptyRows />
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-slate-800 bg-slate-950/70">{children}</div>
      )}
    </div>
  );
}
