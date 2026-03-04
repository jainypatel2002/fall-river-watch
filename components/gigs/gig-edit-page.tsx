"use client";

import Link from "next/link";
import { GigForm } from "@/components/gigs/gig-form";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRole } from "@/hooks/use-role";
import { useGigDetailQuery } from "@/lib/queries/gigs";

export function GigEditPage({ gigId }: { gigId: string }) {
  const { user } = useCurrentUser();
  const role = useRole();
  const detailQuery = useGigDetailQuery(gigId, user?.id ?? null);

  if (detailQuery.isLoading) {
    return <Skeleton className="h-64" />;
  }

  if (detailQuery.isError || !detailQuery.data?.gig) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
          {(detailQuery.error as Error)?.message ?? "Gig not found"}
        </p>
        <Link href="/gigs" className="text-sm text-[color:var(--muted)] underline underline-offset-4">
          Back to gigs
        </Link>
      </div>
    );
  }

  const gig = detailQuery.data.gig;
  const canManage = Boolean(user && (gig.creator_user_id === user.id || role.isMod));

  if (!canManage) {
    return (
      <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
        You can only edit your own gigs unless you are a moderator/admin.
      </p>
    );
  }

  return <GigForm mode="edit" gigId={gigId} initialGig={gig} initialMedia={detailQuery.data.media} />;
}
