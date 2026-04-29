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
  listPage: { page: number; page_size: number; total: number; page_count: number; search: string } | null;
  listError: string | null;
  lists: AdminLists;
  onActiveListChange: (key: ListKey) => void;
  onPageChange: (page: number) => void;
  onQueryChange: (query: string) => void;
  onRiskStatusChange: (flagId: string, status: string, note?: string | null) => void;
  page: number;
  query: string;
  updatingRiskFlag: string | null;
};

export function AdminListsSection({
  activeList,
  isListLoading,
  listPage,
  listError,
  lists,
  onActiveListChange,
  onPageChange,
  onQueryChange,
  onRiskStatusChange,
  page,
  query,
  updatingRiskFlag,
}: AdminListsSectionProps) {
  const { t } = useI18n();
  const pageCount = listPage?.page_count || 1;
  const total = listPage?.total ?? lists[activeList].length;
  const currentPage = Math.min(listPage?.page || page, pageCount);

  return (
    <section className="admin-panel rounded-[14px] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{t("admin.lists.title")}</h2>
        <div className="grid grid-cols-2 gap-2 rounded-[12px] border border-slate-800 bg-slate-950/80 p-1 sm:flex">
          {listTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeList === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onActiveListChange(tab.key)}
                className={`inline-flex h-8 items-center justify-center gap-2 rounded-[9px] px-3 text-xs font-medium uppercase tracking-widest transition-colors ${
                  isActive
                    ? "bg-[#d7b46a]/15 text-[#f5deb3]"
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
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("admin.lists.searchPlaceholder")}
            className="h-10 rounded-[10px] border border-slate-800 bg-slate-950/70 px-3 font-mono text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-[#d7b46a]/50"
          />
          <div className="flex items-center justify-between gap-2 rounded-[10px] border border-slate-800 bg-slate-950/70 px-2">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="h-8 rounded-[8px] px-3 text-xs font-semibold uppercase tracking-widest text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {t("admin.lists.prev")}
            </button>
            <span className="min-w-[88px] text-center font-mono text-[11px] text-slate-500">
              {currentPage}/{pageCount} · {total}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
              disabled={currentPage >= pageCount}
              className="h-8 rounded-[8px] px-3 text-xs font-semibold uppercase tracking-widest text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {t("admin.lists.next")}
            </button>
          </div>
        </div>

        {listError ? (
          <div className="mb-3 rounded-[12px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/85">
            {listError}
          </div>
        ) : null}

        {isListLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-[12px] border border-slate-800 bg-slate-950/70 py-12 text-xs font-medium uppercase tracking-widest text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <AdminListRows
            activeList={activeList}
            lists={lists}
            onRiskStatusChange={onRiskStatusChange}
            updatingRiskFlag={updatingRiskFlag}
          />
        )}
      </div>
    </section>
  );
}
