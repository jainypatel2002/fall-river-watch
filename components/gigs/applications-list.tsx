import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils/format";
import type { GigApplicationRecord } from "@/lib/types/gigs";

function formatOffer(application: GigApplicationRecord) {
  if (application.offered_pay_amount === null) return "No offer";
  return `$${application.offered_pay_amount}`;
}

export function ApplicationsList({
  applications,
  onRespond,
  respondingId
}: {
  applications: GigApplicationRecord[];
  onRespond: (applicationId: string, decision: "accept" | "decline") => void;
  respondingId: string | null;
}) {
  if (!applications.length) {
    return (
      <p className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.7)] p-3 text-sm text-[color:var(--muted)]">
        No applications yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {applications.map((application) => (
        <article key={application.id} className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.75)] p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs text-[color:var(--muted)]">{formatRelativeTime(application.created_at)}</p>
              <p className="text-xs text-[color:var(--muted)]">Offer: {formatOffer(application)}</p>
              {application.availability ? <p className="text-xs text-[color:var(--muted)]">Availability: {application.availability}</p> : null}
            </div>
            <Badge variant={application.status === "accepted" ? "default" : "secondary"}>{application.status}</Badge>
          </div>

          <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--fg)]">{application.message}</p>
          <p className="mt-1 text-xs text-[color:var(--muted)]">Tools: {application.has_tools ? "Yes" : "No"}</p>

          {application.status === "pending" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={respondingId === application.id}
                onClick={() => onRespond(application.id, "accept")}
              >
                Accept
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={respondingId === application.id}
                onClick={() => onRespond(application.id, "decline")}
              >
                Decline
              </Button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
