import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-xl border border-[var(--border)] bg-[rgba(13,20,35,0.85)]", className)} />;
}
