import { useMemo } from "react";
import { useI18n } from "@/src/lib/i18n";
import { EmptyRows } from "./EmptyRows";
import { formatDate, formatInteger } from "./format";
import { StatusPill } from "./StatusPill";
import type { AdminLists, ListKey } from "./types";

export function AdminListRows({
  activeList,
  lists,
  onRiskStatusChange,
  updatingRiskFlag,
}: {
  activeList: ListKey;
  lists: AdminLists;
  onRiskStatusChange: (flagId: string, status: string, note?: string | null) => void;
  updatingRiskFlag: string | null;
}) {
  const { locale, t } = useI18n();
  const rankedSquads = useMemo(() => (
    [...lists.squads]
      .sort((left, right) => {
        const rankDiff = (left.rank || Number.MAX_SAFE_INTEGER) - (right.rank || Number.MAX_SAFE_INTEGER);
        if (rankDiff !== 0) return rankDiff;

        const activatedDiff = right.activated_member_count - left.activated_member_count;
        if (activatedDiff !== 0) return activatedDiff;

        const lockedDiff = compareIntegerStringsDesc(left.total_locked, right.total_locked);
        if (lockedDiff !== 0) return lockedDiff;

        return (Date.parse(left.created_at) || 0) - (Date.parse(right.created_at) || 0);
      })
      .map((squad, index) => ({ ...squad, displayRank: squad.rank || index + 1 }))
  ), [lists.squads]);
  const translateEnum = (prefix: string, value: string) => {
    const key = `${prefix}.${value.toLowerCase()}`;
    const translated = t(key);
    return translated === key ? t("admin.enum.unknown") : translated;
  };

  if (activeList === "waves") {
    if (lists.waves.length === 0) return <EmptyRows />;

    return (
      <div className="overflow-hidden rounded-[12px] border border-slate-800 bg-slate-950/70">
        {lists.waves.map((wave) => (
          <div key={wave.wave_id} className="border-b border-slate-800 p-4 last:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-100">{wave.name}</div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-wide text-slate-500">#{wave.wave_id} / {wave.code}</div>
              </div>
              <StatusPill status={wave.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400 sm:grid-cols-4">
              <Metric label={t("admin.rows.starts")} value={formatDate(wave.start_time, locale)} />
              <Metric label={t("admin.rows.ends")} value={formatDate(wave.end_time, locale)} />
              <Metric label={t("admin.rows.minLock")} value={formatInteger(wave.min_lock_amount, locale)} />
              <Metric label={t("admin.rows.budget")} value={formatInteger(wave.reward_budget, locale)} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activeList === "risk") {
    if (lists.risk.length === 0) return <EmptyRows />;

    return (
      <div className="overflow-hidden rounded-[12px] border border-slate-800 bg-slate-950/70">
        {lists.risk.map((flag) => (
          <div key={flag.id} className="border-b border-slate-800 p-4 last:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-100">{translateEnum("admin.risk", flag.flag_type)}</div>
                <div className="mt-1 truncate font-mono text-[11px] uppercase tracking-wide text-slate-500">
                  {flag.entity_type} / {flag.entity_id}
                </div>
              </div>
              <StatusPill status={flag.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="rounded-[8px] border border-amber-400/20 bg-amber-400/10 px-2 py-1 font-mono uppercase tracking-wide text-amber-200">
                {translateEnum("admin.severity", flag.severity)}
              </span>
              <span className="font-mono tabular-nums">{formatDate(flag.created_at, locale)}</span>
              {flag.note ? <span className="min-w-0 truncate text-slate-500">{flag.note}</span> : null}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                ["reviewing", t("admin.risk.markReviewing")],
                ["resolved", t("admin.risk.markResolved")],
                ["dismissed", t("admin.risk.markDismissed")],
              ].map(([status, label]) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => onRiskStatusChange(flag.id, status)}
                  disabled={updatingRiskFlag === flag.id || flag.status === status}
                  className="admin-action h-8 rounded-[9px] px-3 text-[10px] font-semibold uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {updatingRiskFlag === flag.id ? t("common.working") : label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activeList === "rewards") {
    if (lists.rewards.length === 0) return <EmptyRows />;

    return (
      <div className="overflow-hidden rounded-[12px] border border-slate-800 bg-slate-950/70">
        {lists.rewards.map((reward) => (
          <div key={reward.id} className="border-b border-slate-800 p-4 last:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-100">{translateEnum("rewards.type", reward.reward_type)}</div>
                <div className="mt-1 truncate font-mono text-[11px] uppercase tracking-wide text-slate-500">
                  {reward.beneficiary_email || reward.beneficiary_user_id}
                </div>
              </div>
              <StatusPill status={reward.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400 sm:grid-cols-4">
              <Metric label={t("admin.rows.final")} value={formatInteger(reward.final_amount, locale)} />
              <Metric label={t("admin.rows.gross")} value={formatInteger(reward.gross_amount, locale)} />
              <Metric label={t("admin.rows.wave")} value={`#${reward.wave_id}`} />
              <Metric label={t("common.created")} value={formatDate(reward.created_at, locale)} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (lists.squads.length === 0) return <EmptyRows />;

  return (
    <div className="overflow-hidden rounded-[12px] border border-slate-800 bg-slate-950/70">
      {rankedSquads.map((squad) => (
        <div key={squad.id} className="border-b border-slate-800 p-4 last:border-b-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-100">{squad.name}</div>
              <div className="mt-1 truncate font-mono text-[11px] uppercase tracking-wide text-slate-500">
                {t("admin.rows.captain")} / {squad.captain_email || squad.captain_user_id}
              </div>
            </div>
            <StatusPill status={squad.status} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400 sm:grid-cols-5">
            <Metric label={t("admin.rows.rank")} value={`#${squad.displayRank}`} />
            <Metric label={t("admin.rows.members")} value={squad.member_count} />
            <Metric label={t("admin.rows.activated")} value={squad.activated_member_count} />
            <Metric label={t("admin.rows.locked")} value={formatInteger(squad.total_locked, locale)} />
            <Metric label={t("admin.rows.wave")} value={`#${squad.wave_id}`} />
          </div>
          <details className="mt-3 rounded-[10px] border border-slate-800 bg-slate-950/50 px-3 py-2">
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              {t("admin.rows.details")}
            </summary>
            <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
              <Metric label={t("admin.rows.inviteCode")} value={squad.invite_code || t("common.none")} />
              <Metric label={t("admin.rows.captain")} value={squad.captain_user_id} />
              <Metric label={t("common.created")} value={formatDate(squad.created_at, locale)} />
              <Metric label={t("admin.controls.updated")} value={formatDate(squad.updated_at, locale)} />
            </div>
          </details>
        </div>
      ))}
    </div>
  );
}

function compareIntegerStringsDesc(leftValue: string, rightValue: string) {
  const left = normalizeIntegerString(leftValue);
  const right = normalizeIntegerString(rightValue);
  if (left.length !== right.length) return right.length - left.length;
  return right.localeCompare(left);
}

function normalizeIntegerString(value: string) {
  const integer = value.split(".")[0].replace(/\D/g, "").replace(/^0+/, "");
  return integer || "0";
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-[10px] border border-slate-800 bg-slate-900/50 px-3 py-2">
      <div className="truncate text-[10px] font-medium uppercase tracking-widest text-slate-600">{label}</div>
      <div className="mt-1 truncate font-mono tabular-nums text-slate-300">{value}</div>
    </div>
  );
}
