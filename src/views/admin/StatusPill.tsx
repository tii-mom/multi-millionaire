import { useI18n } from "@/src/lib/i18n";

export function StatusPill({ status }: { status: string }) {
  const { t } = useI18n();
  const normalized = status.toLowerCase();
  const statusKey = `admin.status.${normalized}`;
  const statusLabel = t(statusKey);
  const label = statusLabel === statusKey ? t("admin.status.unknown") : statusLabel;
  const tone = normalized === "live" || normalized === "approved" || normalized === "open" || normalized === "claimed"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
    : normalized === "pending" || normalized === "draft" || normalized === "queued"
      ? "border-sky-400/25 bg-sky-400/10 text-sky-200"
      : normalized === "rejected" || normalized === "failed" || normalized === "closed"
        ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
        : "border-slate-700 bg-slate-800/70 text-slate-300";

  return (
    <span className={`inline-flex h-6 shrink-0 items-center rounded-md border px-2 font-mono text-[10px] uppercase tracking-wide ${tone}`}>
      {label}
    </span>
  );
}
