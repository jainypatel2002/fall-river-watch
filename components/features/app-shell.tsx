"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, LoaderCircle, LogOut, Menu, Plus, ShieldCheck, User } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";
import { WeatherPanel } from "@/components/features/weather-panel";
import { WeatherPill } from "@/components/features/weather-pill";
import { AddToHomeScreenModal } from "@/src/components/AddToHomeScreenModal";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const supabase = useSupabaseBrowser();
  const { isAuthenticated, isAdmin, isLoading } = useCurrentUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    setMobileMenuOpen(false);
    router.push("/auth");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <header
        className="sticky top-0 z-40 border-b border-[var(--border)] bg-[rgba(6,9,15,0.82)] backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-7xl min-w-0 items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex min-w-0 shrink items-center gap-2 overflow-hidden">
            <span
              className="shrink-0 rounded-xl border border-[rgba(34,211,238,0.45)] bg-[rgba(10,20,36,0.85)] px-2 py-1 text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              FR
            </span>
            <span className="truncate text-sm font-semibold sm:text-base" style={{ fontFamily: "var(--font-heading)" }}>
              Fall River Alert
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="/"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "border border-transparent px-3 text-[color:var(--muted)] hover:border-[var(--border)]"
              )}
            >
              Reports
            </Link>
            <Link
              href="/feed"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "border border-transparent px-3 text-[color:var(--muted)] hover:border-[var(--border)]"
              )}
            >
              Feed
            </Link>
            <Link
              href="/events"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "border border-transparent px-3 text-[color:var(--muted)] hover:border-[var(--border)]"
              )}
            >
              Events
            </Link>
            <Link
              href="/news"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "border border-transparent px-3 text-[color:var(--muted)] hover:border-[var(--border)]"
              )}
            >
              News
            </Link>
            <Link
              href="/groups"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "border border-transparent px-3 text-[color:var(--muted)] hover:border-[var(--border)]"
              )}
            >
              Groups
            </Link>
          </nav>

          <nav className="ml-auto hidden items-center gap-2 md:flex">
            <Link
              href="/report/new"
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "border-[rgba(217,70,239,0.42)] px-3"
              )}
            >
              <Plus className="mr-2 h-4 w-4" />
              Report
            </Link>
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
            <WeatherPill />
            {isAuthenticated && isLoading ? (
              <span className="inline-flex h-9 items-center rounded-xl border border-[var(--border)] px-3 text-xs text-[color:var(--muted)]">
                <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Checking role...
              </span>
            ) : null}
            {!isLoading && isAdmin ? (
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
            ) : null}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
                  Account
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-rose-500 focus:text-rose-500">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/auth" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
                Sign in
              </Link>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2 md:hidden">
            <WeatherPill compact className="h-11" />
            <Link
              href="/report/new"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "h-11 w-11 px-0 min-[640px]:w-auto min-[640px]:px-4")}
            >
              <Plus className="h-4 w-4 min-[640px]:mr-1.5" />
              <span className="sr-only min-[640px]:not-sr-only">Report</span>
            </Link>

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[min(22rem,92vw)] overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-11">
                <SheetHeader>
                  <SheetTitle style={{ fontFamily: "var(--font-heading)" }}>Menu</SheetTitle>
                  <SheetDescription>Quick access to account and app actions.</SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-2">
                  <Link
                    href="/"
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-11 w-full justify-start px-3 text-sm")}
                  >
                    Reports
                  </Link>

                  <Link
                    href="/feed"
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-11 w-full justify-start px-3 text-sm")}
                  >
                    Feed
                  </Link>

                  <Link
                    href="/events"
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-11 w-full justify-start px-3 text-sm")}
                  >
                    Events
                  </Link>

                  <Link
                    href="/news"
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-11 w-full justify-start px-3 text-sm")}
                  >
                    News
                  </Link>

                  <Link
                    href="/groups"
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-11 w-full justify-start px-3 text-sm")}
                  >
                    Groups
                  </Link>

                  <Link
                    href="/settings/notifications"
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-11 w-full justify-start px-3 text-sm")}
                  >
                    <Bell className="mr-2 h-4 w-4" />
                    Notifications
                  </Link>

                  {!isLoading && isAdmin ? (
                    <Link
                      href="/admin"
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-11 w-full justify-start px-3 text-sm")}
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Admin
                    </Link>
                  ) : null}

                  {isLoading ? (
                    <div className="inline-flex min-h-11 w-full items-center rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.72)] px-3 text-sm text-[color:var(--muted)]">
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      Loading account...
                    </div>
                  ) : isAuthenticated ? (
                    <Link
                      href="/settings/notifications"
                      onClick={() => setMobileMenuOpen(false)}
                      className="inline-flex min-h-11 w-full items-center rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.72)] px-3 text-sm text-[var(--fg)]"
                    >
                      <User className="mr-2 h-4 w-4" />
                      Account
                    </Link>
                  ) : (
                    <Link
                      href="/auth"
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "min-h-11 w-full justify-start px-3 text-sm")}
                    >
                      <User className="mr-2 h-4 w-4" />
                      Log in
                    </Link>
                  )}

                  {isAuthenticated ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 w-full justify-start px-3 text-sm text-rose-400 hover:text-rose-300"
                      onClick={() => void handleLogout()}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Log out
                    </Button>
                  ) : null}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">{children}</main>
      <footer className="mx-auto w-full max-w-7xl px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2 text-center text-xs text-[color:var(--muted)] opacity-60 sm:px-6 lg:px-8">
        Created by Jainy Patel
      </footer>
      <WeatherPanel />
      <AddToHomeScreenModal />
    </div>
  );
}
