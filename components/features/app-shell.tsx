import Link from "next/link";
import { Bell, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[rgba(6,9,15,0.82)] backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <span
              className="rounded-xl border border-[rgba(34,211,238,0.45)] bg-[rgba(10,20,36,0.85)] px-2 py-1 text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              FR
            </span>
            <span className="text-sm font-semibold sm:text-base" style={{ fontFamily: "var(--font-heading)" }}>
              Fall River Alert
            </span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            <Link
              href="/settings/notifications"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "border border-transparent px-3 text-[color:var(--muted)] hover:border-[var(--border)]"
              )}
            >
              <Bell className="mr-2 h-4 w-4" />
              Notifications
            </Link>
            <Link
              href="/admin"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "border border-transparent px-3 text-[color:var(--muted)] hover:border-[var(--border)]"
              )}
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Admin
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/auth" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "hidden sm:inline-flex")}>
              Account
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
