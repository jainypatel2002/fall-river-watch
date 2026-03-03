import * as cheerio from "cheerio";
import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";
import type { NewsCategory } from "@/lib/types/news";

type NewsSource = {
  id: string;
  name: string;
  source_type: "rss" | "html";
  feed_url: string | null;
  page_url: string | null;
  site_url: string | null;
  enabled: boolean;
  fetch_interval_minutes: number;
  is_official: boolean;
};

type CandidateNewsItem = {
  source_id: string;
  source_name: string;
  is_official: boolean;
  title: string;
  canonical_url: string;
  original_url: string;
  published_at: string | null;
  summary: string | null;
  image_url: string | null;
  category: NewsCategory;
  city: string | null;
  state: string | null;
};

type SourceRunStats = {
  source_id: string;
  source_name: string;
  source_type: "rss" | "html";
  items_seen: number;
  items_inserted: number;
  items_skipped: number;
  error: string | null;
};

export type NewsIngestResult = {
  ok: boolean;
  items_inserted: number;
  items_skipped: number;
  per_source: SourceRunStats[];
  run_id: string | null;
  error?: string;
};

type RssMediaField = {
  $?: {
    url?: string;
  };
  url?: string;
};

type RssItemWithCustomFields = Parser.Item & {
  description?: string;
  "content:encoded"?: string;
  "media:content"?: RssMediaField[] | RssMediaField;
  "media:thumbnail"?: RssMediaField[] | RssMediaField;
};

const NEWS_SUMMARY_LIMIT = 400;
const FETCH_TIMEOUT_MS = 12_000;
const FETCH_RETRIES = 2;
const PAGE_SIZE_UPSERT = 200;

const TRACKING_PARAMS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid"]);

const CATEGORY_KEYWORDS: Record<Exclude<NewsCategory, "general" | "city">, string[]> = {
  traffic: ["traffic", "road", "closure", "closed", "detour", "lane", "crash", "accident", "bridge", "highway", "street"],
  crime: ["police", "shooting", "arrest", "robbery", "assault", "homicide", "stabbing", "burglary", "suspect", "investigation"],
  weather: ["weather", "snow", "storm", "rain", "wind", "flood", "blizzard", "hurricane", "ice", "heat advisory"],
  schools: ["school", "schools", "district", "student", "teacher", "campus", "superintendent", "class"],
  community: ["community", "festival", "parade", "charity", "volunteer", "neighborhood", "meeting", "event"],
  business: ["business", "economy", "development", "opening", "expansion", "jobs", "restaurant", "store", "shop"],
  sports: ["sports", "game", "football", "basketball", "baseball", "soccer", "hockey", "tournament", "coach", "athletic"]
};

function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTextWithRetries(url: string, attemptLimit = FETCH_RETRIES + 1): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "user-agent": "FallRiverAlertBot/1.0 (+https://fallriveralert.com)"
        },
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      const body = await response.text();
      clearTimeout(timeout);
      return body;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attemptLimit) {
        await sleep(250 * attempt);
      }
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return null;
}

function parseDateFromText(value: string): string | null {
  const direct = parseDate(value);
  if (direct) return direct;

  const pattern = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})\b/;
  const match = value.match(pattern);
  if (!match) return null;

  return parseDate(match[0]);
}

function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value: string): string {
  const $ = cheerio.load(`<div>${value}</div>`);
  return cleanText($.text());
}

function truncateSummary(value: string | null): string | null {
  const trimmed = cleanText(value ?? "");
  if (!trimmed) return null;
  if (trimmed.length <= NEWS_SUMMARY_LIMIT) return trimmed;
  return `${trimmed.slice(0, NEWS_SUMMARY_LIMIT - 1).trimEnd()}…`;
}

function pickFirstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = cleanText(value ?? "");
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function normalizeUrl(rawUrl: string | null | undefined, baseUrl?: string | null): string | null {
  if (!rawUrl) return null;

  try {
    const url = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);

    if (url.protocol === "http:") {
      url.protocol = "https:";
    }

    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      const keyLower = key.toLowerCase();
      if (keyLower.startsWith("utm_") || TRACKING_PARAMS.has(keyLower)) {
        url.searchParams.delete(key);
      }
    }

    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.toString();
  } catch {
    return null;
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function categorizeByTitle(title: string, isOfficial: boolean): NewsCategory {
  const normalized = title.toLowerCase();

  if (isOfficial && /(city|mayor|municipal|council|press release)/i.test(title)) {
    return "city";
  }

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<
    [Exclude<NewsCategory, "general" | "city">, string[]]
  >) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }

  return "general";
}

function normalizeMediaField(field: RssMediaField[] | RssMediaField | undefined): string | null {
  if (!field) return null;
  const first = Array.isArray(field) ? field[0] : field;
  return cleanText(first?.$?.url ?? first?.url ?? null) || null;
}

function extractFirstImageFromHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const $ = cheerio.load(html);
  const src = $("img").first().attr("src");
  return src ? cleanText(src) : null;
}

async function parseRssSource(source: NewsSource, city: string | null, state: string | null): Promise<CandidateNewsItem[]> {
  if (!source.feed_url) {
    return [];
  }

  const xml = await fetchTextWithRetries(source.feed_url);

  const parser = new Parser<Record<string, unknown>, RssItemWithCustomFields>({
    timeout: FETCH_TIMEOUT_MS,
    customFields: {
      item: [
        ["description", "description"],
        ["content:encoded", "content:encoded"],
        ["media:content", "media:content", { keepArray: true }],
        ["media:thumbnail", "media:thumbnail", { keepArray: true }]
      ]
    }
  });

  const feed = await parser.parseString(xml);
  const baseUrl = source.site_url ?? source.feed_url;

  const rows: CandidateNewsItem[] = [];
  for (const item of feed.items ?? []) {
    const title = cleanText(item.title);
    if (!title) continue;

    const rawLink = cleanText(item.link ?? item.guid ?? "");
    const originalUrl = normalizeUrl(rawLink, baseUrl);
    if (!originalUrl) continue;

    const canonicalUrl = normalizeUrl(originalUrl, baseUrl);
    if (!canonicalUrl) continue;

    const summarySource = pickFirstNonEmpty([
      item.contentSnippet,
      item.summary,
      stripHtml(item.description ?? ""),
      stripHtml(item["content:encoded"] ?? ""),
      stripHtml(item.content ?? "")
    ]);
    const summary = truncateSummary(summarySource);

    const rawImage =
      item.enclosure?.url ??
      normalizeMediaField(item["media:content"]) ??
      normalizeMediaField(item["media:thumbnail"]) ??
      extractFirstImageFromHtml(item["content:encoded"] ?? item.content ?? item.description);
    const imageUrl = normalizeUrl(rawImage, baseUrl);

    const publishedAt = parseDate(item.isoDate ?? item.pubDate);

    rows.push({
      source_id: source.id,
      source_name: source.name,
      is_official: source.is_official,
      title,
      canonical_url: canonicalUrl,
      original_url: originalUrl,
      published_at: publishedAt,
      summary,
      image_url: imageUrl,
      category: categorizeByTitle(title, source.is_official),
      city,
      state
    });
  }

  return rows;
}

function extractPressReleaseCandidates(
  source: NewsSource,
  html: string,
  city: string | null,
  state: string | null
): CandidateNewsItem[] {
  const $ = cheerio.load(html);
  const baseUrl = source.page_url ?? source.site_url;
  const siteHost = source.site_url ? normalizeUrl(source.site_url) : null;
  const normalizedSiteHost = siteHost ? new URL(siteHost).host : null;

  const anchors = $("a[href]").toArray();
  const candidates: CandidateNewsItem[] = [];
  const seen = new Set<string>();

  for (const anchor of anchors) {
    const element = $(anchor);
    const title = cleanText(element.text());
    if (!title) continue;

    const href = cleanText(element.attr("href"));
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) {
      continue;
    }

    const originalUrl = normalizeUrl(href, baseUrl);
    if (!originalUrl) continue;

    if (normalizedSiteHost && new URL(originalUrl).host !== normalizedSiteHost) {
      continue;
    }

    const canonicalUrl = normalizeUrl(originalUrl, baseUrl);
    if (!canonicalUrl || seen.has(canonicalUrl)) {
      continue;
    }

    const contextText = cleanText(element.closest("li, tr, p, div").first().text());
    const combinedContext = cleanText(`${title} ${contextText}`);
    const looksLikePressRelease =
      /press release|document center|mayor|city council|city of/i.test(combinedContext) ||
      /documentcenter|press_releases/i.test(originalUrl) ||
      /\.pdf(?:$|\?)/i.test(originalUrl);

    if (!looksLikePressRelease) {
      continue;
    }

    const publishedAt = parseDateFromText(combinedContext);
    const summary = truncateSummary(contextText.replace(title, ""));

    seen.add(canonicalUrl);
    candidates.push({
      source_id: source.id,
      source_name: source.name,
      is_official: true,
      title,
      canonical_url: canonicalUrl,
      original_url: originalUrl,
      published_at: publishedAt,
      summary,
      image_url: null,
      category: "city",
      city,
      state
    });
  }

  return candidates;
}

async function parseHtmlSource(source: NewsSource, city: string | null, state: string | null): Promise<CandidateNewsItem[]> {
  if (!source.page_url) {
    return [];
  }

  const html = await fetchTextWithRetries(source.page_url);
  const candidates = extractPressReleaseCandidates(source, html, city, state);

  if (candidates.length === 0) {
    return [];
  }

  return candidates.map((item) => ({
    ...item,
    city,
    state,
    category: "city",
    is_official: true
  }));
}

