import type { ReactNode } from "react";
import { CircleDashed } from "lucide-react";
import { cn } from "@/src/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export default function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("rounded-[20px] border border-dashed border-white/15 bg-black/20 p-5 text-center", className)}>
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/50">
        {icon || <CircleDashed className="h-4 w-4" />}
      </div>
      <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/70">{title}</div>
      {description ? (
        <p className="mx-auto mt-2 max-w-[260px] text-xs leading-5 text-white/40">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-[14px] border border-white/10 bg-white/10 px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:border-[#DBFF00]/40 hover:bg-[#DBFF00] hover:text-black active:scale-[0.98]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
