import { Loader2, RefreshCw, Save, ToggleLeft, ToggleRight } from "lucide-react";
import { useI18n } from "@/src/lib/i18n";
import type { AppControl, AppControlKey } from "@/src/lib/types";
import { formatDate } from "./format";
import type { ControlDrafts } from "./types";

export const controlKeys: AppControlKey[] = [
  "pause_deposits",
  "pause_reward_claims",
  "pause_referral_rewards",
  "maintenance_banner",
];

export const controlDetails: Record<AppControlKey, { labelKey: string; detailKey: string }> = {
  pause_deposits: {
    labelKey: "admin.controls.pauseDeposits",
    detailKey: "admin.controls.pauseDepositsDetail",
  },
  pause_reward_claims: {
    labelKey: "admin.controls.pauseRewardClaims",
    detailKey: "admin.controls.pauseRewardClaimsDetail",
  },
  pause_referral_rewards: {
    labelKey: "admin.controls.pauseReferralRewards",
    detailKey: "admin.controls.pauseReferralRewardsDetail",
  },
  maintenance_banner: {
    labelKey: "admin.controls.maintenanceBanner",
    detailKey: "admin.controls.maintenanceBannerDetail",
  },
};

type AdminControlsSectionProps = {
  controls: AppControl[];
  controlsError: string | null;
  controlDrafts: ControlDrafts;
  hasAdminToken: boolean;
  isControlsLoading: boolean;
  onDraftChange: (key: AppControlKey, value: string) => void;
  onReload: () => void;
  onUpdate: (key: AppControlKey, enabled: boolean) => void;
  updatingControl: AppControlKey | null;
};

export function AdminControlsSection({
  controls,
  controlsError,
  controlDrafts,
  hasAdminToken,
  isControlsLoading,
  onDraftChange,
  onReload,
  onUpdate,
  updatingControl,
}: AdminControlsSectionProps) {
  const { locale, t } = useI18n();
  const controlMap = controls.reduce<Partial<Record<AppControlKey, AppControl>>>((acc, control) => {
    acc[control.key] = control;
    return acc;
  }, {});
  const isAnyControlUpdating = updatingControl !== null;
  const writesDisabled = !hasAdminToken;

  return (
    <section className="admin-panel rounded-[14px] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{t("admin.controls.title")}</h2>
        <button
          type="button"
          onClick={onReload}
          disabled={isControlsLoading}
          className="admin-action inline-flex h-9 items-center justify-center gap-2 rounded-[10px] px-3 text-xs font-medium uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isControlsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("common.retry")}
        </button>
      </div>

      {controlsError ? (
        <div className="mt-3 rounded-[12px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/85">
          {controlsError}
        </div>
      ) : null}

      {writesDisabled ? (
        <div className="mt-3 rounded-[12px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100/85">
          {t("admin.writeDisabled")}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {controlKeys.map((key) => {
          const control = controlMap[key];
          const details = controlDetails[key];
          const enabled = !!control?.enabled;
          const isUpdating = updatingControl === key;
          const isBusy = writesDisabled || isControlsLoading || isAnyControlUpdating;

          return (
            <div key={key} className="admin-panel-quiet rounded-[12px] p-4">
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-100">{t(details.labelKey)}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{t(details.detailKey)}</div>
                </div>
                <span
                  className={`inline-flex h-6 shrink-0 items-center rounded-md border px-2 font-mono text-[10px] uppercase tracking-wide ${
                    enabled
                      ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
                      : "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                  }`}
                >
                  {isControlsLoading ? t("common.status.loading") : enabled ? t("common.enabled") : t("common.off")}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-widest text-slate-600">{t("admin.controls.key")}</div>
                  <div className="mt-1 truncate font-mono text-slate-300">{key}</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-widest text-slate-600">{t("admin.controls.updated")}</div>
                  <div className="mt-1 truncate font-mono tabular-nums text-slate-300">
                    {control?.updated_at ? formatDate(control.updated_at, locale) : t("common.loading")}
                  </div>
                </div>
              </div>

              <label className="mt-4 block">
                <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">{t("admin.controls.reason")}</span>
                <textarea
                  value={controlDrafts[key]}
                  onChange={(event) => onDraftChange(key, event.target.value)}
                  disabled={isBusy}
                  rows={3}
                  className="mt-2 w-full resize-none rounded-[10px] border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-[#d7b46a]/50 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder={t("admin.controls.reasonPlaceholder")}
                />
              </label>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => onUpdate(key, !enabled)}
                  disabled={isBusy}
                  className={`inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border px-3 text-xs font-semibold uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    enabled
                      ? "admin-action text-slate-300 hover:text-[#f5deb3]"
                      : "border-amber-400/25 bg-amber-400/10 text-amber-100 hover:bg-amber-300 hover:text-slate-950"
                  }`}
                >
                  {isUpdating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : enabled ? (
                    <ToggleRight className="h-4 w-4" />
                  ) : (
                    <ToggleLeft className="h-4 w-4" />
                  )}
                  {enabled ? t("common.disable") : t("common.enable")}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate(key, enabled)}
                  disabled={isBusy}
                  className="admin-primary inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-[10px] px-3 text-xs font-semibold uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t("common.saveReason")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
