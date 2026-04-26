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
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/55">{t("admin.controls.title")}</h2>
        <button
          type="button"
          onClick={onReload}
          disabled={isControlsLoading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs uppercase tracking-widest text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isControlsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {t("common.retry")}
        </button>
      </div>

      {controlsError ? (
        <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/65">
          {controlsError}
        </div>
      ) : null}

      {writesDisabled ? (
        <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100/80">
          {t("admin.writeDisabled")}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {controlKeys.map((key) => {
          const control = controlMap[key];
          const details = controlDetails[key];
          const enabled = !!control?.enabled;
          const isUpdating = updatingControl === key;
          const isBusy = writesDisabled || isControlsLoading || isAnyControlUpdating;

          return (
            <div key={key} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white/90">{t(details.labelKey)}</div>
                  <div className="mt-1 text-xs text-white/40">{t(details.detailKey)}</div>
                </div>
                <span
                  className={`shrink-0 rounded-md border px-2 py-1 text-[10px] uppercase tracking-widest ${
                    enabled
                      ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
                      : "border-[#DBFF00]/25 bg-[#DBFF00]/10 text-[#DBFF00]"
                  }`}
                >
                  {isControlsLoading ? t("common.status.loading") : enabled ? t("common.enabled") : t("common.off")}
                </span>
              </div>

              <div className="mt-4 grid gap-2 text-xs text-white/45 sm:grid-cols-2">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.controls.key")}</div>
                  <div className="mt-1 truncate font-mono text-white/60">{key}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.controls.updated")}</div>
                  <div className="mt-1 truncate tabular-nums text-white/60">
                    {control?.updated_at ? formatDate(control.updated_at, locale) : t("common.loading")}
                  </div>
                </div>
              </div>

              <label className="mt-4 block">
                <span className="text-[10px] uppercase tracking-widest text-white/30">{t("admin.controls.reason")}</span>
                <textarea
                  value={controlDrafts[key]}
                  onChange={(event) => onDraftChange(key, event.target.value)}
                  disabled={isBusy}
                  rows={3}
                  className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-[#DBFF00]/40 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder={t("admin.controls.reasonPlaceholder")}
                />
              </label>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => onUpdate(key, !enabled)}
                  disabled={isBusy}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    enabled
                      ? "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08] hover:text-white"
                      : "border-amber-300/20 bg-amber-300/10 text-amber-100 hover:bg-amber-300 hover:text-black"
                  }`}
                >
                  {isUpdating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : enabled ? (
                    <ToggleRight className="w-4 h-4" />
                  ) : (
                    <ToggleLeft className="w-4 h-4" />
                  )}
                  {enabled ? t("common.disable") : t("common.enable")}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate(key, enabled)}
                  disabled={isBusy}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs uppercase tracking-widest text-white/75 transition-colors hover:bg-[#DBFF00] hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
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
