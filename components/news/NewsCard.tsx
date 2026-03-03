import { formatDistanceToNowStrict } from "date-fns";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NEWS_CATEGORY_LABELS, type NewsItemRecord } from "@/lib/types/news";

type NewsCardProps = {
  item: NewsItemRecord;
  clickCount?: number;
  onOpen?: (item: NewsItemRecord) => void;
};

function getTimeLabel(publishedAt: string | null) {
  if (!publishedAt) return "Recently";

  const parsed = new Date(publishedAt);
  if (Number.isNaN(parsed.getTime())) {
    return "Recently";
  }

  return formatDistanceToNowStrict(parsed, { addSuffix: true });
}

export function NewsCard({ item, clickCount = 0, onOpen }: NewsCardProps) {
  return (
    <article className="surface-card overflow-hidden transition-colors hover:border-[rgba(34,211,238,0.4)]">
      <a
        href={item.original_url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onOpen?.(item)}
        className="flex min-h-32 w-full items-stretch gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] sm:p-5"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={item.is_official ? "default" : "secondary"}>{item.is_official ? "Official" : "Source"}</Badge>
            <span className="text-xs text-[color:var(--muted)]">{item.source_name}</span>
            <span className="text-xs text-[color:var(--muted)]">{NEWS_CATEGORY_LABELS[item.category]}</span>
          </div>

          <h2 className="text-base font-semibold leading-snug text-[var(--fg)] sm:text-lg">{item.title}</h2>

          {item.summary ? (
            <p
              className="text-sm leading-relaxed text-[color:var(--muted)]"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden"
              }}
            >
              {item.summary}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--muted)]">
            <span>{getTimeLabel(item.published_at)}</span>
            {clickCount > 0 ? <span>{`Opened ${clickCount}x`}</span> : null}
            <span className="inline-flex items-center gap-1 text-[var(--fg)]">
              Read source
              <ExternalLink className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>

        {item.image_url ? (
          <div className="hidden w-28 shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[rgba(12,18,31,0.8)] sm:block">
            <img src={item.image_url} alt="Article thumbnail" className="h-full w-full object-cover" loading="lazy" />
          </div>
        ) : null}
      </a>
    </article>
  );
}
