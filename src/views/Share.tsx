import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MouseEvent, ReactNode, SetStateAction } from "react";
import { toast } from "sonner";
import { ShareIcon, Download, Zap, Loader2, Copy, Link2, Users } from "lucide-react";
import html2canvas from "html2canvas";
import { api } from "@/src/lib/api";
import type { SquadLeaderboardRow } from "@/src/lib/types";
import EmptyState from "@/src/components/ui/EmptyState";
import ErrorState from "@/src/components/ui/ErrorState";
import LoadingCard from "@/src/components/ui/LoadingCard";

interface ShareProps {
  myDeposit: number;
  setMyDeposit?: Dispatch<SetStateAction<number>>;
}

interface LinkPanelProps {
  icon: ReactNode;
  label: string;
  value: string;
  meta: string;
  badge?: string;
  onCopy: () => void;
}

function getShareOrigin() {
  if (typeof window === "undefined") return "https://72h.lol";
  return window.location.origin;
}

function decodeShareCode(token: string | null) {
  if (!token) return "guest";

  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return "member";
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    const raw = String(payload.email || payload.userId || "member");
    return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "member";
  } catch {
    return "member";
  }
}

function LinkPanel({ icon, label, value, meta, badge, onCopy }: LinkPanelProps) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-white/60">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[#DBFF00]">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/70">{label}</div>
            <div className="mt-0.5 truncate text-[11px] text-white/35">{meta}</div>
          </div>
        </div>
        {badge ? (
          <div className="shrink-0 rounded-full border border-[#DBFF00]/20 bg-[#DBFF00]/10 px-2.5 py-1 font-mono text-[8px] uppercase tracking-widest text-[#DBFF00]/70">
            {badge}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2 rounded-[14px] border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
        <div className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/65">{value}</div>
        <button
          type="button"
          onClick={onCopy}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] border border-white/10 bg-white/10 text-white/70 transition-colors hover:border-[#DBFF00]/40 hover:bg-[#DBFF00] hover:text-black active:scale-[0.96]"
          aria-label={`Copy ${label}`}
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function Share({ myDeposit, setMyDeposit }: ShareProps) {
  const [isClaiming, setIsClaiming] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [waveId, setWaveId] = useState<number | null>(null);
  const [featuredSquad, setFeaturedSquad] = useState<SquadLeaderboardRow | null>(null);
  const [linksLoading, setLinksLoading] = useState(true);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [authToken] = useState(() => localStorage.getItem("auth_token"));

  const pendingRewardValue = myDeposit > 0 && !hasClaimed ? myDeposit * 0.05 : 0;
  const pendingReward = pendingRewardValue.toFixed(2);

  const posterRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const shareOrigin = useMemo(() => getShareOrigin(), []);
  const referralCode = useMemo(() => decodeShareCode(authToken), [authToken]);
  const referralLink = useMemo(
    () => `${shareOrigin}/?ref=${encodeURIComponent(referralCode)}`,
    [referralCode, shareOrigin]
  );
  const squadLink = useMemo(() => {
    const squadKey = featuredSquad ? String(featuredSquad.id) : "pending";
    const waveKey = waveId ? String(waveId) : "pending";
    return `${shareOrigin}/?squad=${encodeURIComponent(squadKey)}&wave=${encodeURIComponent(waveKey)}`;
  }, [featuredSquad, shareOrigin, waveId]);

  const loadShareLinks = useCallback(async () => {
    setLinksLoading(true);
    setLinksError(null);

    try {
      const wave = await api.currentWave();
      if (!wave?.wave_id) {
        setWaveId(null);
        setFeaturedSquad(null);
        return;
      }

      const nextWaveId = Number(wave.wave_id);
      setWaveId(nextWaveId);
      const rows = await api.listSquads(nextWaveId);
      setFeaturedSquad(rows[0] || null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load share links.";
      setLinksError(message);
      setWaveId(null);
      setFeaturedSquad(null);
    } finally {
      setLinksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShareLinks();
  }, [loadShareLinks]);

  const handleClaim = () => {
    if (pendingRewardValue <= 0) return;
    setIsClaiming(true);
    setTimeout(() => {
      if (setMyDeposit) setMyDeposit((prev: number) => prev + pendingRewardValue);
      setHasClaimed(true);
      setIsClaiming(false);
      toast.success(`Successfully claimed ${pendingReward} 72H tokens!`);
    }, 1500);
  };

  const generateImage = async () => {
    if (!posterRef.current) return null;
    try {
      setIsGenerating(true);
      const canvas = await html2canvas(posterRef.current, {
        backgroundColor: null, // Transparent bg
        scale: 2,
        useCORS: true,
        logging: false,
      });
      return canvas.toDataURL("image/png");
    } catch(e) {
      toast.error("Failed to generate poster");
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    toast.message("Generating poster for download...");
    const dataUrl = await generateImage();
    if (dataUrl) {
      const link = document.createElement('a');
      link.download = '72H-Millionaire-Path.png';
      link.href = dataUrl;
      link.click();
      toast.success("Poster saved to gallery!");
    }
  };

  const copyText = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch {
      toast.error("Failed to copy to clipboard.");
    }
  };

  const handleShare = async () => {
    toast.message("Preparing shareable card...");
    const dataUrl = await generateImage();
    if (!dataUrl) return;

    try {
      if (navigator.share) {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], '72H-Millionaire-Path.png', { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'My 72H Millionaire Path',
            text: `I just locked 72H to secure my millionaire path. Join here: ${referralLink}`,
            files: [file]
          });
          toast.success("Shared successfully!");
          return;
        }
      }

      // Fallback if Web Share API with files is not supported
      const link = document.createElement('a');
      link.download = '72H-Millionaire-Path.png';
      link.href = dataUrl;
      link.click();
      toast.message("Sharing not supported in browser, starting download instead.");
    } catch(e) {
      // Abort is normal if user cancels native share dialog
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        console.error(e);
        toast.error("Something went wrong while sharing.");
      }
    }
  };

  const handleCopy = async () => {
    const textToCopy = `I locked ${myDeposit.toLocaleString()} 72H on the Millionaire Path. Referral: ${referralLink} Squad: ${squadLink}`;
    await copyText(textToCopy, "Share text copied.");
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!posterRef.current || isGenerating) return;
    const rect = posterRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate rotation (-10 to 10 degrees)
    const rotateY = ((x / rect.width) - 0.5) * 20;
    const rotateX = ((y / rect.height) - 0.5) * -20;

    // Apply transform and update glare
    posterRef.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;

    const glareX = (x / rect.width) * 100;
    const glareY = (y / rect.height) * 100;
    const glareEl = posterRef.current.querySelector('.poster-glare') as HTMLDivElement;
    if (glareEl) {
      glareEl.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.15) 0%, transparent 60%)`;
      glareEl.style.opacity = '1';
    }
  };

  const handleMouseLeave = () => {
    if (!posterRef.current) return;
    posterRef.current.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
    const glareEl = posterRef.current.querySelector('.poster-glare') as HTMLDivElement;
    if (glareEl) {
      glareEl.style.opacity = '0';
    }
  };

  return (
    <div className="perspective-1000 flex flex-col gap-4 px-4 pb-8 sm:gap-6 sm:px-6 sm:pb-10">

      {/* Rewards Banner */}
      <div className="relative flex items-center justify-between overflow-hidden rounded-[20px] bg-[#DBFF00] p-5 text-black shadow-[0_0_40px_rgba(219,255,0,0.15)] transition-transform duration-300 hover:scale-[1.01] sm:rounded-[24px] sm:p-6 group">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[150%] skew-x-[-20deg] group-hover:animate-[shine_1.5s_ease-in-out]" />
        <div className="relative z-10">
          <div className="text-[10px] uppercase tracking-[0.2em] font-mono font-bold opacity-60 mb-1">
            Pending Exposure Reward
          </div>
          <div className="text-3xl font-mono font-black tracking-tighter tabular-nums flex items-baseline gap-1">
            <span className="text-[#DBFF00] drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">+</span>{pendingReward} <span className="text-sm font-bold tracking-widest pl-1 opacity-80">72H</span>
          </div>
        </div>
        <Zap className="w-10 h-10 opacity-90 drop-shadow-md z-10" />
      </div>

      {/* Claim Reward Button */}
      <button
        onClick={handleClaim}
        disabled={isClaiming || pendingRewardValue <= 0 || hasClaimed}
        className={`w-full font-bold rounded-[16px] py-3.5 flex items-center justify-center gap-2.5 transition-all -mt-2 ${
          hasClaimed
            ? "bg-white/5 border border-green-500/20 text-green-500/60 cursor-not-allowed shadow-inner"
            : pendingRewardValue <= 0
            ? "bg-white/[0.02] border border-white/5 text-white/30 cursor-not-allowed"
            : "bg-[#DBFF00]/10 border border-[#DBFF00]/20 text-[#DBFF00] hover:bg-[#DBFF00]/20 hover:border-[#DBFF00]/40 active:scale-[0.98] shadow-[inset_0_2px_10px_rgba(219,255,0,0.05)]"
        } ${isClaiming ? "opacity-70 scale-[0.98] cursor-not-allowed" : "disabled:opacity-100"}`}
      >
        {isClaiming ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> <span className="text-[11px] font-mono tracking-[0.2em] uppercase opacity-80">Claiming...</span></>
        ) : hasClaimed ? (
          <span className="text-[11px] font-mono tracking-[0.2em] uppercase opacity-80">Reward Claimed</span>
        ) : pendingRewardValue <= 0 ? (
          <span className="text-[11px] font-mono tracking-[0.2em] uppercase opacity-80">No Pending Reward</span>
        ) : (
          <><Zap className="w-4 h-4 drop-shadow-[0_0_8px_#DBFF00]" /> <span className="text-[11px] font-mono tracking-[0.2em] uppercase text-[#DBFF00] font-bold">Claim Reward</span></>
        )}
      </button>

      <p className="mb-0 mt-1 text-center font-mono text-[11px] uppercase tracking-widest text-white/50">
        Share links and poster
      </p>

      <div className="rounded-[20px] border border-white/10 bg-white/[0.02] p-2 backdrop-blur-xl sm:rounded-[24px]">
        <div className="flex items-center justify-between gap-3 p-3 pb-2">
          <div className="flex items-center gap-2 text-white/50">
            <Link2 className="h-4 w-4 text-[#DBFF00]/80" />
            <span className="font-mono text-[11px] uppercase tracking-[0.2em]">Invite Links</span>
          </div>
          <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[8px] uppercase tracking-widest text-white/40">
            Stub Ready
          </div>
        </div>

        <div className="grid gap-2 p-2">
          {linksLoading ? (
            <LoadingCard title="Loading links" description="Checking active Wave and squads." rows={2} />
          ) : linksError ? (
            <ErrorState title="Links unavailable" message={linksError} onRetry={loadShareLinks} />
          ) : (
            <>
              {!waveId ? (
                <EmptyState
                  title="No active wave"
                  description="Links use a pending Wave placeholder until the backend opens a Wave."
                  actionLabel="Check again"
                  onAction={loadShareLinks}
                  className="mb-1"
                />
              ) : null}
              <LinkPanel
                icon={<Link2 className="h-4 w-4" />}
                label="Referral link"
                value={referralLink}
                meta={authToken ? "Attribution code from signed-in token" : "Guest placeholder until sign-in"}
                badge={authToken ? "Live" : "Stub"}
                onCopy={() => copyText(referralLink, "Referral link copied.")}
              />
              <LinkPanel
                icon={<Users className="h-4 w-4" />}
                label="Squad link"
                value={squadLink}
                meta={featuredSquad ? `Featured squad: ${featuredSquad.name}` : "Squad membership link pending backend support"}
                badge={featuredSquad ? `#${featuredSquad.rank}` : "Stub"}
                onCopy={() => copyText(squadLink, "Squad link copied.")}
              />
            </>
          )}
        </div>
      </div>

      {/* Poster Generator Mock */}
      <div
        className="shine-effect relative mx-0 aspect-[3/4] cursor-pointer overflow-hidden rounded-[26px] border-[4px] border-[#1A1A1A] bg-black shadow-2xl transition-all ease-out sm:mx-2 sm:rounded-[32px]"
        style={{ transformStyle: 'preserve-3d', transitionDuration: '200ms' }}
        ref={posterRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="poster-glare absolute inset-0 z-30 pointer-events-none transition-opacity duration-300 opacity-0 mix-blend-screen" />

        {/* Physical card glare - using slightly more solid colors to ensure html2canvas captures nicely */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/5 via-transparent to-white/10 pointer-events-none z-20" />

        {/* Background Gradients inside Poster */}
        <div className="absolute inset-0 bg-[#0A0A0A] z-0" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-[#1f201a] via-[#0A0A0A] to-[#0A0A0A] z-0" />
        <div className="absolute -bottom-1/2 -right-1/2 w-[150%] h-[150%] bg-[#DBFF00]/10 blur-[60px] rounded-full z-0" />

        {/* Poster Content */}
        <div className="absolute inset-0 z-10 flex flex-col p-5 sm:p-8">
          <div className="font-mono text-[10px] tracking-[0.3em] text-[#DBFF00] uppercase">
            Project 72H
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <h2 className="mb-4 text-4xl font-bold leading-[0.9] tracking-tighter text-white sm:text-5xl">
              I am on the<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-white/80 to-white/10">
                Millionaire
              </span><br />
              Path.
            </h2>

            <div className="mt-8 relative">
              <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-[#DBFF00] to-transparent" />
              <div className="pl-5 py-1">
                <div className="text-[9px] uppercase tracking-widest text-[#DBFF00]/80 font-mono mb-1.5">
                  My Locked Holdings
                </div>
                <div className="font-mono text-xl tracking-tighter text-white tabular-nums sm:text-2xl">
                  {myDeposit.toLocaleString()} <span className="text-sm tracking-widest opacity-50 font-normal text-white">72H</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer of Poster */}
          <div className="w-full flex justify-between items-end pt-6">
            <div className="flex flex-col gap-1.5">
              <span className="text-[8px] uppercase tracking-[0.2em] text-white/30 font-mono">Scan to Join Squad</span>
              <span className="text-[10px] font-mono tracking-widest text-white/70">72H.LOL</span>
            </div>
            {/* Mock QR Code */}
            <div className="w-14 h-14 bg-white/90 rounded-xl p-1.5 shadow-[0_0_20px_rgba(219,255,0,0.1)]">
              <div className="w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHBhdGggZD0iTTAgMGg4djhIMHptMTAgMGg4djhIMTB6TTAgMTBoOHY4SDB6bTEwIDEwaDh2OEgxMHoiIGZpbGw9IiMwMDAiLz48L3N2Zz4=')] opacity-80 bg-repeat bg-cover mix-blend-multiply" />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mx-0 mt-2 flex gap-2 sm:mx-2 sm:gap-3">
        <button
          onClick={handleShare}
          disabled={isGenerating}
          className="flex-1 bg-white text-black font-semibold rounded-[20px] py-4 flex items-center justify-center gap-2.5 hover:bg-white/90 transition-all active:scale-[0.98] shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShareIcon className="w-4 h-4" />}
          <span className="text-sm tracking-wide">{isGenerating ? "Generating..." : "Share"}</span>
        </button>
        <button
          onClick={handleCopy}
          disabled={isGenerating}
          className="w-[64px] flex shrink-0 items-center justify-center border border-white/10 bg-white/[0.02] backdrop-blur-md rounded-[20px] hover:bg-white/5 hover:border-white/20 transition-colors active:scale-[0.95] disabled:opacity-50 disabled:cursor-not-allowed group"
          title="Copy Link"
        >
          <Copy className="w-5 h-5 text-white/80 group-hover:text-white transition-colors" />
        </button>
        <button
          onClick={handleDownload}
          disabled={isGenerating}
          className="w-[64px] flex shrink-0 items-center justify-center border border-white/10 bg-white/[0.02] backdrop-blur-md rounded-[20px] hover:bg-white/5 hover:border-white/20 transition-colors active:scale-[0.95] disabled:opacity-50 disabled:cursor-not-allowed group"
          title="Download Poster"
        >
          <Download className="w-5 h-5 text-white/80 group-hover:text-white transition-colors" />
        </button>
      </div>

    </div>
  );
}
