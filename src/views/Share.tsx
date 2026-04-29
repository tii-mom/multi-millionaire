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
  const posterFileName = t("share.poster.fileName");
  const isChinese = locale.startsWith("zh");
  const posterRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateImage = async () => {
    if (!posterRef.current) return null;
    try {
      setIsGenerating(true);
      const { default: html2canvas } = await import("html2canvas");
      await document.fonts?.ready;
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
      link.download = posterFileName;
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
        const file = new File([blob], posterFileName, { type: "image/png" });

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
      link.download = posterFileName;
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
    <div className="tab-content-safe perspective-1000 flex flex-col gap-4 px-6">
      <section className="financial-panel group relative flex items-center justify-between overflow-hidden rounded-[16px] p-5 text-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d7b46a]/45 to-transparent" />
        <div className="relative z-10">
          <div className="mb-1 ui-label">
            {t("share.signal")}
          </div>
          <div className="flex items-baseline gap-1 font-mono text-3xl font-semibold tracking-tight tabular-nums">
            <span className="text-[#8fd9ad]">~</span>
            {estimatedReferralValue}
            <span className="pl-1 text-sm font-bold tracking-widest text-[#d7b46a]">72H</span>
          </div>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-widest text-white/38">
            {t("share.estimate")}
          </div>
        </div>
        <div className="z-10 flex h-11 w-11 items-center justify-center rounded-[12px] border border-[#d7b46a]/25 bg-[#d7b46a]/10 text-[#d7b46a]">
          <Zap className="h-5 w-5" />
        </div>
      </section>

      <p className="mx-auto max-w-[330px] text-center font-mono text-[10px] uppercase leading-5 tracking-[0.08em] text-white/[0.46]">
        {t("share.helper")}
      </p>

      <div className="mx-auto flex w-full max-w-[300px] gap-3 sm:max-w-[340px]">
        <button
          type="button"
          onClick={handleShare}
          disabled={isGenerating}
          className="depth-button focus-ring flex flex-1 items-center justify-center gap-2.5 rounded-[12px] border border-[#d7b46a]/30 bg-[#d7b46a]/[0.12] py-4 font-semibold text-[#e1c07b] hover:bg-[#d7b46a]/[0.18] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShareIcon className="h-4 w-4" />}
          <span className="text-sm tracking-wide">{isGenerating ? t("share.generating") : t("share.share")}</span>
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={isGenerating}
          className="depth-button focus-ring group flex w-[58px] shrink-0 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.035] backdrop-blur-xl hover:border-[#d7b46a]/35 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          title={t("share.copy")}
          aria-label={t("share.copy")}
        >
          <Copy className="h-5 w-5 text-white/80 transition-colors group-hover:text-white" />
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={isGenerating}
          className="depth-button focus-ring group flex w-[58px] shrink-0 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.035] backdrop-blur-xl hover:border-[#d7b46a]/35 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          title={t("share.download")}
          aria-label={t("share.download")}
        >
          <Download className="h-5 w-5 text-white/80 transition-colors group-hover:text-white" />
        </button>
      </div>

      <section
        className="financial-panel relative mx-auto aspect-[3/4] w-full max-w-[300px] cursor-pointer overflow-hidden rounded-[16px] bg-[#07090a] shadow-2xl transition-all ease-out sm:max-w-[340px]"
        style={{ transformStyle: "preserve-3d", transitionDuration: "200ms" }}
        ref={posterRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="poster-glare pointer-events-none absolute inset-0 z-30 opacity-0 mix-blend-screen transition-opacity duration-300" />
        <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-tr from-white/[0.03] via-transparent to-[#d7b46a]/[0.08]" />

        <div className="absolute inset-0 z-0 bg-[#07090a]" />
        <div className="absolute inset-0 z-0 bg-[linear-gradient(135deg,_rgba(200,162,74,0.12),_transparent_34%,_rgba(65,138,151,0.08)_100%)]" />
        <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:42px_42px] opacity-20" />
        <div className="absolute inset-x-8 top-24 z-0 h-px bg-gradient-to-r from-transparent via-[#d7b46a]/35 to-transparent" />
        <div className="absolute inset-x-8 bottom-24 z-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        <div className="absolute inset-0 z-10 flex flex-col p-7">
          <div className="flex items-center gap-3">
            <div className="relative flex h-14 w-[72px] shrink-0 items-center justify-center">
              <img
                src={BRAND_LOGO_SRC}
                alt={t("app.brand.name")}
                className="relative h-full w-full object-contain opacity-95 drop-shadow-[0_8px_18px_rgba(0,0,0,0.45)]"
              />
            </div>
            <div>
              <div className={`font-mono text-[9px] uppercase text-[#d7b46a] ${isChinese ? "tracking-[0.08em]" : "tracking-[0.28em]"}`}>
                {t("app.brand.kicker")}
              </div>
              <div className={`mt-1 text-sm font-semibold uppercase text-white ${isChinese ? "tracking-[0.04em]" : "tracking-[0.18em]"}`}>
                {t("app.brand.name")}
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col justify-center">
            <h2 className="mb-4 text-4xl font-semibold leading-[0.96] tracking-normal text-white">
              {t("share.poster.line1")}<br />
              <span className="text-white/72">
                {t("share.poster.line2")}
              </span><br />
              {t("share.poster.line3")}
            </h2>

            <div className="relative mt-8 rounded-[12px] border border-white/10 bg-black/25 p-4">
              <div className="absolute bottom-3 left-0 top-3 w-[2px] bg-gradient-to-b from-[#d7b46a] via-[#8fd9ad] to-transparent" />
              <div className="pl-3">
                <div className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-[#d7b46a]">
                  {t("share.poster.progress")}
                </div>
                <div className="font-mono text-2xl tracking-tight text-white tabular-nums">
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
              <span className="font-mono text-[10px] tracking-widest text-[#d7b46a]">72H.LOL</span>
            </div>
            <div className="h-14 w-14 rounded-[10px] border border-white/10 bg-white/90 p-1.5">
              <div className="h-full w-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHBhdGggZD0iTTAgMGg4djhIMHptMTAgMGg4djhIMTB6TTAgMTBoOHY4SDB6bTEwIDEwaDh2OEgxMHoiIGZpbGw9IiMwMDAiLz48L3N2Zz4=')] bg-cover bg-repeat opacity-80 mix-blend-multiply" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
