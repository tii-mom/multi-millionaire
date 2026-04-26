import { useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, Loader2, ShareIcon, Zap } from "lucide-react";
import { formatNumber, useI18n } from "@/src/lib/i18n";

const BRAND_LOGO_SRC = "/logo-transparent.png";

type ShareProps = {
  myDeposit: number;
};

export default function Share({ myDeposit }: ShareProps) {
  const { locale, t } = useI18n();
  const estimatedReferralValue = myDeposit > 0 ? (myDeposit * 0.01).toFixed(2) : "0.00";
  const formattedProgress = formatNumber(myDeposit, locale);
  const posterRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateImage = async () => {
    if (!posterRef.current) return null;
    try {
      setIsGenerating(true);
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(posterRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      return canvas.toDataURL("image/png");
    } catch {
      toast.error(t("share.generateFailed"));
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    toast.message(t("share.generatingDownload"));
    const dataUrl = await generateImage();
    if (dataUrl) {
      const link = document.createElement("a");
      link.download = "Multi-Millionaire.png";
      link.href = dataUrl;
      link.click();
      toast.success(t("share.saved"));
    }
  };

  const handleShare = async () => {
    toast.message(t("share.preparing"));
    const dataUrl = await generateImage();
    if (!dataUrl) return;

    try {
      if (navigator.share) {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "Multi-Millionaire.png", { type: "image/png" });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: t("share.nativeTitle"),
            text: t("share.nativeText"),
            files: [file],
          });
          toast.success(t("share.shared"));
          return;
        }
      }

      const link = document.createElement("a");
      link.download = "Multi-Millionaire.png";
      link.href = dataUrl;
      link.click();
      toast.message(t("share.unsupported"));
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.error(t("share.shareFailed"));
      }
    }
  };

  const handleCopy = async () => {
    const textToCopy = t("share.copyText", { amount: formattedProgress });
    try {
      await navigator.clipboard.writeText(textToCopy);
      toast.success(t("share.copied"));
    } catch {
      toast.error(t("share.copyFailed"));
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!posterRef.current || isGenerating) return;
    const rect = posterRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotateY = (x / rect.width - 0.5) * 14;
    const rotateX = (y / rect.height - 0.5) * -14;

    posterRef.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.015, 1.015, 1.015)`;

    const glareX = (x / rect.width) * 100;
    const glareY = (y / rect.height) * 100;
    const glareEl = posterRef.current.querySelector(".poster-glare") as HTMLDivElement;
    if (glareEl) {
      glareEl.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.13) 0%, transparent 58%)`;
      glareEl.style.opacity = "1";
    }
  };

  const handleMouseLeave = () => {
    if (!posterRef.current) return;
    posterRef.current.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
    const glareEl = posterRef.current.querySelector(".poster-glare") as HTMLDivElement;
    if (glareEl) {
      glareEl.style.opacity = "0";
    }
  };

  return (
    <div className="perspective-1000 flex flex-col gap-5 px-6 pb-10">
      <section className="depth-button group relative flex items-center justify-between overflow-hidden rounded-[24px] bg-[#DBFF00] p-6 text-black shadow-[0_0_42px_rgba(219,255,0,0.14)]">
        <div className="absolute inset-0 -translate-x-[150%] skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/[0.38] to-transparent group-hover:animate-[shine_1.5s_ease-in-out]" />
        <div className="relative z-10">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">
            {t("share.signal")}
          </div>
          <div className="flex items-baseline gap-1 font-mono text-3xl font-black tracking-tighter tabular-nums">
            <span className="text-[#DBFF00] drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">~</span>
            {estimatedReferralValue}
            <span className="pl-1 text-sm font-bold tracking-widest opacity-80">72H</span>
          </div>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-widest opacity-52">
            {t("share.estimate")}
          </div>
        </div>
        <Zap className="z-10 h-10 w-10 opacity-90 drop-shadow-md" />
      </section>

      <p className="mx-auto max-w-[330px] text-center font-mono text-[11px] uppercase leading-5 tracking-widest text-white/[0.52]">
        {t("share.helper")}
      </p>

      <section
        className="shine-effect glass-panel relative mx-2 aspect-[3/4] cursor-pointer overflow-hidden rounded-[30px] border-[4px] border-[#1A1A1A] bg-black shadow-2xl transition-all ease-out"
        style={{ transformStyle: "preserve-3d", transitionDuration: "200ms" }}
        ref={posterRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="poster-glare pointer-events-none absolute inset-0 z-30 opacity-0 mix-blend-screen transition-opacity duration-300" />
        <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-tr from-white/5 via-transparent to-white/10" />

        <div className="absolute inset-0 z-0 bg-[#0A0A0A]" />
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_bottom,_#272a1d,_#0A0A0A_52%,_#0A0A0A)]" />
        <div className="absolute -bottom-1/2 -right-1/2 z-0 h-[150%] w-[150%] rounded-full bg-[#DBFF00]/10 blur-[60px]" />

        <div className="absolute inset-0 z-10 flex flex-col p-8">
          <div className="flex items-center gap-3">
            <div className="relative flex h-16 w-20 shrink-0 items-center justify-center">
              <div className="absolute inset-1 rounded-[24px] bg-emerald-950/20 blur-xl" />
              <img
                src={BRAND_LOGO_SRC}
                alt={t("app.brand.name")}
                className="relative h-full w-full object-contain drop-shadow-[0_8px_22px_rgba(0,0,0,0.5)]"
              />
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#C99D38]">
                {t("app.brand.kicker")}
              </div>
              <div className="mt-1 text-sm font-semibold uppercase tracking-[0.18em] text-white">
                {t("app.brand.name")}
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col justify-center">
            <h2 className="mb-4 text-5xl font-bold leading-[0.9] tracking-tighter text-white">
              {t("share.poster.line1")}<br />
              <span className="bg-gradient-to-br from-white via-white/80 to-white/10 bg-clip-text text-transparent">
                {t("share.poster.line2")}
              </span><br />
              {t("share.poster.line3")}
            </h2>

            <div className="relative mt-8">
              <div className="absolute bottom-0 left-0 top-0 w-[2px] bg-gradient-to-b from-[#DBFF00] to-transparent" />
              <div className="py-1 pl-5">
                <div className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-[#DBFF00]/80">
                  {t("share.poster.progress")}
                </div>
                <div className="font-mono text-2xl tracking-tighter text-white tabular-nums">
                  {formattedProgress} <span className="text-sm font-normal tracking-widest text-white/50">72H</span>
                </div>
                <div className="mt-1 font-mono text-[8px] uppercase leading-4 tracking-widest text-white/35">
                  {t("share.poster.notHoldings")}
                </div>
              </div>
            </div>
          </div>

          <div className="flex w-full items-end justify-between pt-6">
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/30">{t("share.poster.scan")}</span>
              <span className="font-mono text-[10px] tracking-widest text-white/70">72H.LOL</span>
            </div>
            <div className="h-14 w-14 rounded-xl bg-white/90 p-1.5 shadow-[0_0_20px_rgba(219,255,0,0.1)]">
              <div className="h-full w-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHBhdGggZD0iTTAgMGg4djhIMHptMTAgMGg4djhIMTB6TTAgMTBoOHY4SDB6bTEwIDEwaDh2OEgxMHoiIGZpbGw9IiMwMDAiLz48L3N2Zz4=')] bg-cover bg-repeat opacity-80 mix-blend-multiply" />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-2 mt-1 flex gap-3">
        <button
          type="button"
          onClick={handleShare}
          disabled={isGenerating}
          className="depth-button focus-ring flex flex-1 items-center justify-center gap-2.5 rounded-[20px] bg-white py-4 font-semibold text-black shadow-lg hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShareIcon className="h-4 w-4" />}
          <span className="text-sm tracking-wide">{isGenerating ? t("share.generating") : t("share.share")}</span>
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={isGenerating}
          className="depth-button focus-ring group flex w-[64px] shrink-0 items-center justify-center rounded-[20px] border border-white/10 bg-white/[0.025] backdrop-blur-xl hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          title={t("share.copy")}
          aria-label={t("share.copy")}
        >
          <Copy className="h-5 w-5 text-white/80 transition-colors group-hover:text-white" />
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={isGenerating}
          className="depth-button focus-ring group flex w-[64px] shrink-0 items-center justify-center rounded-[20px] border border-white/10 bg-white/[0.025] backdrop-blur-xl hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          title={t("share.download")}
          aria-label={t("share.download")}
        >
          <Download className="h-5 w-5 text-white/80 transition-colors group-hover:text-white" />
        </button>
      </div>
    </div>
  );
}
