"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, MessageCircle, ThumbsDown, ThumbsUp, TriangleAlert } from "lucide-react";
import { ApplicationsList } from "@/components/gigs/applications-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRole } from "@/hooks/use-role";
import { useUiToast } from "@/hooks/use-ui-toast";
import {
  getGigMediaSignedUrl,
  useApplyToGigMutation,
  useCreateGigFlagMutation,
  useCreateGigReviewMutation,
  useGigDetailQuery,
  useRespondToGigApplicationMutation,
  useUpdateGigStatusMutation
} from "@/lib/queries/gigs";
import type { GigApplicationRecord } from "@/lib/types/gigs";
import { formatRelativeTime } from "@/lib/utils/format";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2
  }).format(amount);
}

function payLabel(payType: string, amount: number | null, currency: string) {
  if (payType === "free") return "Free";
  if (amount === null) return "Pay negotiable";
  if (payType === "hourly") return `${formatMoney(amount, currency)}/hr`;
  return formatMoney(amount, currency);
}

export function GigDetail({ gigId }: { gigId: string }) {
  const router = useRouter();
  const toast = useUiToast();
  const role = useRole();
  const { user } = useCurrentUser();

  const detailQuery = useGigDetailQuery(gigId, user?.id ?? null);
  const applyMutation = useApplyToGigMutation(gigId);
  const respondMutation = useRespondToGigApplicationMutation(gigId);
  const updateStatusMutation = useUpdateGigStatusMutation(gigId);
  const reviewMutation = useCreateGigReviewMutation(gigId);
  const flagMutation = useCreateGigFlagMutation(gigId);

  const [applyOpen, setApplyOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState("");
  const [applicationPay, setApplicationPay] = useState("");
  const [applicationAvailability, setApplicationAvailability] = useState("");
  const [applicationHasTools, setApplicationHasTools] = useState(false);
  const [flagReason, setFlagReason] = useState<"spam" | "scam" | "unsafe" | "harassment" | "other">("unsafe");
  const [flagDetails, setFlagDetails] = useState("");
  const [reviewRating, setReviewRating] = useState<-1 | 1>(1);
  const [reviewComment, setReviewComment] = useState("");
  const [respondingApplicationId, setRespondingApplicationId] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  const detail = detailQuery.data;
  const gig = detail?.gig;

  const isCreator = Boolean(user && gig && gig.creator_user_id === user.id);
  const isWorker = Boolean(user && gig && gig.assigned_user_id === user.id);
  const canManage = isCreator || role.isMod;
  const canManageApplications = canManage;

  const myApplication = detail?.myApplication ?? null;
  const canApply = Boolean(
    user &&
      gig &&
      !isCreator &&
      gig.status === "open" &&
      (!myApplication || myApplication.status === "declined" || myApplication.status === "withdrawn")
  );

  const chatThreadId = detail?.chatThread?.id ?? null;
  const canOpenChat = Boolean(chatThreadId && (isCreator || isWorker || role.isMod));

  const revieweeUserId = useMemo(() => {
    if (!user || !gig) return null;
    if (user.id === gig.creator_user_id) return gig.assigned_user_id;
    if (user.id === gig.assigned_user_id) return gig.creator_user_id;
    return null;
  }, [gig, user]);

  const alreadyReviewed = useMemo(
    () => Boolean(user && detail?.reviews.some((review) => review.reviewer_user_id === user.id)),
    [detail?.reviews, user]
  );

  useEffect(() => {
    let active = true;

    async function hydrateMediaUrls() {
      if (!detail?.media.length) {
        setMediaUrls({});
        return;
      }

      const entries = await Promise.all(
        detail.media.map(async (item) => {
          try {
            const url = await getGigMediaSignedUrl(item.storage_path);
            return [item.id, url] as const;
          } catch {
            return [item.id, ""] as const;
          }
        })
      );

      if (!active) return;
      setMediaUrls(Object.fromEntries(entries.filter((entry) => entry[1])));
    }

    void hydrateMediaUrls();

    return () => {
      active = false;
    };
  }, [detail?.media]);

  async function onRespondApplication(application: GigApplicationRecord, decision: "accept" | "decline") {
    setRespondingApplicationId(application.id);

    try {
      const result = await respondMutation.mutateAsync({
        applicationId: application.id,
        decision
      });
      toast.success(decision === "accept" ? "Application accepted" : "Application declined");
      if (result.thread_id) {
        toast.info("Private chat ready", "Use Open Chat to coordinate safely.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update application");
    } finally {
      setRespondingApplicationId(null);
    }
  }

  if (detailQuery.isLoading) {
    return <Skeleton className="h-64" />;
  }

  if (detailQuery.isError || !detail || !gig) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unable to load gig</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-rose-200">{(detailQuery.error as Error)?.message ?? "Gig not found"}</p>
          <Link href="/gigs" className="text-sm text-[color:var(--muted)] underline underline-offset-4">
            Back to gigs
          </Link>
        </CardContent>
      </Card>
    );
  }

  const thumbsUpCount = detail.reviews.filter((review) => review.rating === 1).length;
  const thumbsDownCount = detail.reviews.filter((review) => review.rating === -1).length;

  return (
    <section className="space-y-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/gigs" className="text-sm text-[color:var(--muted)] underline underline-offset-4">
          Back to gigs
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setFlagOpen(true)}>
            <TriangleAlert className="mr-1.5 h-4 w-4" />
            Flag
          </Button>
          {canOpenChat ? (
            <Button type="button" size="sm" onClick={() => router.push(`/gigs/chat/${chatThreadId}`)}>
              <MessageCircle className="mr-1.5 h-4 w-4" />
              Open Chat
            </Button>
          ) : null}
          {canManage ? (
            <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/gigs/${gig.id}/edit`)}>
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{gig.category.replace(/_/g, " ")}</Badge>
            <Badge variant="default">{payLabel(gig.pay_type, gig.pay_amount, gig.currency)}</Badge>
            <Badge variant="outline">{gig.status.replace("_", " ")}</Badge>
          </div>
          <CardTitle style={{ fontFamily: "var(--font-heading)" }}>{gig.title}</CardTitle>
          <p className="text-xs text-[color:var(--muted)]">Posted {formatRelativeTime(gig.created_at)}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-sm text-[var(--fg)]">{gig.description}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.7)] p-3 text-sm text-[color:var(--muted)]">
              <p className="font-medium text-[var(--fg)]">Location</p>
              <p className="mt-1">{gig.location_name}</p>
              <p className="text-xs">
                {gig.city}, {gig.state}
                {gig.zip ? ` ${gig.zip}` : ""}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.7)] p-3 text-sm text-[color:var(--muted)]">
              <p className="font-medium text-[var(--fg)]">Schedule</p>
              <p className="mt-1">{gig.schedule_type.replace("_", " ")}</p>
              {gig.start_at ? <p className="text-xs">{new Date(gig.start_at).toLocaleString()}</p> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
            <span>People needed: {gig.people_needed}</span>
            <span>·</span>
            <span>Remote: {gig.is_remote ? "Yes" : "No"}</span>
            <span>·</span>
            <span>Tools required: {gig.tools_required ? "Yes" : "No"}</span>
          </div>

          {gig.tools_required && gig.tools_list ? (
            <p className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.7)] p-3 text-sm text-[color:var(--muted)]">
              Tools: {gig.tools_list}
            </p>
          ) : null}

          {detail.media.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {detail.media.map((media) =>
                mediaUrls[media.id] ? (
                  <img
                    key={media.id}
                    src={mediaUrls[media.id]}
                    alt={`gig-media-${media.id}`}
                    className="h-28 w-full rounded-xl border border-[var(--border)] object-cover"
                  />
                ) : null
              )}
            </div>
          ) : null}

          {myApplication ? (
            <p className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.7)] p-3 text-sm text-[color:var(--muted)]">
              Your application status: <span className="font-medium text-[var(--fg)]">{myApplication.status}</span>
            </p>
          ) : null}

          {canApply ? (
            <Button type="button" className="min-h-11" onClick={() => setApplyOpen(true)}>
              Apply
            </Button>
          ) : null}

          {canManage ? (
            <div className="flex flex-wrap gap-2">
              {gig.status === "assigned" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={updateStatusMutation.isPending}
                  onClick={async () => {
                    try {
                      await updateStatusMutation.mutateAsync("in_progress");
                      toast.success("Gig marked in progress");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Failed to update status");
                    }
                  }}
                >
                  Mark In Progress
                </Button>
              ) : null}

              {gig.status === "in_progress" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={updateStatusMutation.isPending}
                  onClick={async () => {
                    try {
                      await updateStatusMutation.mutateAsync("completed");
                      toast.success("Gig completed");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Failed to update status");
                    }
                  }}
                >
                  Mark Completed
                </Button>
              ) : null}

              {(gig.status === "open" || gig.status === "assigned" || gig.status === "in_progress") ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={updateStatusMutation.isPending}
                  onClick={async () => {
                    try {
                      await updateStatusMutation.mutateAsync("canceled");
                      toast.success("Gig canceled");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Failed to update status");
                    }
                  }}
                >
                  Cancel Gig
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canManageApplications ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Applications</CardTitle>
          </CardHeader>
          <CardContent>
            <ApplicationsList
              applications={detail.applications}
              respondingId={respondingApplicationId}
              onRespond={(applicationId, decision) => {
                const application = detail.applications.find((item) => item.id === applicationId);
                if (!application) return;
                void onRespondApplication(application, decision);
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rating</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-[color:var(--muted)]">
            <span className="inline-flex items-center gap-1 text-emerald-200">
              <ThumbsUp className="h-4 w-4" />
              {thumbsUpCount}
            </span>
            <span className="inline-flex items-center gap-1 text-rose-200">
              <ThumbsDown className="h-4 w-4" />
              {thumbsDownCount}
            </span>
          </div>

          {gig.status === "completed" && revieweeUserId && !alreadyReviewed ? (
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.7)] p-3">
              <p className="text-sm text-[var(--fg)]">Leave a quick thumbs rating for this completed gig.</p>
              <div className="flex gap-2">
                <Button type="button" variant={reviewRating === 1 ? "default" : "outline"} onClick={() => setReviewRating(1)}>
                  <ThumbsUp className="mr-1.5 h-4 w-4" />
                  Thumbs Up
                </Button>
                <Button type="button" variant={reviewRating === -1 ? "default" : "outline"} onClick={() => setReviewRating(-1)}>
                  <ThumbsDown className="mr-1.5 h-4 w-4" />
                  Thumbs Down
                </Button>
              </div>
              <Textarea
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                maxLength={200}
                placeholder="Optional comment (max 200)"
              />
              <Button
                type="button"
                disabled={reviewMutation.isPending}
                onClick={async () => {
                  try {
                    await reviewMutation.mutateAsync({
                      revieweeUserId,
                      payload: {
                        rating: reviewRating,
                        comment: reviewComment
                      }
                    });
                    setReviewComment("");
                    toast.success("Review submitted");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Failed to submit review");
                  }
                }}
              >
                Submit Rating
              </Button>
            </div>
          ) : null}

          {alreadyReviewed ? <p className="text-xs text-[color:var(--muted)]">You already submitted a review for this gig.</p> : null}

          <div className="space-y-2">
            {detail.reviews.map((review) => (
              <div key={review.id} className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.7)] p-3 text-sm">
                <p className="font-medium text-[var(--fg)]">{review.rating === 1 ? "Thumbs up" : "Thumbs down"}</p>
                {review.comment ? <p className="mt-1 whitespace-pre-wrap text-[color:var(--muted)]">{review.comment}</p> : null}
                <p className="mt-1 text-xs text-[color:var(--muted)]">{formatRelativeTime(review.created_at)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply to Gig</DialogTitle>
            <DialogDescription>Send a short note to the gig creator.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="apply-message">Message</Label>
              <Textarea id="apply-message" value={applicationMessage} onChange={(event) => setApplicationMessage(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apply-pay">Offered Pay (optional)</Label>
              <Input
                id="apply-pay"
                type="number"
                min={0}
                step="0.01"
                value={applicationPay}
                onChange={(event) => setApplicationPay(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apply-availability">Availability (optional)</Label>
              <Input
                id="apply-availability"
                value={applicationAvailability}
                onChange={(event) => setApplicationAvailability(event.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-[color:var(--muted)]">
              <input
                type="checkbox"
                checked={applicationHasTools}
                onChange={(event) => setApplicationHasTools(event.target.checked)}
                className="h-4 w-4"
              />
              I have the required tools
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setApplyOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={applyMutation.isPending || !applicationMessage.trim()}
              onClick={async () => {
                try {
                  await applyMutation.mutateAsync({
                    message: applicationMessage,
                    offered_pay_amount: applicationPay.trim() ? Number(applicationPay) : null,
                    availability: applicationAvailability.trim() || null,
                    has_tools: applicationHasTools
                  });
                  setApplyOpen(false);
                  setApplicationMessage("");
                  setApplicationPay("");
                  setApplicationAvailability("");
                  setApplicationHasTools(false);
                  toast.success("Application submitted");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to apply");
                }
              }}
            >
              {applyMutation.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={flagOpen} onOpenChange={setFlagOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flag Gig</DialogTitle>
            <DialogDescription>Report suspicious or unsafe gigs to moderators.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="flag-reason">Reason</Label>
              <select
                id="flag-reason"
                value={flagReason}
                onChange={(event) => setFlagReason(event.target.value as typeof flagReason)}
                className="h-10 w-full rounded-md border border-[var(--border)] bg-[rgba(10,15,28,0.8)] px-3 text-sm text-[var(--fg)]"
              >
                <option value="spam">Spam</option>
                <option value="scam">Scam</option>
                <option value="unsafe">Unsafe</option>
                <option value="harassment">Harassment</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="flag-details">Details (optional)</Label>
              <Textarea
                id="flag-details"
                value={flagDetails}
                maxLength={400}
                onChange={(event) => setFlagDetails(event.target.value)}
                placeholder="Share context for moderators"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setFlagOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={flagMutation.isPending}
              onClick={async () => {
                try {
                  await flagMutation.mutateAsync({
                    reason: flagReason,
                    details: flagDetails
                  });
                  setFlagOpen(false);
                  setFlagDetails("");
                  toast.success("Gig flagged");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to flag gig");
                }
              }}
            >
              {flagMutation.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit Flag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
