"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useRole } from "@/hooks/use-role";
import { useUiToast } from "@/hooks/use-ui-toast";
import { leaveGroup, requestFollowGroup } from "@/lib/api/groups";
import { useGroupsQuery } from "@/lib/queries/groups";

function visibilityBadge(value: "public" | "private") {
  return value === "private"
    ? "border-amber-400/50 bg-amber-400/15 text-amber-100"
    : "border-emerald-400/50 bg-emerald-400/15 text-emerald-100";
}

export function GroupsShell() {
  const role = useRole();
  const toast = useUiToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const groupsQuery = useGroupsQuery(search);

  const ownedGroups = useMemo(() => {
    if (!role.user) return 0;
    return (groupsQuery.data?.groups ?? []).filter((group) => group.owner_user_id === role.user?.id).length;
  }, [groupsQuery.data?.groups, role.user]);

  const blockedByLimit = !role.isMod && ownedGroups >= 1;
  const followedGroups = useMemo(
    () => (groupsQuery.data?.groups ?? []).filter((group) => group.membership?.status === "accepted"),
    [groupsQuery.data?.groups]
  );

  const requestMutation = useMutation({
    mutationFn: (slug: string) => requestFollowGroup(slug),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success(result.membership.status === "accepted" ? "Now following group" : "Request sent");
    },
    onError: (error) => {
      toast.error((error as Error).message);
    }
  });

  const leaveMutation = useMutation({
    mutationFn: (slug: string) => leaveGroup(slug),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success("Unfollowed group");
    },
    onError: (error) => {
      toast.error((error as Error).message);
    }
  });

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-heading)" }}>
            Groups
          </h1>
          <p className="text-sm text-[color:var(--muted)]">Discover neighborhood groups and follow to unlock posts, members, and anonymous chat.</p>
        </div>

        <Link href="/groups/new">
          <Button className="min-h-11" disabled={blockedByLimit} title={blockedByLimit ? "You already own one group" : undefined}>
            Create group
          </Button>
        </Link>
      </div>

      {blockedByLimit ? (
        <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
          You already own one group. Upgrade permissions to moderator for unlimited group creation.
        </p>
      ) : null}

      <div className="rounded-2xl border border-[var(--border)] bg-[rgba(9,14,27,0.9)] p-3">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search groups" className="h-11" />
      </div>

      {followedGroups.length ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.76)] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cyan-300/90">Followed</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {followedGroups.map((group) => (
              <Link key={group.id} href={`/groups/${group.slug}`}>
                <Button size="sm" variant="outline">
                  {group.name}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {groupsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : null}

      {groupsQuery.isError ? (
        <p className="rounded-2xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">{(groupsQuery.error as Error).message}</p>
      ) : null}

      {!groupsQuery.isLoading && !(groupsQuery.data?.groups.length ?? 0) ? (
        <p className="rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.76)] p-4 text-sm text-[color:var(--muted)]">No groups yet.</p>
      ) : null}

      <div className="space-y-3">
        {(groupsQuery.data?.groups ?? []).map((group) => {
          const membership = group.membership;
          const pending = requestMutation.isPending && requestMutation.variables === group.slug;
          const leaving = leaveMutation.isPending && leaveMutation.variables === group.slug;
          const isBusy = pending || leaving;

          let actionLabel = group.visibility === "public" ? "Follow" : "Request access";
          let actionDisabled = false;
          let actionType: "join" | "leave" | "none" = "join";

          if (membership?.status === "pending") {
            actionLabel = "Pending";
            actionDisabled = true;
            actionType = "none";
          } else if (membership?.status === "accepted") {
            if (membership.role === "owner") {
              actionLabel = "Owner";
              actionDisabled = true;
              actionType = "none";
            } else {
              actionLabel = "Unfollow";
              actionDisabled = false;
              actionType = "leave";
            }
          }

          return (
            <div
              key={group.id}
              className="rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.78)] p-4 transition-all duration-300 hover:border-[rgba(113,138,191,0.52)] hover:-translate-y-0.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/groups/${group.slug}`} className="text-lg font-semibold text-[var(--fg)] hover:underline">
                    {group.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${visibilityBadge(group.visibility)}`}>
                      {group.visibility}
                    </span>
                    <span className="text-xs text-[color:var(--muted)]">{group.accepted_members} members</span>
                  </div>
                  {group.description ? <p className="mt-2 text-sm text-[color:var(--muted)]">{group.description}</p> : null}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant={actionType === "leave" ? "outline" : "default"}
                    disabled={actionDisabled || isBusy}
                    onClick={() => {
                      if (actionType === "join") {
                        requestMutation.mutate(group.slug);
                      }
                      if (actionType === "leave") {
                        leaveMutation.mutate(group.slug);
                      }
                    }}
                  >
                    {isBusy ? "Working..." : actionLabel}
                  </Button>

                  <Link href={`/groups/${group.slug}`}>
                    <Button variant="ghost">Open</Button>
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
