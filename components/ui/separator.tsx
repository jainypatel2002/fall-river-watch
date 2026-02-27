import { cn } from "@/lib/utils";

function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-zinc-200", className)} />;
}

export { Separator };