async function fetchExistingCanonicalUrls(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  canonicalUrls: string[]
): Promise<Set<string>> {
  const found = new Set<string>();
  const chunks = chunkArray(canonicalUrls, 200);

  for (const chunk of chunks) {
    const { data, error } = await supabase.from("news_items").select("canonical_url").in("canonical_url", chunk);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of data ?? []) {
      if (row.canonical_url) {
        found.add(row.canonical_url);
      }
    }
  }

  return found;
}

async function upsertCandidates(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  candidates: CandidateNewsItem[]
): Promise<{ inserted: number; skipped: number }> {
  if (candidates.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  const uniqueByCanonical = new Map<string, CandidateNewsItem>();
  for (const candidate of candidates) {
    if (!uniqueByCanonical.has(candidate.canonical_url)) {
      uniqueByCanonical.set(candidate.canonical_url, candidate);
    }
  }

  const deduped = [...uniqueByCanonical.values()];
  const duplicateSkips = candidates.length - deduped.length;
  const existingCanonicalUrls = await fetchExistingCanonicalUrls(
    supabase,
    deduped.map((item) => item.canonical_url)
  );

  const rowsToInsert = deduped.filter((item) => !existingCanonicalUrls.has(item.canonical_url));
  if (rowsToInsert.length === 0) {
    return { inserted: 0, skipped: duplicateSkips + deduped.length };
  }

  let inserted = 0;
  for (const page of chunkArray(rowsToInsert, PAGE_SIZE_UPSERT)) {
    const { data, error } = await supabase
      .from("news_items")
      .upsert(page, { onConflict: "canonical_url", ignoreDuplicates: true })
      .select("id");

    if (error) {
      throw new Error(error.message);
    }

    inserted += data?.length ?? 0;
  }

  const skipped = duplicateSkips + (rowsToInsert.length - inserted) + existingCanonicalUrls.size;
  return {
    inserted,
    skipped
  };
}

export async function runNewsIngestion(): Promise<NewsIngestResult> {
  const supabase = createSupabaseAdminClient();
  const city = process.env.NEWS_DEFAULT_CITY?.trim() || null;
  const state = process.env.NEWS_DEFAULT_STATE?.trim() || null;

  let runId: string | null = null;

  try {
    const { data: runRow } = await supabase.from("news_ingest_runs").insert({ ok: true }).select("id").maybeSingle();
    runId = runRow?.id ?? null;
  } catch {
    runId = null;
  }

  const perSource: SourceRunStats[] = [];
  let insertedTotal = 0;
  let skippedTotal = 0;
  let topLevelError: string | undefined;

  try {
    const { data: sources, error: sourcesError } = await supabase
      .from("news_sources")
      .select("id, name, source_type, feed_url, page_url, site_url, enabled, fetch_interval_minutes, is_official")
      .eq("enabled", true)
      .order("name", { ascending: true });

    if (sourcesError) {
      throw new Error(sourcesError.message);
    }

    for (const source of (sources ?? []) as NewsSource[]) {
      const sourceStats: SourceRunStats = {
        source_id: source.id,
        source_name: source.name,
        source_type: source.source_type,
        items_seen: 0,
        items_inserted: 0,
        items_skipped: 0,
        error: null
      };

      try {
        const parsed =
          source.source_type === "rss"
            ? await parseRssSource(source, city, state)
            : await parseHtmlSource(source, city, state);

        sourceStats.items_seen = parsed.length;

        const { inserted, skipped } = await upsertCandidates(supabase, parsed);
        sourceStats.items_inserted = inserted;
        sourceStats.items_skipped = skipped;

        insertedTotal += inserted;
        skippedTotal += skipped;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sourceStats.error = message;
        sourceStats.items_skipped = sourceStats.items_seen;
        skippedTotal += sourceStats.items_skipped;
      }

      perSource.push(sourceStats);
    }
  } catch (error) {
    topLevelError = error instanceof Error ? error.message : String(error);
  }

  const hasSourceErrors = perSource.some((entry) => entry.error);
  const ok = !topLevelError && !hasSourceErrors;

  if (runId) {
    const perSourceErrorSummary = perSource
      .map((entry) => entry.error)
      .filter((entry): entry is string => Boolean(entry))
      .join(" | ");
    const summaryError = topLevelError ?? (perSourceErrorSummary || null);
    await supabase
      .from("news_ingest_runs")
      .update({
        finished_at: new Date().toISOString(),
        ok,
        items_inserted: insertedTotal,
        items_skipped: skippedTotal,
        error: summaryError
      })
      .eq("id", runId);
  }

  if (!ok) {
    return {
      ok: false,
      items_inserted: insertedTotal,
      items_skipped: skippedTotal,
      per_source: perSource,
      run_id: runId,
      error: topLevelError
    };
  }

  return {
    ok: true,
    items_inserted: insertedTotal,
    items_skipped: skippedTotal,
    per_source: perSource,
    run_id: runId
  };
}
