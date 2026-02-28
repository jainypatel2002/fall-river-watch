"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { LoaderCircle, MessageCircle, Reply, ShieldAlert, Trash2, ChevronDown, ChevronRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";
import { useUiToast } from "@/hooks/use-ui-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  type IncidentComment,
  useCommentRepliesQuery,
  useCreateIncidentCommentMutation,
  useDeleteCommentMutation,
  useIncidentCommentsQuery,
  useReportCommentMutation,
  uploadEvidenceFileWithSignedUrl
} from "@/lib/queries/incidents";
import { formatRelativeTime } from "@/lib/utils/format";

type PendingComment = {
  id: string;
  parent_id: string | null;
  body: string;
  is_anonymous: boolean;
  created_at: string;
  attachments: Array<{ id: string; signedUrl: string; mime_type: string; byte_size: number | null }>;
};

type TypingState = {
  userId: string;
  displayName: string;
  isTyping: boolean;
  lastTypedAt: number;
};

function ReplyThread({
  parentComment,
  incidentId,
  deletedIds,
  onDelete,
  onReport,
  onSubmitReply,
  pendingReplies,
  canWrite,
  onTypingStart,
  onTypingStop
}: {
  parentComment: IncidentComment;
  incidentId: string;
  deletedIds: Set<string>;
  onDelete: (commentId: string) => void;
  onReport: (commentId: string) => void;
  onSubmitReply: (payload: { parentId: string; body: string; isAnonymous: boolean }) => Promise<void>;
  pendingReplies: PendingComment[];
  canWrite: boolean;
  onTypingStart: () => void;
  onTypingStop: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState<boolean>(!parentComment.replyCount || parentComment.replyCount <= 2);
  const [replyBody, setReplyBody] = useState("");
  const [replyAnonymous, setReplyAnonymous] = useState(false);
  const [isReplying, setIsReplying] = useState(false);

  // Focus tracking for typing indicator
  useEffect(() => {
    if (replyBody) {
      onTypingStart();
      const timeout = setTimeout(() => {
        onTypingStop();
      }, 1500);
      return () => clearTimeout(timeout);
    } else {
      onTypingStop();
    }
  }, [replyBody, onTypingStart, onTypingStop]);

  const repliesQuery = useCommentRepliesQuery(parentComment.id, 20, isExpanded);
  const serverReplies = repliesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const visibleReplies = serverReplies.filter((reply) => !deletedIds.has(reply.id));

  // Sort visible replies ascending (oldest first)
  const sortedVisibleReplies = [...visibleReplies].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  async function submitReply() {
    const body = replyBody.trim();
    if (!body) return;

    onTypingStop();
    await onSubmitReply({
      parentId: parentComment.id,
      body,
      isAnonymous: replyAnonymous
    });

    setReplyBody("");
    setReplyAnonymous(false);
    setIsReplying(false);
    setIsExpanded(true);
  }

  const hasReplies = parentComment.replyCount && parentComment.replyCount > 0;
  const showRepliesCount = parentComment.replyCount && parentComment.replyCount > 0 ? parentComment.replyCount + pendingReplies.length : pendingReplies.length;

  return (
    <div className="mt-2 text-sm text-[var(--fg)]">
      {/* Top level comment Body */}
      <p className="mt-1">{parentComment.body}</p>

      {parentComment.attachments && parentComment.attachments.length > 0 ? (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {parentComment.attachments.map((attachment) => (
            <img key={attachment.id} src={attachment.signedUrl} alt="comment-attachment" className="h-24 w-full rounded-lg object-cover" />
          ))}
        </div>
      ) : null}

      {/* Action Row */}
      <div className="mt-2 flex items-center gap-4 text-xs text-[color:var(--muted)]">
        {canWrite && (
          <button type="button" onClick={() => setIsReplying(!isReplying)} className="hover:text-[var(--fg)] transition-colors">
            Reply
          </button>
        )}
        {(hasReplies || pendingReplies.length > 0) && (
          <button type="button" onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-1 hover:text-[var(--fg)] transition-colors">
            {isExpanded ? "Collapse thread" : `View ${showRepliesCount} replies`}
          </button>
        )}
        {parentComment.is_owner ? (
          <button type="button" onClick={() => onDelete(parentComment.id)} className="hover:text-[var(--fg)] transition-colors">
            Delete
          </button>
        ) : null}
        {canWrite && !parentComment.is_owner ? (
          <button type="button" onClick={() => onReport(parentComment.id)} className="hover:text-[var(--fg)] transition-colors">
            Report
          </button>
        ) : null}
      </div>

      {isReplying && canWrite ? (
        <div className="mt-3 flex gap-2">
          {/* subtle line to left */}
          <div className="ml-2 border-l border-[var(--border)] pl-3 flex-1 space-y-2">
            <Textarea
              placeholder="Write a reply..."
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              className="min-h-10 resize-none py-2 text-sm"
              rows={1}
              onFocus={() => { /* grow textarea logic if needed, but min-h-10 expands organically */ }}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Switch checked={replyAnonymous} onCheckedChange={setReplyAnonymous} id={`reply-anon-${parentComment.id}`} />
                <Label htmlFor={`reply-anon-${parentComment.id}`} className="text-xs text-[color:var(--muted)]">
                  Reply anonymously
                </Label>
              </div>
              <Button type="button" size="sm" className="h-7 px-3 text-xs" onClick={() => void submitReply()} disabled={!replyBody.trim()}>
                Post
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isExpanded && (sortedVisibleReplies.length > 0 || pendingReplies.length > 0) ? (
        <div className="mt-3 ml-2 space-y-3 border-l-2 border-[var(--border)/40] pl-4">
          {repliesQuery.isLoading ? <p className="text-xs text-[color:var(--muted)]">Loading replies...</p> : null}

          {sortedVisibleReplies.map((reply) => (
            <div key={reply.id} className="group">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 shrink-0 rounded-full bg-[var(--muted)]/20 flex items-center justify-center">
                    <User className="h-3 w-3 text-[var(--muted)]" />
                  </div>
                  <p className="text-xs text-[color:var(--muted)]">
                    <span className="font-medium text-[var(--fg)]">{reply.author_display_name}</span> · {formatRelativeTime(reply.created_at)}
                  </p>
                </div>
              </div>

              <p className="mt-1 ml-7 text-sm text-[var(--fg)]">{reply.body}</p>

              {reply.attachments && reply.attachments.length > 0 ? (
                <div className="mt-2 ml-7 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {reply.attachments.map((attachment) => (
                    <img key={attachment.id} src={attachment.signedUrl} alt="reply-attachment" className="h-20 w-full rounded-lg object-cover" />
                  ))}
                </div>
              ) : null}

              <div className="mt-1 ml-7 flex items-center gap-3 text-[11px] text-[color:var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                {reply.is_owner ? (
                  <button type="button" onClick={() => onDelete(reply.id)} className="hover:text-[var(--fg)]">
                    Delete
                  </button>
                ) : null}
                {canWrite && !reply.is_owner ? (
                  <button type="button" onClick={() => onReport(reply.id)} className="hover:text-[var(--fg)]">
                    Report
                  </button>
                ) : null}
              </div>
            </div>
          ))}

          {pendingReplies.map((pending) => (
            <div key={pending.id} className="opacity-70">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 shrink-0 rounded-full bg-[var(--muted)]/20 flex items-center justify-center">
                  <User className="h-3 w-3 text-[var(--muted)]" />
                </div>
                <p className="text-xs text-[color:var(--muted)]">
                  <span className="font-medium text-[var(--fg)]">Sending...</span>
                </p>
              </div>
              <p className="mt-1 ml-7 text-sm text-[var(--fg)]">{pending.body}</p>
            </div>
          ))}

          {repliesQuery.hasNextPage ? (
            <Button type="button" variant="ghost" size="sm" className="ml-7 h-6 px-2 text-[11px]" onClick={() => void repliesQuery.fetchNextPage()} disabled={repliesQuery.isFetchingNextPage}>
              {repliesQuery.isFetchingNextPage ? <LoaderCircle className="mr-1 h-3 w-3 animate-spin" /> : <ChevronDown className="mr-1 h-3 w-3" />}
              Load older replies
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function IncidentDiscussion({ incidentId, topLevelCount }: { incidentId: string; topLevelCount: number }) {
  const supabase = useSupabaseBrowser();
  const uiToast = useUiToast();
  const queryClient = useQueryClient();

  const commentsQuery = useIncidentCommentsQuery(incidentId, 20);
  const createCommentMutation = useCreateIncidentCommentMutation(incidentId);
  const deleteCommentMutation = useDeleteCommentMutation(incidentId);
  const reportCommentMutation = useReportCommentMutation();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null);

  const [body, setBody] = useState("");
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const [anonymous, setAnonymous] = useState(false);

  const [pendingComments, setPendingComments] = useState<PendingComment[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<Array<{ id: string; previewUrl: string }>>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);

  // Typing indicator state
  const [activeTypers, setActiveTypers] = useState<TypingState[]>([]);

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(async (result: { data: { user: any } }) => {
      if (!active) return;
      const user = result.data?.user;
      setIsAuthenticated(Boolean(user));

      if (user) {
        // Fetch profile to broadcast real display name
        const { data: profileData } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
        setCurrentUser({
          id: user.id,
          name: profileData?.display_name || "Neighbor"
        });
      }
    });

    return () => {
      active = false;
    };
  }, [supabase]);

  // Realtime comments & presence
  useEffect(() => {
    if (!incidentId) return;

    const channel = supabase.channel(`report:${incidentId}:comments`, {
      config: {
        presence: { key: currentUser?.id || "anon" }
      }
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState() as Record<string, TypingState[]>;
        const typers: TypingState[] = [];

        for (const key in presenceState) {
          presenceState[key].forEach((presence: TypingState) => {
            if (presence.isTyping && presence.userId !== currentUser?.id) {
              typers.push(presence);
            }
          });
        }

        // Keep unique typers
        const uniqueTypers = typers.filter((v, i, a) => a.findIndex((t) => (t.userId === v.userId)) === i);
        setActiveTypers(uniqueTypers);
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "incident_comments", filter: `incident_id=eq.${incidentId}` },
        (payload: any) => {
          const newComment = payload.new;

          // Avoid duplicating our own optimistic insertions.
          // Because pending insertions have UUID format ids that won't match, we rely on avoiding duplicates by user_id & recent timestamp,
          // or ideally, we check if the ID already exists in cache.

          if (!newComment.parent_id) {
            // It's a top-level comment
            queryClient.invalidateQueries({ queryKey: ["incident-comments", incidentId] });
            queryClient.invalidateQueries({ queryKey: ["incident-detail", incidentId] });
          } else {
            // It's a reply
            queryClient.invalidateQueries({ queryKey: ["comment-replies", newComment.parent_id] });
          }
        }
      )
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED" && currentUser) {
          await channel.track({
            userId: currentUser.id,
            displayName: currentUser.name,
            isTyping: false,
            lastTypedAt: Date.now()
          });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [incidentId, supabase, queryClient, currentUser]);

  const broadcastTyping = useCallback(async (isTyping: boolean) => {
    if (!currentUser) return;
    const channel = supabase.channel(`report:${incidentId}:comments`);
    if (channel.state === "joined") {
      await channel.track({
        userId: currentUser.id,
        displayName: currentUser.name,
        isTyping,
        lastTypedAt: Date.now()
      });
    }
  }, [currentUser, incidentId, supabase]);

  // Main composer focus/typing tracking
  useEffect(() => {
    if (body) {
      void broadcastTyping(true);
      const timeout = setTimeout(() => {
        void broadcastTyping(false);
      }, 1500);
      return () => clearTimeout(timeout);
    } else {
      void broadcastTyping(false);
    }
  }, [body, broadcastTyping]);

  const typingText = useMemo(() => {
    if (activeTypers.length === 0) return null;
    if (activeTypers.length === 1) return `${activeTypers[0].displayName} is typing...`;
    if (activeTypers.length === 2) return `${activeTypers[0].displayName} and ${activeTypers[1].displayName} are typing...`;
    return `${activeTypers[0].displayName} and ${activeTypers.length - 1} others are typing...`;
  }, [activeTypers]);

  const serverComments = commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const visibleServerComments = serverComments.filter((comment) => !deletedIds.has(comment.id));
  const pendingTopLevel = pendingComments.filter((comment) => comment.parent_id === null);

  const totalVisibleComments = useMemo(() => {
    return Math.max(0, topLevelCount - deletedIds.size) + pendingTopLevel.length;
  }, [deletedIds.size, pendingTopLevel.length, topLevelCount]);

  async function submitComment(payload: { parentId?: string; body: string; isAnonymous: boolean }) {
    const trimmedBody = payload.body.trim();
    if (!trimmedBody) return;

    void broadcastTyping(false);

    const tempId = `pending-${crypto.randomUUID()}`;
    const pending: PendingComment = {
      id: tempId,
      parent_id: payload.parentId ?? null,
      body: trimmedBody,
      is_anonymous: payload.isAnonymous,
      created_at: new Date().toISOString(),
      attachments: attachmentPreviews.map((item) => ({
        id: item.id,
        signedUrl: item.previewUrl,
        mime_type: "image/*",
        byte_size: null
      }))
    };

    setPendingComments((current) => [pending, ...current]);

    try {
      await createCommentMutation.mutateAsync({
        body: trimmedBody,
        is_anonymous: payload.isAnonymous,
        parent_id: payload.parentId ?? null,
        attachmentIds: payload.parentId ? [] : attachmentIds
      });

      if (!payload.parentId) {
        setBody("");
        setAnonymous(false);
        setIsComposerExpanded(false);
        setAttachmentIds([]);
        for (const preview of attachmentPreviews) {
          URL.revokeObjectURL(preview.previewUrl);
        }
        setAttachmentPreviews([]);
      }
    } catch (error) {
      uiToast.error(error instanceof Error ? error.message : "Failed to post comment");
    } finally {
      setPendingComments((current) => current.filter((item) => item.id !== tempId));
    }
  }

  async function handleDelete(commentId: string) {
    setDeletedIds((current) => {
      const next = new Set(current);
      next.add(commentId);
      return next;
    });

    try {
      await deleteCommentMutation.mutateAsync(commentId);
      uiToast.success("Comment deleted");
    } catch (error) {
      setDeletedIds((current) => {
        const next = new Set(current);
        next.delete(commentId);
        return next;
      });
      uiToast.error(error instanceof Error ? error.message : "Failed to delete comment");
    }
  }

  async function handleReport(commentId: string) {
    if (!isAuthenticated) {
      uiToast.info("Sign in required", "Please sign in to report this comment.");
      return;
    }

    try {
      await reportCommentMutation.mutateAsync({ commentId });
      uiToast.success("Comment reported");
    } catch (error) {
      uiToast.error(error instanceof Error ? error.message : "Failed to report comment");
    }
  }

  async function handleFileChange(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    if (!isAuthenticated) {
      uiToast.info("Sign in required", "You need to sign in before uploading evidence.");
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      uiToast.error("Unsupported file type", "Only JPEG, PNG, and WEBP are allowed.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      uiToast.error("File too large", "Max file size is 8 MB.");
      return;
    }

    setIsUploadingAttachment(true);
    setIsComposerExpanded(true); // ensure composer is open while uploading

    try {
      const attachmentId = await uploadEvidenceFileWithSignedUrl({
        scope: "incident",
        incidentId,
        file
      });

      const previewUrl = URL.createObjectURL(file);
      setAttachmentIds((current) => [...current, attachmentId]);
      setAttachmentPreviews((current) => [...current, { id: attachmentId, previewUrl }]);
      uiToast.success("Evidence uploaded");
    } catch (error) {
      uiToast.error(error instanceof Error ? error.message : "Failed to upload evidence");
    } finally {
      setIsUploadingAttachment(false);
    }
  }

  return (
    <section className="space-y-4 pt-4 border-t border-[var(--border)] max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
          Discussion <span className="text-sm font-normal text-[color:var(--muted)] ml-2">{totalVisibleComments} comments</span>
        </h2>
        <div className="flex items-center gap-1 text-[11px] text-[color:var(--muted)]/70 cursor-default">
          <span className="font-medium text-[var(--fg)]">Newest</span> | <span>Oldest</span>
        </div>
      </div>

      {isAuthenticated ? (
        <div className={`mt-2 rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.7)] p-2 transition-all ${isComposerExpanded ? 'p-3' : ''}`}>
          <Textarea
            placeholder="Share what you saw, updates, or context..."
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className={`resize-none transition-all ${isComposerExpanded ? 'min-h-24 py-2' : 'min-h-[44px] py-3'}`}
            onFocus={() => setIsComposerExpanded(true)}
            rows={1}
          />

          {isComposerExpanded && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs hover:bg-[var(--border)]/20 transition-colors">
                  {isUploadingAttachment ? <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[var(--muted)]" /> : <MessageCircle className="h-3.5 w-3.5 text-[color:var(--muted)]" />}
                  <span className="text-[color:var(--muted)]">Attach image</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void handleFileChange(event.target.files)} />
                </label>
                <div className="flex items-center gap-2">
                  <Switch checked={anonymous} onCheckedChange={setAnonymous} id="comment-anon" />
                  <Label htmlFor="comment-anon" className="text-xs text-[color:var(--muted)]">
                    Anonymous
                  </Label>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-8 text-xs px-3" onClick={() => setIsComposerExpanded(false)}>Cancel</Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-4"
                  onClick={() => void submitComment({ body, isAnonymous: anonymous })}
                  disabled={!body.trim() || createCommentMutation.isPending}
                >
                  {createCommentMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Post"}
                </Button>
              </div>
            </div>
          )}

          {attachmentPreviews.length > 0 && isComposerExpanded ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {attachmentPreviews.map((attachment) => (
                <img key={attachment.id} src={attachment.previewUrl} alt="comment-attachment-preview" className="h-20 w-full rounded-lg object-cover" />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.7)] px-4 py-8 text-center text-sm text-[color:var(--muted)]">
          <Link href="/auth" className="font-semibold text-[color:var(--fg)] hover:underline underline-offset-4 mr-1">
            Sign in
          </Link>
          to join the discussion, post updates, and upload evidence.
        </div>
      )}

      {/* Typing Indicator */}
      {typingText && (
        <div className="flex items-center gap-2 text-xs text-[color:var(--muted)] italic animate-in slide-in-from-bottom-2 fade-in">
          <LoaderCircle className="h-3 w-3 animate-spin" />
          {typingText}
        </div>
      )}

      {commentsQuery.isLoading ? <div className="py-4 text-center text-sm text-[color:var(--muted)]">Loading comments...</div> : null}

      <div className="space-y-5">
        {pendingTopLevel.map((comment) => (
          <div key={comment.id} className="opacity-70 animate-pulse">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 shrink-0 rounded-full bg-[var(--muted)]/20 flex items-center justify-center">
                <User className="h-4 w-4 text-[var(--muted)]" />
              </div>
              <p className="text-xs text-[color:var(--muted)]">
                <span className="font-medium text-[var(--fg)]">Sending...</span>
              </p>
            </div>
            <p className="mt-1 ml-8 text-sm text-[var(--fg)]">{comment.body}</p>
          </div>
        ))}

        {visibleServerComments.map((comment) => {
          const pendingReplies = pendingComments.filter((item) => item.parent_id === comment.id);

          return (
            <div key={comment.id} className="">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 shrink-0 rounded-full bg-[var(--muted)]/20 flex items-center justify-center">
                    <User className="h-4 w-4 text-[var(--muted)]" />
                  </div>
                  <p className="text-[13px] text-[color:var(--muted)]">
                    <span className="font-semibold text-[var(--fg)]">{comment.author_display_name}</span>{" "}
                    <span className="mx-1 opacity-50">·</span>{" "}
                    {formatRelativeTime(comment.created_at)}
                  </p>
                </div>
              </div>

              <div className="ml-8">
                <ReplyThread
                  parentComment={comment}
                  incidentId={incidentId}
                  deletedIds={deletedIds}
                  onDelete={handleDelete}
                  onReport={(commentId) => void handleReport(commentId)}
                  onSubmitReply={async ({ parentId, body: replyBody, isAnonymous }) => {
                    await submitComment({ parentId, body: replyBody, isAnonymous });
                  }}
                  pendingReplies={pendingReplies}
                  canWrite={isAuthenticated}
                  onTypingStart={() => void broadcastTyping(true)}
                  onTypingStop={() => void broadcastTyping(false)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {commentsQuery.hasNextPage ? (
        <Button type="button" variant="ghost" className="w-full text-xs text-[color:var(--muted)] hover:text-[var(--fg)]" onClick={() => void commentsQuery.fetchNextPage()} disabled={commentsQuery.isFetchingNextPage}>
          {commentsQuery.isFetchingNextPage ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <ChevronDown className="mr-2 h-4 w-4" />}
          Load more comments
        </Button>
      ) : null}
    </section>
  );
}

