import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils/format";
import type { GigRecord } from "@/lib/types/gigs";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2
  }).format(amount);
}

function payLabel(gig: GigRecord) {
  if (gig.pay_type === "free") return "Free";
  if (gig.pay_amount === null) return "Pay negotiable";
  if (gig.pay_type === "hourly") return `${formatMoney(gig.pay_amount, gig.currency)}/hr`;
  return formatMoney(gig.pay_amount, gig.currency);
}

function scheduleLabel(gig: GigRecord) {
  if (gig.schedule_type === "asap") return "ASAP";
  if (gig.schedule_type === "scheduled") return "Scheduled";
  return "Flexible";
}

export function GigCard({
  gig,
  onOpen,
  compact = false
}: {
  gig: GigRecord;
  onOpen?: () => void;
  compact?: boolean;
}) {
  return (
    <article className="surface-card overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(34,211,238,0.4)]">
      <div className={`space-y-3 p-4 ${compact ? "" : "sm:p-5"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{gig.category.replace(/_/g, " ")}</Badge>
          <Badge variant={gig.pay_type === "free" ? "secondary" : "default"}>{payLabel(gig)}</Badge>
          <Badge variant="outline">{scheduleLabel(gig)}</Badge>
        </div>

        <div>
          <h3 className="text-base font-semibold leading-tight text-[var(--fg)] sm:text-lg">{gig.title}</h3>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            {gig.location_name} · {gig.city} · {formatRelativeTime(gig.created_at)}
          </p>
        </div>

        {!compact ? (
          <p
            className="text-sm leading-relaxed text-[color:var(--muted)]"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden"
            }}
          >
            {gig.description}
          </p>
        ) : null}

        {onOpen ? (
          <div className="flex justify-end">
            <Button type="button" variant="outline" className="min-h-10" onClick={onOpen}>
              Open
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
