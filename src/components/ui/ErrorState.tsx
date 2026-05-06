import { AlertTriangle, RotateCcw } from "lucide-react";
import { cn } from "@/src/lib/utils";

interface ErrorStateProps {
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
}

export default function ErrorState({
  title = "Unable to load",
  message,
  retryLabel = "Retry",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("rounded-[20px] border border-red-500/20 bg-red-500/10 p-4 sm:p-5", className)}>
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-400/20 bg-red-400/10 text-red-200">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-red-100/90">{title}</div>
          <p className="mt-1 text-xs leading-5 text-red-100/65">{message}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-2 rounded-[14px] border border-red-200/20 bg-red-100/10 px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-red-50 transition-colors hover:bg-red-100/20 active:scale-[0.98]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {retryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
