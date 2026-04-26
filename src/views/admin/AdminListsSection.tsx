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
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/55">{t("admin.lists.title")}</h2>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {listTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeList === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onActiveListChange(tab.key)}
                className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs uppercase tracking-widest transition-colors ${
                  isActive
                    ? "border-[#DBFF00]/30 bg-[#DBFF00]/10 text-[#DBFF00]"
                    : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {listError ? (
          <div className="mb-3 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/65">
            {listError}
          </div>
        ) : null}

        {isListLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs uppercase tracking-widest text-white/40">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <AdminListRows activeList={activeList} lists={lists} />
        )}
      </div>
    </section>
  );
}
