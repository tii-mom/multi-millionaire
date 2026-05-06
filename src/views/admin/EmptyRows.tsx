import { useI18n } from "@/src/lib/i18n";

export function EmptyRows() {
  const { t } = useI18n();
  return (
    <div className="rounded-[12px] border border-dashed border-slate-700 bg-slate-950/60 px-4 py-8 text-center text-xs font-medium uppercase tracking-widest text-slate-500">
      {t("common.noRows")}
    </div>
  );
}
