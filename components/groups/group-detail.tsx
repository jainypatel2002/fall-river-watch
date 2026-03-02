"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useGroupMembership } from "@/hooks/use-membership";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";
import { useUiToast } from "@/hooks/use-ui-toast";
import {
  useCreateGroupPostMutation,
  useDeleteGroupPostMutation,
  useGroupAnonIdentityQuery,
  useGroupChatQuery,
  useGroupDetailQuery,
  useGroupMembersQuery,
  useGroupPreferencesQuery,
  useGroupPostsQuery,
  useLeaveGroupMutation,
  useRequestFollowGroupMutation,
  useSendGroupChatMessageMutation,
  useUpsertGroupPreferencesMutation
} from "@/lib/queries/groups";
import { queryKeys } from "@/lib/queries/keys";

function shortDate(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function GroupDetail({
  slug,
  initialTab = "posts"
}: {
  slug: string;
  initialTab?: "posts" | "chat" | "members";
}) {
  const supabase = useSupabaseBrowser();
  const toast = useUiToast();
  const queryClient = useQueryClient();
  const detailQuery = useGroupDetailQuery(slug);

  const [activeTab, setActiveTab] = useState<"posts" | "chat" | "members">(initialTab);
  const [chatMessage, setChatMessage] = useState("");
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [postAnonymous, setPostAnonymous] = useState(false);
  const [deletePostId, setDeletePostId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const requestMutation = useRequestFollowGroupMutation(slug);
  const leaveMutation = useLeaveGroupMutation(slug);
  const createPostMutation = useCreateGroupPostMutation(slug);
  const deletePostMutation = useDeleteGroupPostMutation(slug);
  const sendMessageMutation = useSendGroupChatMessageMutation(slug);
  const updatePreferencesMutation = useUpsertGroupPreferencesMutation(slug);

  const groupId = detailQuery.data?.group.id ?? "";
  const membershipState = useGroupMembership(groupId);
  const effectiveMembership = membershipState.membership ?? detailQuery.data?.membership ?? null;
  const canManage = detailQuery.data?.can_manage ?? false;
  const canAccessGroupContent = useMemo(
    () =>
      Boolean(
        groupId &&
          (detailQuery.data?.can_view_content || canManage || effectiveMembership?.status === "accepted")
      ),
    [canManage, detailQuery.data?.can_view_content, effectiveMembership?.status, groupId]
  );

  const postsQuery = useGroupPostsQuery(slug, canAccessGroupContent);
  const membersQuery = useGroupMembersQuery(slug, canAccessGroupContent && activeTab === "members");
  const chatQuery = useGroupChatQuery(slug, canAccessGroupContent && activeTab === "chat");
  const preferencesQuery = useGroupPreferencesQuery(slug, canAccessGroupContent);
  const chatAnonymousEnabled = preferencesQuery.data?.preferences.chat_anonymous ?? true;
  const postAnonymousDefault = preferencesQuery.data?.preferences.post_anonymous ?? false;
  const displayName = preferencesQuery.data?.display_name ?? "Member";
  const identityQuery = useGroupAnonIdentityQuery(slug, canAccessGroupContent && activeTab === "chat" && chatAnonymousEnabled);

  useEffect(() => {
    if (!canAccessGroupContent || !groupId) return;

    const channel = supabase
      .channel(`group-chat-${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_chat_messages", filter: `group_id=eq.${groupId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.groupChat(slug) });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canAccessGroupContent, groupId, queryClient, slug, supabase]);

  if (detailQuery.isLoading) {
    return <Skeleton className="h-64" />;
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unable to load group</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-rose-200">{(detailQuery.error as Error)?.message ?? "Group not found"}</CardContent>
      </Card>
    );
  }

  const { group, accepted_members: acceptedMembers } = detailQuery.data;
  const followStatus = effectiveMembership?.status ?? "none";

  if (!canAccessGroupContent) {
    return (
      <Card>
        <CardHeader className="space-y-2">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-100">
            <Lock className="h-3.5 w-3.5" />
            Locked group
          </div>
          <CardTitle style={{ fontFamily: "var(--font-heading)" }}>{group.name}</CardTitle>
          <p className="text-sm text-[color:var(--muted)]">
            {group.visibility} group · {acceptedMembers} members
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {group.description ? <p className="text-sm text-[color:var(--muted)]">{group.description}</p> : null}
          {followStatus === "pending" ? (
            <p className="rounded-xl border border-amber-400/35 bg-amber-400/10 p-3 text-sm text-amber-100">Pending approval</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={followStatus === "pending" || requestMutation.isPending}
              onClick={async () => {
                try {
                  await requestMutation.mutateAsync();
                  toast.success(group.visibility === "private" ? "Follow request sent" : "Now following this group");
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}
            >
              {followStatus === "pending" ? "Pending" : group.visibility === "private" ? "Request access" : "Follow"}
            </Button>
            <Link href="/groups">
              <Button variant="outline">Back to groups</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const deleteAllowed = deleteConfirmText.trim() === "DELETE";
  const preferencesBusy = preferencesQuery.isLoading || updatePreferencesMutation.isPending;

  const updatePrivacyPreference = async (patch: { post_anonymous?: boolean; chat_anonymous?: boolean }) => {
    try {
      await updatePreferencesMutation.mutateAsync(patch);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.84)] p-4 transition-all duration-300">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
              {group.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5">{group.visibility}</span>
              <span>{acceptedMembers} members</span>
            </div>
            {group.description ? <p className="mt-2 text-sm text-[color:var(--muted)]">{group.description}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {effectiveMembership?.status === "accepted" && effectiveMembership.role !== "owner" ? (
              <Button
                variant="outline"
                disabled={leaveMutation.isPending}
                onClick={async () => {
                  try {
                    await leaveMutation.mutateAsync();
                    toast.success("Unfollowed group");
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
              >
                Unfollow
              </Button>
            ) : null}

            {canManage ? (
              <>
                <Link href={`/groups/${slug}/settings`}>
                  <Button variant="outline">Settings</Button>
                </Link>
                <Link href={`/groups/${slug}/requests`}>
                  <Button variant="outline">Requests</Button>
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Privacy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.52)] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-[var(--fg)]">Post anonymously</p>
              <p className="text-xs text-[color:var(--muted)]">New group posts will use your Neighbor alias.</p>
            </div>
            <Switch
              checked={postAnonymousDefault}
              onCheckedChange={(next) => {
                void updatePrivacyPreference({ post_anonymous: next });
              }}
              disabled={preferencesBusy}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.52)] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-[var(--fg)]">Chat anonymously</p>
              <p className="text-xs text-[color:var(--muted)]">When off, chat uses your display name ({displayName}).</p>
            </div>
            <Switch
              checked={chatAnonymousEnabled}
              onCheckedChange={(next) => {
                void updatePrivacyPreference({ chat_anonymous: next });
              }}
              disabled={preferencesBusy}
            />
          </div>

          {preferencesQuery.isError ? (
            <p className="text-xs text-rose-200">{(preferencesQuery.error as Error).message}</p>
          ) : null}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "posts" | "chat" | "members")}> 
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-3">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setPostAnonymous(postAnonymousDefault);
                setCreatePostOpen(true);
              }}
            >
              Create Post
            </Button>
          </div>

          {postsQuery.isLoading ? <Skeleton className="h-28" /> : null}
          {postsQuery.isError ? (
            <p className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">{(postsQuery.error as Error).message}</p>
          ) : null}
          {!postsQuery.isLoading && !(postsQuery.data?.posts.length ?? 0) ? (
            <p className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.76)] p-3 text-sm text-[color:var(--muted)]">No group posts yet.</p>
          ) : null}
          {(postsQuery.data?.posts ?? []).map((post) => (
            <div key={post.id} className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.78)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--fg)]">{post.title || "Group post"}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[color:var(--muted)]">{post.content}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-[color:var(--muted)]">
                    <span>{post.author_display_name}</span>
                    {post.is_anonymous ? (
                      <span className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-2 py-0.5 text-[10px] text-cyan-100">
                        Anonymous
                      </span>
                    ) : null}
                    <span>· {shortDate(post.created_at)}</span>
                  </div>
                </div>

                {post.can_manage ? (
                  <Button variant="ghost" size="icon" onClick={() => setDeletePostId(post.id)} aria-label="Delete post">
                    <Trash2 className="h-4 w-4 text-rose-300" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="chat" className="space-y-3">
          <div className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.76)] p-3 text-xs text-[color:var(--muted)]">
            {chatAnonymousEnabled
              ? identityQuery.isLoading
                ? "Preparing anonymous identity..."
                : `Chatting as ${identityQuery.data?.anon_name ?? "Neighbor"} (Anonymous)`
              : `Chatting as ${displayName}`}
          </div>

          <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.76)] p-3">
            {chatQuery.isLoading ? <Skeleton className="h-24" /> : null}
            {!chatQuery.isLoading && !(chatQuery.data?.messages.length ?? 0) ? (
              <p className="text-sm text-[color:var(--muted)]">No chat messages yet.</p>
            ) : null}
            {(chatQuery.data?.messages ?? []).map((message) => (
              <div key={message.id} className="rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.78)] p-2.5">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-medium text-cyan-200">{message.anon_name}</p>
                  {message.is_anonymous ? (
                    <span className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-2 py-0.5 text-[10px] text-cyan-100">
                      Anonymous
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-[var(--fg)]">{message.message}</p>
                <p className="text-[11px] text-[color:var(--muted)]">{shortDate(message.created_at)}</p>
              </div>
            ))}
          </div>

          <form
            className="flex items-center gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const next = chatMessage.trim();
              if (!next) return;

              const isAnonymous = chatAnonymousEnabled;
              const anonName = isAnonymous ? identityQuery.data?.anon_name ?? null : null;
              if (isAnonymous && !anonName) return;

              try {
                await sendMessageMutation.mutateAsync({
                  message: next,
                  is_anonymous: isAnonymous,
                  anon_name: anonName
                });
                setChatMessage("");
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            <Input value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} placeholder="Write a message" />
            <Button type="submit" disabled={sendMessageMutation.isPending || (chatAnonymousEnabled && !identityQuery.data?.anon_name)}>
              <Send className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="members" className="space-y-3">
          {membersQuery.isLoading ? <Skeleton className="h-24" /> : null}
          {membersQuery.isError ? (
            <p className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">{(membersQuery.error as Error).message}</p>
          ) : null}
          {!membersQuery.isLoading && !(membersQuery.data?.members.length ?? 0) ? (
            <p className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.76)] p-3 text-sm text-[color:var(--muted)]">No members yet.</p>
          ) : null}

          {(membersQuery.data?.members ?? []).map((member) => (
            <div key={member.user_id} className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.78)] p-3">
              <p className="text-sm font-semibold text-[var(--fg)]">{member.display_name}</p>
              <p className="text-xs text-[color:var(--muted)]">{member.role}</p>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog
        open={createPostOpen}
        onOpenChange={(open) => {
          if (createPostMutation.isPending) return;
          setCreatePostOpen(open);
          if (!open) {
            setPostTitle("");
            setPostContent("");
            setPostAnonymous(postAnonymousDefault);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create group post</DialogTitle>
            <DialogDescription>Posts stay inside this group and never appear in Reports.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input value={postTitle} onChange={(event) => setPostTitle(event.target.value)} placeholder="Title (optional)" />
            <Textarea
              rows={5}
              value={postContent}
              onChange={(event) => setPostContent(event.target.value)}
              placeholder="Share an update"
            />
            <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.52)] px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-[var(--fg)]">Post anonymously</p>
                <p className="text-xs text-[color:var(--muted)]">Uses your group alias instead of your display name.</p>
              </div>
              <Switch checked={postAnonymous} onCheckedChange={setPostAnonymous} disabled={createPostMutation.isPending} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreatePostOpen(false)} disabled={createPostMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createPostMutation.isPending || !postContent.trim().length}
              onClick={async () => {
                try {
                  await createPostMutation.mutateAsync({
                    title: postTitle.trim() || null,
                    content: postContent,
                    is_anonymous: postAnonymous
                  });
                  toast.success("Post created");
                  setCreatePostOpen(false);
                  setPostTitle("");
                  setPostContent("");
                  setPostAnonymous(postAnonymousDefault);
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}
            >
              Create post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deletePostId)}
        onOpenChange={(open) => {
          if (deletePostMutation.isPending) return;
          if (!open) {
            setDeletePostId(null);
            setDeleteConfirmText("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <DialogDescription>This action is permanent. Type DELETE to confirm.</DialogDescription>
          </DialogHeader>

          <Input value={deleteConfirmText} onChange={(event) => setDeleteConfirmText(event.target.value)} placeholder="Type DELETE" />

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDeletePostId(null);
                setDeleteConfirmText("");
              }}
              disabled={deletePostMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteAllowed || !deletePostId || deletePostMutation.isPending}
              onClick={async () => {
                if (!deletePostId) return;
                try {
                  await deletePostMutation.mutateAsync(deletePostId);
                  toast.success("Post deleted");
                  setDeletePostId(null);
                  setDeleteConfirmText("");
                } catch (error) {
                  if (process.env.NODE_ENV !== "production") {
                    const parsed = error as Error & { status?: number; payload?: unknown };
                    console.log("[group-post-delete] ui delete failed", {
                      status: parsed.status,
                      message: parsed.message,
                      payload: parsed.payload
                    });
                  }
                  toast.error((error as Error).message);
                }
              }}
            >
              Delete post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
