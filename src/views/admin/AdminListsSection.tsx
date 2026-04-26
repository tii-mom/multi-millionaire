import { AlertTriangle, Gift, Loader2, Users, Waves } from "lucide-react";
import { useI18n } from "@/src/lib/i18n";
import { AdminListRows } from "./AdminListRows";
import type { AdminLists, ListKey } from "./types";

const listTabs = [
  { key: "waves" as const, labelKey: "admin.lists.waves", icon: Waves },
  { key: "risk" as const, labelKey: "admin.lists.risk", icon: AlertTriangle },
  { key: "rewards" as const, labelKey: "admin.lists.rewards", icon: Gift },
  { key: "squads" as const, labelKey: "admin.lists.squads", icon: Users },
];

type AdminListsSectionProps = {
  activeList: ListKey;
  isListLoading: boolean;
  listError: string | null;
  lists: AdminLists;
  onActiveListChange: (key: ListKey) => void;
};

export function AdminListsSection({
  activeList,
  isListLoading,
  listError,
  lists,
  onActiveListChange,
}: AdminListsSectionProps) {
  const { t } = useI18n();

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/75 p-4 shadow-lg shadow-black/20 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{t("admin.lists.title")}</h2>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950/80 p-1 sm:flex">
          {listTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeList === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onActiveListChange(tab.key)}
                className={`inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-xs font-medium uppercase tracking-widest transition-colors ${
                  isActive
                    ? "bg-emerald-400/15 text-emerald-200"
                    : "text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {listError ? (
          <div className="mb-3 rounded-lg border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/85">
            {listError}
          </div>
        ) : null}

        {isListLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 py-12 text-xs font-medium uppercase tracking-widest text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <AdminListRows activeList={activeList} lists={lists} />
        )}
      </div>
    </section>
  );
}
