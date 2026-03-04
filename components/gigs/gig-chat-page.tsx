"use client";

import Link from "next/link";
import { GigChat } from "@/components/gigs/gig-chat";
import { Skeleton } from "@/components/ui/skeleton";
import { useGigChatThreadQuery } from "@/lib/queries/gigs";

export function GigChatPage({ threadId }: { threadId: string }) {
  const threadQuery = useGigChatThreadQuery(threadId);

  if (threadQuery.isLoading) {
    return <Skeleton className="h-64" />;
  }

  if (threadQuery.isError || !threadQuery.data) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
          {(threadQuery.error as Error)?.message ?? "Chat thread not found"}
        </p>
        <Link href="/gigs" className="text-sm text-[color:var(--muted)] underline underline-offset-4">
          Back to gigs
        </Link>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl" style={{ fontFamily: "var(--font-heading)" }}>
          Gig Chat
        </h1>
        <Link href={`/gigs/${threadQuery.data.gig_id}`} className="text-sm text-[color:var(--muted)] underline underline-offset-4">
          Back to gig
        </Link>
      </div>
      <GigChat threadId={threadId} />
    </section>
  );
}
