export function StatusPill({ status }: { status: string }) {
  const tone = status === "live" || status === "approved" || status === "open"
    ? "border-[#DBFF00]/25 bg-[#DBFF00]/10 text-[#DBFF00]"
    : "border-white/10 bg-white/[0.04] text-white/55";

  return (
    <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] uppercase tracking-widest ${tone}`}>
      {status}
    </span>
  );
}
