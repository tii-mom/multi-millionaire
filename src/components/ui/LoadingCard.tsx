import { Loader2 } from "lucide-react";
import { cn } from "@/src/lib/utils";

interface LoadingCardProps {
  title?: string;
  description?: string;
  rows?: number;
  className?: string;
}

export default function LoadingCard({
  title = "Loading",
  description,
  rows = 3,
  className,
}: LoadingCardProps) {
  return (
    <div className={cn("rounded-[20px] border border-white/10 bg-white/[0.02] p-4 sm:p-5", className)}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#DBFF00]/20 bg-[#DBFF00]/10 text-[#DBFF00]">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/65">{title}</div>
          {description ? (
            <div className="mt-1 text-xs leading-5 text-white/35">{description}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-2.5">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-10 overflow-hidden rounded-[14px] border border-white/[0.04] bg-black/30">
            <div className="h-full w-1/2 animate-pulse rounded-[14px] bg-white/[0.04]" />
          </div>
        ))}
      </div>
    </div>
  );
}
