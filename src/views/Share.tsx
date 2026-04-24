import { useRef, useState } from "react";
import { toast } from "sonner";
import { ShareIcon, Download, Zap, Loader2, Copy } from "lucide-react";
import html2canvas from "html2canvas";

export default function Share({ myDeposit }: any) {
  const estimatedReferralValue = myDeposit > 0 ? (myDeposit * 0.01).toFixed(2) : "0.00";
  
  const posterRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

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
            text: 'I joined the 72H gray-test path. Chain verification is required before any real lock or reward claim.',
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
    } catch(e: any) {
      // Abort is normal if user cancels native share dialog
      if (e.name !== "AbortError") {
        console.error(e);
        toast.error("Something went wrong while sharing.");
      }
    }
  };

  const handleCopy = async () => {
    const textToCopy = `I joined the 72H gray-test path with ${myDeposit.toLocaleString()} 72H shown as app-recorded progress. Real locks and rewards require chain verification: https://72h.lol`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      toast.success("App link & deposit copied to clipboard!");
    } catch (err) {
      toast.error("Failed to copy to clipboard.");
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
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
    <div className="px-6 flex flex-col gap-6 pb-10 perspective-1000">
      
      {/* Rewards Banner */}
      <div className="bg-[#DBFF00] rounded-[24px] p-6 text-black flex justify-between items-center shadow-[0_0_40px_rgba(219,255,0,0.15)] relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[150%] skew-x-[-20deg] group-hover:animate-[shine_1.5s_ease-in-out]" />
        <div className="relative z-10">
          <div className="text-[10px] uppercase tracking-[0.2em] font-mono font-bold opacity-60 mb-1">
            Share Signal
          </div>
          <div className="text-3xl font-mono font-black tracking-tighter tabular-nums flex items-baseline gap-1">
            <span className="text-[#DBFF00] drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">~</span>{estimatedReferralValue} <span className="text-sm font-bold tracking-widest pl-1 opacity-80">72H</span>
          </div>
          <div className="mt-1 text-[9px] uppercase tracking-widest font-mono font-bold opacity-50">
            Estimated referral preview
          </div>
        </div>
        <Zap className="w-10 h-10 opacity-90 drop-shadow-md z-10" />
      </div>

      <p className="text-[11px] text-white/50 font-mono text-center mb-0 mt-1 uppercase tracking-widest">
        Share gray-test poster or copy your invite
      </p>

      {/* Poster Generator Mock */}
      <div 
        className="relative aspect-[3/4] bg-black border-[4px] border-[#1A1A1A] rounded-[32px] overflow-hidden shine-effect shadow-2xl mx-2 cursor-pointer transition-all ease-out" 
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
        <div className="absolute inset-0 p-8 flex flex-col z-10">
          <div className="font-mono text-[10px] tracking-[0.3em] text-[#DBFF00] uppercase">
            Project 72H
          </div>
          
          <div className="flex-1 flex flex-col justify-center">
            <h2 className="text-5xl font-bold leading-[0.9] tracking-tighter mb-4 text-white">
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
                  App-Recorded Progress
                </div>
                <div className="font-mono text-2xl text-white tabular-nums tracking-tighter">
                  {myDeposit.toLocaleString()} <span className="text-sm tracking-widest opacity-50 font-normal text-white">72H</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Footer of Poster */}
          <div className="w-full flex justify-between items-end pt-6">
            <div className="flex flex-col gap-1.5">
              <span className="text-[8px] uppercase tracking-[0.2em] text-white/30 font-mono">Scan to Join Gray Test</span>
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
      <div className="flex gap-3 mt-2 mx-2">
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
