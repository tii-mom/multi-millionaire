import { CalendarCheck2, Flame, Loader2, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { formatNumber, type useI18n } from "@/src/lib/i18n";
import type { DepositStreakView } from "@/src/lib/types";

type DepositStreakPanelProps = {
  locale: string;
  selectedTargetValue: number;
  streak: DepositStreakView | null;
  loading: boolean;
  saving: boolean;
  onSaveGoal: () => void;
  t: ReturnType<typeof useI18n>["t"];
};

const USD_SCALE = 1_000_000_000n;
const TOKEN_SCALE = 1_000_000_000n;

function scaledToNumber(value: string | null | undefined, scale = USD_SCALE) {
  if (!value) return 0;
  try {
    return Number(BigInt(value)) / Number(scale);
  } catch {
    return 0;
  }
}

function ceilDiv(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - 1n) / denominator;
}

function requiredRawForTarget(targetUsd: number, latestPriceRaw: string | null | undefined) {
  if (!latestPriceRaw) return null;
  try {
    const price = BigInt(latestPriceRaw);
    if (price <= 0n) return null;
    const dailyUsd9 = (BigInt(Math.round(targetUsd)) * USD_SCALE) / 100n;
    return ceilDiv(dailyUsd9 * TOKEN_SCALE, price).toString();
  } catch {
    return null;
  }
}

