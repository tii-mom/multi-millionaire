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
    <section className="rounded-lg border border-slate-800 bg-slate-950/75 p-4 shadow-lg shadow-black/20 sm:p-5">
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
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-medium uppercase tracking-widest text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("common.refresh")}
          </button>
          <button
            type="button"
            onClick={onCreateDraft}
            disabled={draftDisabled || isLoading}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-3 text-xs font-semibold uppercase tracking-widest text-emerald-200 transition-colors hover:bg-emerald-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("admin.merkle.createDraft")}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/85">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/55 p-4 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">{t("admin.merkle.chainId")}</span>
              <input
                value={chainId}
                onChange={(event) => onChainIdChange(event.target.value)}
                disabled={draftDisabled}
                className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 font-mono text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="ton-mainnet"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">{t("admin.merkle.tokenAddress")}</span>
              <input
                value={tokenAddress}
                onChange={(event) => onTokenAddressChange(event.target.value)}
                disabled={draftDisabled}
                className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 font-mono text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-50"
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
    <div className="rounded-lg border border-slate-800 bg-slate-900/55 p-4">
      <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-slate-500">{title}</div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
      ) : empty ? (
        <EmptyRows />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70">{children}</div>
      )}
    </div>
  );
}
