"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiToast } from "@/hooks/use-ui-toast";
import { useDeleteEventMutation, useEventDetailQuery, useEventRsvpMutation } from "@/lib/queries/events";

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function EventDetail({ eventId }: { eventId: string }) {
  const router = useRouter();
  const toast = useUiToast();
  const detailQuery = useEventDetailQuery(eventId);
  const deleteMutation = useDeleteEventMutation(eventId);
  const rsvpMutation = useEventRsvpMutation(eventId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  if (detailQuery.isLoading) {
    return <Skeleton className="h-72" />;
  }

  if (detailQuery.isError || !detailQuery.data?.event) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unable to load event</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-rose-200">{(detailQuery.error as Error)?.message ?? "Event not found"}</p>
          <Link href="/events" className="text-sm text-[color:var(--muted)] underline underline-offset-4">
            Back to events
          </Link>
        </CardContent>
      </Card>
    );
  }

  const event = detailQuery.data.event;
  const structuredAddress = [event.street, event.city, event.state, event.zip].filter(Boolean).join(", ");
  const locationAddress = event.formatted_address ?? event.address ?? (structuredAddress || null);
  const canDelete = event.can_manage && confirmText.trim() === "DELETE";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/events" className="text-sm text-[color:var(--muted)] underline underline-offset-4">
          Back to events
        </Link>

        <div className="flex items-center gap-2">
          {event.can_manage ? (
            <Link href={`/events/${event.id}/edit`}>
              <Button size="sm" variant="outline">
                Edit
              </Button>
            </Link>
          ) : null}
          {event.can_manage ? (
            <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)} disabled={deleteMutation.isPending}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cyan-300">{event.category}</p>
          <CardTitle style={{ fontFamily: "var(--font-heading)" }}>{event.title}</CardTitle>
          <p className="text-sm text-[color:var(--muted)]">{event.status}</p>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--fg)]">{event.description}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.74)] p-3 text-sm text-[color:var(--muted)]">
              <p className="inline-flex items-center gap-1.5 text-[var(--fg)]">
                <CalendarClock className="h-4 w-4" />
                Starts
              </p>
              <p className="mt-1">{formatDate(event.start_at)}</p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.74)] p-3 text-sm text-[color:var(--muted)]">
              <p className="inline-flex items-center gap-1.5 text-[var(--fg)]">
                <MapPin className="h-4 w-4" />
                Location
              </p>
              <p className="mt-1">{event.location_name}</p>
              {locationAddress ? <p className="text-xs">{locationAddress}</p> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={event.user_rsvp === "going" ? "default" : "outline"}
              disabled={rsvpMutation.isPending}
              onClick={async () => {
                try {
                  await rsvpMutation.mutateAsync(event.user_rsvp === "going" ? null : "going");
                  toast.success(event.user_rsvp === "going" ? "RSVP removed" : "Marked as going");
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}
            >
              Going ({event.going_count})
            </Button>

            <Button
              type="button"
              variant={event.user_rsvp === "interested" ? "default" : "outline"}
              disabled={rsvpMutation.isPending}
              onClick={async () => {
                try {
                  await rsvpMutation.mutateAsync(event.user_rsvp === "interested" ? null : "interested");
                  toast.success(event.user_rsvp === "interested" ? "RSVP removed" : "Marked interested");
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}
            >
              Interested ({event.interested_count})
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (deleteMutation.isPending) return;
          setDeleteOpen(open);
          if (!open) setConfirmText("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this event?</DialogTitle>
            <DialogDescription>This cannot be undone. Type DELETE to confirm.</DialogDescription>
          </DialogHeader>

          <Input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="Type DELETE" />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!canDelete || deleteMutation.isPending}
              onClick={async () => {
                try {
                  await deleteMutation.mutateAsync();
                  toast.success("Event deleted");
                  router.push("/events");
                  router.refresh();
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}
            >
              Delete event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
