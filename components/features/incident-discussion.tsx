"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, MessageCircle, Reply, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";
import { useUiToast } from "@/hooks/use-ui-toast";
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

function ReplyThread({
  parentComment,
  incidentId,
  deletedIds,
  onDelete,
  onReport,
  onSubmitReply,
  pendingReplies,
  canWrite
}: {
  parentComment: IncidentComment;
  incidentId: string;
  deletedIds: Set<string>;
  onDelete: (commentId: string) => void;
  onReport: (commentId: string) => void;
  onSubmitReply: (payload: { parentId: string; body: string; isAnonymous: boolean }) => Promise<void>;
  pendingReplies: PendingComment[];
  canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyAnonymous, setReplyAnonymous] = useState(false);

  const repliesQuery = useCommentRepliesQuery(parentComment.id, 20, open);
  const serverReplies = repliesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const visibleReplies = serverReplies.filter((reply) => !deletedIds.has(reply.id));

  async function submitReply() {
    const body = replyBody.trim();
    if (!body) return;

    await onSubmitReply({
      parentId: parentComment.id,
      body,
      isAnonymous: replyAnonymous
    });

    setReplyBody("");
    setReplyAnonymous(false);
    setOpen(true);
  }

  const hasReplies = parentComment.replyCount && parentComment.replyCount > 0;

  return (
    <div className="mt-3 space-y-2 border-l border-[var(--border)] pl-3">
      {hasReplies ? (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen((value) => !value)}>
          {open ? "Hide replies" : `View replies (${parentComment.replyCount})`}
        </Button>
      ) : null}

      {open ? (
        <div className="space-y-2">
          {repliesQuery.isLoading ? <p className="text-xs text-[color:var(--muted)]">Loading replies...</p> : null}

          {visibleReplies.map((reply) => (
            <div key={reply.id} className="rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.6)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-[color:var(--muted)]">
                  <span className="font-medium text-[var(--fg)]">{reply.author_display_name}</span> · {formatRelativeTime(reply.created_at)}
                </p>
                <div className="flex items-center gap-1">
                  {reply.is_owner ? (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onDelete(reply.id)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  ) : null}
                  {canWrite ? (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onReport(reply.id)}>
                      <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                      Report
                    </Button>
                  ) : null}
                </div>
              </div>

              <p className="mt-1 text-sm text-[var(--fg)]">{reply.body}</p>

              {reply.attachments.length ? (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {reply.attachments.map((attachment) => (
                    <img key={attachment.id} src={attachment.signedUrl} alt="reply-attachment" className="h-24 w-full rounded-lg object-cover" />
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          {pendingReplies.map((pending) => (
            <div key={pending.id} className="rounded-xl border border-[rgba(34,211,238,0.35)] bg-[rgba(34,211,238,0.08)] p-3">
              <p className="text-xs text-[color:var(--muted)]">Sending reply...</p>
              <p className="mt-1 text-sm text-[var(--fg)]">{pending.body}</p>
            </div>
          ))}

          {repliesQuery.hasNextPage ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void repliesQuery.fetchNextPage()} disabled={repliesQuery.isFetchingNextPage}>
              {repliesQuery.isFetchingNextPage ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Load more replies"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {canWrite ? (
        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.55)] p-3">
          <Textarea
            placeholder="Write a reply"
            value={replyBody}
            onChange={(event) => setReplyBody(event.target.value)}
            className="min-h-20"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Switch checked={replyAnonymous} onCheckedChange={setReplyAnonymous} id={`reply-anon-${parentComment.id}`} />
              <Label htmlFor={`reply-anon-${parentComment.id}`} className="text-xs text-[color:var(--muted)]">
                Reply anonymously
              </Label>
            </div>
            <Button type="button" size="sm" className="gap-1.5" onClick={() => void submitReply()} disabled={!replyBody.trim()}>
              <Reply className="h-3.5 w-3.5" />
              Reply
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function IncidentDiscussion({ incidentId, topLevelCount }: { incidentId: string; topLevelCount: number }) {
  const supabase = useSupabaseBrowser();
  const uiToast = useUiToast();

  const commentsQuery = useIncidentCommentsQuery(incidentId, 20);
  const createCommentMutation = useCreateIncidentCommentMutation(incidentId);
  const deleteCommentMutation = useDeleteCommentMutation(incidentId);
  const reportCommentMutation = useReportCommentMutation();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [pendingComments, setPendingComments] = useState<PendingComment[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<Array<{ id: string; previewUrl: string }>>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then((result: { data?: { user?: unknown } }) => {
      if (!active) return;
      setIsAuthenticated(Boolean(result.data?.user));
    });

    return () => {
      active = false;
    };
  }, [supabase.auth]);

  const serverComments = commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const visibleServerComments = serverComments.filter((comment) => !deletedIds.has(comment.id));
  const pendingTopLevel = pendingComments.filter((comment) => comment.parent_id === null);

  const totalVisibleComments = useMemo(() => {
    return Math.max(0, topLevelCount - deletedIds.size) + pendingTopLevel.length;
  }, [deletedIds.size, pendingTopLevel.length, topLevelCount]);

  async function submitComment(payload: { parentId?: string; body: string; isAnonymous: boolean }) {
    const trimmedBody = payload.body.trim();
    if (!trimmedBody) return;

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
    <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[rgba(9,14,27,0.58)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
          Discussion
        </h2>
        <p className="text-xs text-[color:var(--muted)]">{totalVisibleComments} top-level comments</p>
      </div>

      {isAuthenticated ? (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.7)] p-3">
          <Textarea placeholder="Share what you saw, updates, or context" value={body} onChange={(event) => setBody(event.target.value)} className="min-h-24" />
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--fg)]">
              {isUploadingAttachment ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
              Attach image
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void handleFileChange(event.target.files)} />
            </label>
            <div className="flex items-center gap-2">
              <Switch checked={anonymous} onCheckedChange={setAnonymous} id="comment-anon" />
              <Label htmlFor="comment-anon" className="text-xs text-[color:var(--muted)]">
                Post anonymously
              </Label>
            </div>
            <Button
              type="button"
              className="ml-auto"
              onClick={() => void submitComment({ body, isAnonymous: anonymous })}
              disabled={!body.trim() || createCommentMutation.isPending}
            >
              {createCommentMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Post comment"}
            </Button>
          </div>

          {attachmentPreviews.length ? (
            <div className="grid grid-cols-3 gap-2">
              {attachmentPreviews.map((attachment) => (
                <img key={attachment.id} src={attachment.previewUrl} alt="comment-attachment-preview" className="h-20 w-full rounded-lg object-cover" />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.7)] p-3 text-sm text-[color:var(--muted)]">
          <Link href="/auth" className="underline underline-offset-4">
            Sign in
          </Link>{" "}
          to join the discussion, post updates, and upload evidence.
        </div>
      )}

      {commentsQuery.isLoading ? <p className="text-sm text-[color:var(--muted)]">Loading comments...</p> : null}

      <div className="space-y-3">
        {pendingTopLevel.map((comment) => (
          <div key={comment.id} className="rounded-xl border border-[rgba(34,211,238,0.35)] bg-[rgba(34,211,238,0.08)] p-3">
            <p className="text-xs text-[color:var(--muted)]">Sending comment...</p>
            <p className="mt-1 text-sm text-[var(--fg)]">{comment.body}</p>
          </div>
        ))}

        {visibleServerComments.map((comment) => {
          const pendingReplies = pendingComments.filter((item) => item.parent_id === comment.id);

          return (
            <div key={comment.id} className="rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.65)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-[color:var(--muted)]">
                  <span className="font-medium text-[var(--fg)]">{comment.author_display_name}</span> · {formatRelativeTime(comment.created_at)}
                </p>
                <div className="flex items-center gap-1">
                  {comment.is_owner ? (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleDelete(comment.id)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  ) : null}
                  {isAuthenticated ? (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void handleReport(comment.id)}>
                      <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                      Report
                    </Button>
                  ) : null}
                </div>
              </div>

              <p className="mt-1 text-sm text-[var(--fg)]">{comment.body}</p>

              {comment.attachments.length ? (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {comment.attachments.map((attachment) => (
                    <img key={attachment.id} src={attachment.signedUrl} alt="comment-attachment" className="h-24 w-full rounded-lg object-cover" />
                  ))}
                </div>
              ) : null}

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
              />
            </div>
          );
        })}
      </div>

      {commentsQuery.hasNextPage ? (
        <Button type="button" variant="outline" className="w-full" onClick={() => void commentsQuery.fetchNextPage()} disabled={commentsQuery.isFetchingNextPage}>
          {commentsQuery.isFetchingNextPage ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Load more comments"}
        </Button>
      ) : null}
    </section>
  );
}
