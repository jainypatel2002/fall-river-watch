"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiToast } from "@/hooks/use-ui-toast";
import { useGroupDetailQuery, useGroupJoinRequestsQuery, useRespondToGroupRequestMutation } from "@/lib/queries/groups";

export function GroupRequestsPanel({ slug }: { slug: string }) {
  const toast = useUiToast();
  const detailQuery = useGroupDetailQuery(slug);
  const canManage = detailQuery.data?.can_manage ?? false;

  const requestsQuery = useGroupJoinRequestsQuery(slug, canManage);
  const respondMutation = useRespondToGroupRequestMutation(slug);

  if (detailQuery.isLoading) {
    return <Skeleton className="h-52" />;
  }

  if (!detailQuery.data) {
    return <p className="text-sm text-rose-200">Group not found.</p>;
  }

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not authorized</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[color:var(--muted)]">Only group managers and moderators can review requests.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
          Join Requests
        </h1>
        <Link href={`/groups/${slug}`} className="text-sm text-[color:var(--muted)] underline underline-offset-4">
          Back to group
        </Link>
      </div>

      {requestsQuery.isLoading ? <Skeleton className="h-28" /> : null}

      {requestsQuery.isError ? (
        <p className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">{(requestsQuery.error as Error).message}</p>
      ) : null}

      {!requestsQuery.isLoading && !(requestsQuery.data?.requests.length ?? 0) ? (
        <p className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.76)] p-3 text-sm text-[color:var(--muted)]">No pending requests.</p>
      ) : null}

      <div className="space-y-3">
        {(requestsQuery.data?.requests ?? []).map((request) => (
          <div key={request.user_id} className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.78)] p-3">
            <p className="text-sm font-semibold text-[var(--fg)]">{request.display_name}</p>
            <p className="text-xs text-[color:var(--muted)]">Requested {new Date(request.created_at).toLocaleString()}</p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={respondMutation.isPending}
                onClick={async () => {
                  try {
                    await respondMutation.mutateAsync({ userId: request.user_id, decision: "accept" });
                    toast.success("Request accepted");
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={respondMutation.isPending}
                onClick={async () => {
                  try {
                    await respondMutation.mutateAsync({ userId: request.user_id, decision: "reject" });
                    toast.success("Request rejected");
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
              >
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
