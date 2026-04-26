import { useI18n } from "@/src/lib/i18n";

export function EmptyRows() {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-10 text-center text-xs uppercase tracking-widest text-white/35">
      {t("common.noRows")}
    </div>
  );
}
