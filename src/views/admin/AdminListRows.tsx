import { useI18n } from "@/src/lib/i18n";
import { EmptyRows } from "./EmptyRows";
import { formatDate, formatInteger } from "./format";
import { StatusPill } from "./StatusPill";
import type { AdminLists, ListKey } from "./types";

export function AdminListRows({ activeList, lists }: { activeList: ListKey; lists: AdminLists }) {
  const { locale, t } = useI18n();

  if (activeList === "waves") {
    if (lists.waves.length === 0) return <EmptyRows />;

    return (
      <div className="flex flex-col gap-2">
        {lists.waves.map((wave) => (
          <div key={wave.wave_id} className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white/90">{wave.name}</div>
                <div className="mt-1 text-[11px] uppercase tracking-widest text-white/40">#{wave.wave_id} / {wave.code}</div>
              </div>
              <StatusPill status={wave.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/55 sm:grid-cols-4">
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
      <div className="flex flex-col gap-2">
        {lists.risk.map((flag) => (
          <div key={flag.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white/90">{flag.flag_type.replace(/_/g, " ")}</div>
                <div className="mt-1 truncate text-[11px] uppercase tracking-widest text-white/40">
                  {flag.entity_type} / {flag.entity_id}
                </div>
              </div>
              <StatusPill status={flag.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/50">
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 uppercase tracking-widest">{flag.severity}</span>
              <span className="tabular-nums">{formatDate(flag.created_at, locale)}</span>
              {flag.note ? <span className="min-w-0 truncate text-white/40">{flag.note}</span> : null}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activeList === "rewards") {
    if (lists.rewards.length === 0) return <EmptyRows />;

    return (
      <div className="flex flex-col gap-2">
        {lists.rewards.map((reward) => (
          <div key={reward.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white/90">{reward.reward_type.replace(/_/g, " ")}</div>
                <div className="mt-1 truncate text-[11px] uppercase tracking-widest text-white/40">
                  {reward.beneficiary_email || reward.beneficiary_user_id}
                </div>
              </div>
              <StatusPill status={reward.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/55 sm:grid-cols-4">
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
    <div className="flex flex-col gap-2">
      {lists.squads.map((squad) => (
        <div key={squad.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white/90">{squad.name}</div>
              <div className="mt-1 truncate text-[11px] uppercase tracking-widest text-white/40">
                {t("admin.rows.captain")} / {squad.captain_email || squad.captain_user_id}
              </div>
            </div>
            <StatusPill status={squad.status} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/55 sm:grid-cols-4">
            <Metric label={t("admin.rows.members")} value={squad.member_count} />
            <Metric label={t("admin.rows.activated")} value={squad.activated_member_count} />
            <Metric label={t("admin.rows.locked")} value={formatInteger(squad.total_locked, locale)} />
            <Metric label={t("admin.rows.wave")} value={`#${squad.wave_id}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-white/30">{label}</div>
      <div className="mt-1 tabular-nums">{value}</div>
    </div>
  );
}
