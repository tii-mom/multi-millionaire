import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Plus, Share2, Sparkles, Target, Users } from "lucide-react";
import { motion } from "motion/react";
import { api } from "@/src/lib/api";
import { formatNumber, useI18n } from "@/src/lib/i18n";
import { readBackendAuthToken, readTonWalletSession } from "@/src/lib/tonSession";
import { rawTokenAmountToDisplayNumber } from "@/src/lib/tonTransactions";
import type { MySquadView, SquadLeaderboardRow } from "@/src/lib/types";

interface TeamProps {
  tokenPrice: number;
  myDeposit?: number;
  squadGoal: number;
  setSquadGoal?: (goal: number) => void;
}

function displayRaw72h(value: string | number | null | undefined, decimals = 9) {
  try {
    return rawTokenAmountToDisplayNumber(String(value ?? "0"), decimals);
  } catch {
    return 0;
  }
}

export default function Team({ tokenPrice, squadGoal, setSquadGoal }: TeamProps) {
  const { formatError, locale, t } = useI18n();
  const [goalInput, setGoalInput] = useState("");
  const [squadName, setSquadName] = useState("");
  const [waveId, setWaveId] = useState<number | null>(null);
  const [squads, setSquads] = useState<SquadLeaderboardRow[]>([]);
  const [mySquad, setMySquad] = useState<MySquadView | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState(9);

  const loadSquads = useCallback(async () => {
    try {
      const wave = await api.currentWave();
      if (!wave?.wave_id) {
        setWaveId(null);
        setSquads([]);
        return;
      }
      setWaveId(Number(wave.wave_id));
      const token = readBackendAuthToken();
      const [rows, mySquadView, bootstrap] = await Promise.all([
        api.listSquads(Number(wave.wave_id)),
        token ? api.mySquad(Number(wave.wave_id), token).catch(() => null) : Promise.resolve(null),
        api.bootstrap().catch(() => null),
      ]);
      setSquads(rows);
      setMySquad(mySquadView);
      const decimals = Number(bootstrap?.contracts?.token_decimals || 9);
      setTokenDecimals(Number.isFinite(decimals) && decimals >= 0 ? decimals : 9);
    } catch {
      setSquads([]);
      setMySquad(null);
    }
  }, []);

  useEffect(() => {
    loadSquads();
  }, [loadSquads]);

  const topSquad = squads[0] || null;
  const squadTotalLocked = useMemo(() => displayRaw72h(topSquad?.total_locked, tokenDecimals), [topSquad, tokenDecimals]);
  const squadMarketValue = squadTotalLocked * tokenPrice;
  const progressPercent = Math.min((squadMarketValue / squadGoal) * 100, 100);
  const inviteLink = mySquad
    ? `${window.location.origin}/?squad=${encodeURIComponent(mySquad.squad.invite_code || String(mySquad.squad.id))}`
    : "";

  const requireToken = () => {
    const walletSession = readTonWalletSession();
    if (!walletSession) {
      toast.error(t("team.signIn"));
      return null;
    }
    const token = readBackendAuthToken();
    if (!token) {
      toast.error(t("team.backendAuthPending"));
      return null;
    }
    return token;
  };

  const handleCreateSquad = async () => {
    const token = requireToken();
    const name = squadName.trim();
    if (!token || !waveId) return;
    if (!name) {
      toast.error(t("team.nameRequired"));
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createSquad(waveId, name, token);
      setSquadName("");
      toast.success(t("team.created"));
      await loadSquads();
    } catch (error) {
      toast.error(formatError(error, "team.createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyInvite = async () => {
    if (!mySquad || !inviteLink) return;
    try {
      await navigator.clipboard.writeText(`${mySquad.squad.name} ${inviteLink}`);
      toast.success(t("team.mine.inviteCopied"));
    } catch {
      toast.error(t("team.mine.inviteCopyFailed"));
    }
  };

  const shareInvite = async () => {
    if (!mySquad || !inviteLink) return;
    const text = t("team.mine.shareText", { name: mySquad.squad.name, link: inviteLink });
    if (navigator.share) {
      try {
        await navigator.share({ title: mySquad.squad.name, text, url: inviteLink });
        toast.success(t("share.shared"));
        return;
      } catch {
        // Fall through to clipboard copy when native share is cancelled or unavailable.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("team.mine.inviteCopied"));
    } catch {
      toast.error(t("team.mine.inviteCopyFailed"));
    }
  };

  return (
    <div className="tab-content-safe flex flex-col gap-4 px-6">
      <section className="financial-panel relative overflow-hidden rounded-[16px] p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d7b46a]/45 to-transparent" />

        <div className="relative z-10 mb-4 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2 text-white/[0.52]">
            <Users className="h-4 w-4 text-[#d7b46a]/80" />
            <span className="ui-label truncate">
              {topSquad ? topSquad.name : t("team.header.fallback")}
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-[#d7b46a]/25 bg-[#d7b46a]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#d7b46a]">
            <Sparkles className="h-3 w-3" />
            {topSquad ? t("team.rank.value", { rank: topSquad.rank }) : t("team.rank.none")}
          </div>
        </div>

        <div className="relative z-10">
          <div className="mb-1.5 mt-5 flex items-end justify-between">
            <div className="ui-label">
              {t("team.marketValue")}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-[5px] w-[5px]">
                <span className="relative inline-flex h-[5px] w-[5px] rounded-full bg-[#8fd9ad]" />
              </span>
              <span className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-[#8fd9ad]/75">
                {t("common.rate")}:
                <motion.span key={tokenPrice} initial={{ color: "#fff" }} animate={{ color: "#8fd9ad" }} className="font-mono font-bold tabular-nums">
                  ${formatNumber(tokenPrice, locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                </motion.span>
              </span>
            </div>
          </div>

          <motion.div
            key={squadMarketValue}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 1 }}
            className="mb-6 font-mono text-4xl font-semibold tracking-tight text-white tabular-nums"
          >
            ${formatNumber(squadMarketValue, locale, { maximumFractionDigits: 0 })}
          </motion.div>

          <div className="mb-5 flex items-center gap-2">
            <input
              type="number"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder={t("team.goal.placeholder")}
              className="min-w-0 flex-1 rounded-[10px] border border-white/10 bg-black/35 px-3.5 py-2.5 font-mono text-xs tabular-nums outline-none transition-colors placeholder:text-white/[0.24] focus:border-[#8fd9ad]/45 focus:bg-black/55"
            />
            <button
              type="button"
              onClick={() => {
                const val = Number(goalInput);
                if (val > 0) {
                  setSquadGoal?.(val);
                  setGoalInput("");
                  toast.success(t("team.goal.set", { value: formatNumber(val, locale) }));
                } else {
                  toast.error(t("team.goal.invalid"));
                }
              }}
              className="depth-button focus-ring rounded-[10px] border border-[#d7b46a]/30 bg-[#d7b46a]/10 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-[#e1c07b] hover:border-[#e1c07b]/60 hover:bg-[#d7b46a]/18"
            >
              {t("common.set")}
            </button>
          </div>

          <div>
            <div className="mb-2 flex items-end justify-between text-[10px] uppercase tracking-widest text-white/[0.52]">
              <span className="flex items-center gap-1.5 text-white/[0.72]">
                <Target className="h-3.5 w-3.5" />
                {t("common.goal")}: ${formatNumber(squadGoal, locale)}
              </span>
              <span className="font-semibold text-[#8fd9ad] tabular-nums">
                {formatNumber(progressPercent, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full border border-white/[0.06] bg-black/55 shadow-inner">
              <div
                className="absolute left-0 top-0 flex h-full items-center justify-end bg-gradient-to-r from-[#2f5f46] via-[#65b986] to-[#8fd9ad] transition-all duration-1000 ease-out"
                style={{ width: `${Math.max(progressPercent, topSquad ? 2 : 0)}%` }}
              >
                <div className="mr-0.5 h-1.5 w-1.5 rounded-full bg-white/90" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="financial-panel rounded-[14px] p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="ui-label">{t("team.mine.title")}</div>
          <p className="mt-1 text-[11px] leading-relaxed text-white/[0.48]">
            {mySquad ? t("team.mine.detail") : t("team.mine.empty")}
          </p>
          </div>
          <div className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-white/50">
            {mySquad?.rank ? t("team.rank.value", { rank: mySquad.rank }) : t("team.rank.none")}
          </div>
        </div>

        {mySquad ? (
          <div className="grid gap-3">
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="metric-card min-w-0 rounded-[12px] px-3 py-3">
                <div className="text-[9px] uppercase tracking-widest text-white/[0.36]">{t("team.squadColumn")}</div>
                <div className="mt-1.5 truncate text-base font-semibold text-white">{mySquad.squad.name}</div>
              </div>
              <div className="metric-card min-w-[104px] rounded-[12px] px-3 py-3 text-right">
                <div className="text-[9px] uppercase tracking-widest text-white/[0.36]">{t("team.mine.status")}</div>
                <div className="mt-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-[#8fd9ad]">{mySquad.membership.status}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="metric-card rounded-[12px] px-3 py-3">
                <div className="text-[9px] uppercase tracking-widest text-white/[0.36]">{t("team.activated", { count: mySquad.activated_member_count })}</div>
                <div className="mt-1.5 font-mono text-xs font-semibold text-[#8fd9ad] tabular-nums">
                  {formatNumber(displayRaw72h(mySquad.total_locked_raw, tokenDecimals), locale, { maximumFractionDigits: 0 })} 72H
                </div>
              </div>
              <div className="metric-card rounded-[12px] px-3 py-3">
                <div className="text-[9px] uppercase tracking-widest text-white/[0.36]">{t("team.mine.memberList")}</div>
                <div className="mt-1.5 truncate font-mono text-xs font-semibold text-white/75">
                  {mySquad.member_count} · {t("team.mine.memberSelf", { role: mySquad.membership.role })}
                </div>
              </div>
            </div>

            <div className="rounded-[12px] border border-white/10 bg-black/20 px-3 py-2">
              {mySquad.members.slice(0, 4).map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-3 border-b border-white/[0.06] py-2 last:border-b-0">
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-medium text-white/80">{member.email || member.user_id}</div>
                    <div className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-white/[0.34]">#{member.rank} / {member.status}</div>
                  </div>
                  <div className="shrink-0 font-mono text-[11px] font-semibold text-[#8fd9ad] tabular-nums">
                    {formatNumber(displayRaw72h(member.total_locked_raw, tokenDecimals), locale, { maximumFractionDigits: 0 })}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={copyInvite}
                className="depth-button focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-white/80 hover:bg-white/[0.11]"
              >
                <Copy className="h-4 w-4" />
                {t("team.mine.copyInvite")}
              </button>
              <button
                type="button"
                onClick={shareInvite}
                className="depth-button focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#8fd9ad]/30 bg-[#8fd9ad]/12 text-[10px] font-bold uppercase tracking-widest text-[#b7f3cc] hover:bg-[#8fd9ad]/20"
              >
                <Share2 className="h-4 w-4" />
                {t("team.mine.shareInvite")}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-[12px] border border-white/10 bg-black/25 px-4 py-4 text-[11px] leading-relaxed text-white/[0.46]">
            {t("team.mine.joinHint")}
          </div>
        )}
      </section>

      <section className="financial-panel rounded-[14px] p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="ui-label">{t("team.pool.title")}</div>
            <p className="mt-1 text-[11px] leading-relaxed text-white/[0.48]">
              {t("team.pool.detail")}
            </p>
          </div>
          <div className="shrink-0 rounded-md border border-[#d7b46a]/25 bg-[#d7b46a]/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#d7b46a]">
            {t("team.pool.vault")}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            [t("team.pool.team"), t("team.pool.teamValue")],
            [t("team.pool.leaderboard"), t("team.pool.leaderboardValue")],
          ].map(([label, value]) => (
            <div key={label} className="metric-card rounded-[12px] px-3 py-3">
              <div className="text-[9px] uppercase tracking-widest text-white/[0.36]">{label}</div>
              <div className="mt-1.5 font-mono text-xs font-semibold text-[#8fd9ad] tabular-nums">
                {value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="financial-panel w-full rounded-[14px] p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04]">
            <Plus className="h-4 w-4 text-[#d7b46a]" />
          </div>
          <input
            value={squadName}
            onChange={(event) => setSquadName(event.target.value)}
            placeholder={t("team.create.placeholder")}
            className="min-w-0 flex-1 rounded-[10px] border border-white/10 bg-black/35 px-3.5 py-2.5 font-mono text-xs outline-none transition-colors placeholder:text-white/[0.24] focus:border-[#8fd9ad]/45"
          />
          <button
            type="button"
            onClick={handleCreateSquad}
            disabled={isSubmitting || !waveId}
            className="depth-button focus-ring flex min-w-[76px] items-center justify-center rounded-[10px] border border-[#8fd9ad]/35 bg-[#8fd9ad]/15 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-[#b7f3cc] hover:bg-[#8fd9ad]/25 disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.create")}
          </button>
        </div>
      </section>

    </div>
  );
}