function formatWindow(value: string | null | undefined, locale: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function DepositStreakPanel({
  locale,
  selectedTargetValue,
  streak,
  loading,
  saving,
  onSaveGoal,
  t,
}: DepositStreakPanelProps) {
  const [range, setRange] = useState<"week" | "month">("week");
  const [checkMessage, setCheckMessage] = useState("");
  const goal = streak?.goal || null;
  const visibleCount = range === "week" ? 7 : 30;
  const days = useMemo(() => {
    const realDays = streak?.days || [];
    return Array.from({ length: visibleCount }, (_, index) => realDays[index] || null);
  }, [streak?.days, visibleCount]);
  const targetUsd = goal ? scaledToNumber(goal.target_usd9) : selectedTargetValue;
  const dailyUsd = targetUsd / 100;
  const todayRequiredRaw = goal
    ? streak?.required_today_raw || null
    : requiredRawForTarget(selectedTargetValue, streak?.latest_price_raw);
  const todayRequired72h = scaledToNumber(todayRequiredRaw, TOKEN_SCALE);
  const latestPrice = scaledToNumber(streak?.latest_price_raw);
  const poolAllocated = scaledToNumber(streak?.pool.allocated_raw, TOKEN_SCALE);
  const poolTotal = scaledToNumber(streak?.pool.total_raw, TOKEN_SCALE);
  const consecutiveDays = streak?.current_consecutive_days || 0;
  const monthlyProgressDays = streak?.monthly_progress_days || consecutiveDays;
  const claimedWeeks = streak?.claimed_week_rewards || 0;
  const nextWeekIndex = streak?.next_week_reward_index || null;
  const weeklyRewardCap = streak?.weekly_reward_cap || 4;
  const nextWeekDaysRemaining = streak?.next_week_reward_days_remaining ?? null;
  const nextWeekProgress = nextWeekIndex ? 7 - (nextWeekDaysRemaining ?? 7) : 7;
  const currentDay = streak?.days.find((day) => day.is_current) || null;
  const missedRequiredUsd = scaledToNumber(streak?.last_missed_required_usd9);
  const missedDepositedUsd = scaledToNumber(streak?.last_missed_deposited_usd9);
  const blockMessage = streak?.blocked_reward_reason
    ? t(`home.streak.blocked.${streak.blocked_reward_reason}`)
    : "";
  const canSave = !saving && (!goal || !goal.started_at);

  const handleCheckDay = (day: DepositStreakView["days"][number] | null, index: number) => {
    if (!goal) {
      setCheckMessage(t("home.streak.checkSaveFirst"));
      return;
    }
    if (!streak?.latest_price_raw) {
      setCheckMessage(t("home.streak.priceUnavailable"));
      return;
    }

    const requiredUsd9 = BigInt(day?.required_usd9 || streak.daily_target_usd9 || "0");
    const depositedUsd9 = BigInt(day?.deposited_usd9 || "0");
    if (day?.completed || depositedUsd9 >= requiredUsd9) {
      setCheckMessage(t("home.streak.checkSuccess", { day: index + 1 }));
      return;
    }

    const missingUsd9 = requiredUsd9 > depositedUsd9 ? requiredUsd9 - depositedUsd9 : 0n;
    const priceRaw = BigInt(streak.latest_price_raw);
    const missingRaw = priceRaw > 0n ? ceilDiv(missingUsd9 * TOKEN_SCALE, priceRaw) : 0n;
    setCheckMessage(t("home.streak.checkNeed", {
      day: index + 1,
      usd: formatNumber(Number(missingUsd9) / Number(USD_SCALE), locale, { maximumFractionDigits: 2 }),
      amount: formatNumber(Number(missingRaw) / Number(TOKEN_SCALE), locale, { maximumFractionDigits: 0 }),
    }));
  };

  return (
    <section className="financial-panel relative overflow-hidden rounded-[16px] p-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d7b46a]/35 to-transparent" />
      <div className="relative z-10">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-white/[0.62]">
            <Flame className="h-4 w-4 text-[#d7b46a]" />
            <span className="ui-label">{t("home.streak.title")}</span>
          </div>
          <div className="flex shrink-0 rounded-[10px] border border-white/[0.08] bg-black/25 p-1">
            {(["week", "month"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRange(item)}
                className={`focus-ring rounded-[7px] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest transition-colors ${
                  range === item ? "bg-[#d7b46a] text-black" : "text-white/42 hover:text-white/72"
                }`}
              >
                {t(`home.streak.${item}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_0.78fr] gap-3">
          <div className="metric-card rounded-[12px] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="ui-label">{t("home.streak.todayRequired")}</div>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/34" />}
            </div>
            <div className="mt-2 flex items-baseline gap-2 font-mono text-[1.55rem] font-semibold leading-none tracking-tight text-white">
              <span className="tabular-nums">
                {todayRequiredRaw ? formatNumber(todayRequired72h, locale, { maximumFractionDigits: 0 }) : "--"}
              </span>
              <span className="text-xs font-bold tracking-widest text-[#d7b46a]">{todayRequiredRaw ? "72H" : ""}</span>
            </div>
            <div className="mt-2 text-[10px] leading-relaxed text-white/[0.42]">
              {t("home.streak.dailyRule", {
                usd: formatNumber(dailyUsd, locale, { maximumFractionDigits: 0 }),
                price: latestPrice > 0 ? `$${formatNumber(latestPrice, locale, { maximumFractionDigits: 4 })}` : "--",
              })}
            </div>
          </div>

          <div className="grid gap-2">
            <div className="metric-card rounded-[12px] px-3 py-3">
              <div className="ui-label text-[9px]">{t("home.streak.cycle")}</div>
              <div className="mt-1 font-mono text-sm font-semibold text-white/85 tabular-nums">
                {goal?.started_at ? `${consecutiveDays}/30` : t("home.streak.notStartedShort")}
              </div>
              {streak?.streak_broken && (
                <div className="mt-1 text-[9px] font-semibold text-amber-100/80">{t("home.streak.broken")}</div>
              )}
            </div>
            <div className="metric-card rounded-[12px] px-3 py-3">
              <div className="ui-label text-[9px]">{t("home.streak.reward")}</div>
              <div className="mt-1 font-mono text-sm font-semibold text-[#d7b46a] tabular-nums">
                {range === "week" ? "1,000" : "10,000"} 72H
              </div>
            </div>
          </div>
        </div>

        <div className={`mt-4 grid gap-1.5 ${range === "week" ? "grid-cols-7" : "grid-cols-10"}`}>
          {days.map((day, index) => {
            const completed = !!day?.completed;
            const current = !!day?.is_current || (!goal?.started_at && index === 0);
            return (
              <button
                key={index}
                type="button"
                onClick={() => handleCheckDay(day, index)}
                className={`relative h-8 rounded-[8px] border text-center font-mono text-[9px] leading-8 tabular-nums ${
                  completed
                    ? "border-[#d7b46a]/55 bg-[#d7b46a]/18 text-[#f0ce83] shadow-[0_0_18px_rgba(215,180,106,0.08)]"
                    : current
                      ? "border-[#d7b46a]/38 bg-[#d7b46a]/8 text-white/82"
                      : "border-white/[0.065] bg-black/24 text-white/28"
                }`}
              >
                {index + 1}
                {completed && <CalendarCheck2 className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-[#05080a] text-[#d7b46a]" />}
              </button>
            );
          })}
        </div>

        <div className="mt-3 min-h-[34px] rounded-[10px] border border-[#d7b46a]/14 bg-[#d7b46a]/[0.045] px-3 py-2 text-[10px] leading-relaxed text-white/62">
          {checkMessage || t("home.streak.checkHint")}
        </div>

        {currentDay && (
          <div className="mt-2 rounded-[10px] border border-white/[0.06] bg-black/18 px-3 py-2 text-[10px] leading-relaxed text-white/50">
            {t("home.streak.currentWindow", {
              start: formatWindow(currentDay.start_at, locale),
              end: formatWindow(currentDay.end_at, locale),
            })}
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-[10px] border border-white/[0.06] bg-black/18 px-2 py-2">
            <div className="ui-label text-[8px]">{t("home.streak.consecutive")}</div>
            <div className="mt-1 font-mono text-xs font-semibold text-white/82 tabular-nums">{consecutiveDays}</div>
          </div>
          <div className="rounded-[10px] border border-white/[0.06] bg-black/18 px-2 py-2">
            <div className="ui-label text-[8px]">{t("home.streak.weekRewards")}</div>
            <div className="mt-1 font-mono text-xs font-semibold text-white/82 tabular-nums">{claimedWeeks}/{weeklyRewardCap}</div>
          </div>
          <div className="rounded-[10px] border border-white/[0.06] bg-black/18 px-2 py-2">
            <div className="ui-label text-[8px]">{t("home.streak.nextWeek")}</div>
            <div className="mt-1 font-mono text-xs font-semibold text-white/82 tabular-nums">
              {nextWeekIndex ? `${nextWeekProgress}/7` : t("home.streak.done")}
            </div>
          </div>
        </div>

        <div className="mt-2 rounded-[10px] border border-white/[0.06] bg-black/18 px-3 py-2 text-[10px] leading-relaxed text-white/50">
          {t("home.streak.monthProgress", { days: monthlyProgressDays })}
          {nextWeekIndex && nextWeekDaysRemaining != null ? ` · ${t("home.streak.nextWeekRemaining", { days: nextWeekDaysRemaining })}` : ""}
        </div>

        {streak?.streak_broken && streak.last_missed_day_index != null && (
          <div className="mt-2 rounded-[10px] border border-amber-200/14 bg-amber-200/[0.06] px-3 py-2 text-[10px] leading-relaxed text-amber-50/75">
            {t("home.streak.missedDetail", {
              day: streak.last_missed_day_index + 1,
              start: formatWindow(streak.last_missed_day_start_at, locale),
              required: formatNumber(missedRequiredUsd, locale, { maximumFractionDigits: 2 }),
              deposited: formatNumber(missedDepositedUsd, locale, { maximumFractionDigits: 2 }),
            })}
          </div>
        )}

        {blockMessage && (
          <div className="mt-2 rounded-[10px] border border-rose-300/16 bg-rose-300/[0.07] px-3 py-2 text-[10px] leading-relaxed text-rose-50/80">
            {blockMessage}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 rounded-[12px] border border-white/[0.07] bg-black/20 px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-white/78">
              <Trophy className="h-3.5 w-3.5 text-[#d7b46a]" />
              {goal ? t("home.streak.goalLocked", { target: formatNumber(targetUsd, locale, { maximumFractionDigits: 0 }) }) : t("home.streak.goalPending", { target: formatNumber(selectedTargetValue, locale, { maximumFractionDigits: 0 }) })}
            </div>
            <div className="mt-1 truncate font-mono text-[9px] uppercase tracking-widest text-white/32">
              {t("home.streak.pool", {
                used: formatNumber(poolAllocated, locale, { maximumFractionDigits: 0 }),
                total: formatNumber(poolTotal || 100_000_000, locale, { maximumFractionDigits: 0 }),
              })}
            </div>
          </div>
          {goal ? (
            <button
              type="button"
              onClick={() => handleCheckDay(days[Math.max(0, Math.min((streak?.current_day_index ?? 0), days.length - 1))] || null, streak?.current_day_index ?? 0)}
              disabled={!todayRequiredRaw}
              className="depth-button focus-ring shrink-0 rounded-[10px] border border-[#d7b46a]/25 bg-[#d7b46a]/10 px-3 py-2 text-[10px] font-bold text-[#d7b46a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("home.streak.checkProgress")}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSaveGoal}
              disabled={!canSave}
              className="depth-button focus-ring shrink-0 rounded-[10px] bg-[#d7b46a] px-3 py-2 text-[10px] font-bold text-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("home.streak.saveGoal")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
