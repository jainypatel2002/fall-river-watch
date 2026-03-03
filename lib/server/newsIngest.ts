import "server-only";

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

type ParseOutcome = {
  seen: number;
  skipped: number;
  items: CandidateNewsItem[];
};

export type NewsIngestDetail = {
  sourceId: string;
  sourceName: string;
  sourceType: "rss" | "html";
  seen: number;
  inserted: number;
  skipped: number;
  error: string | null;
};

export type NewsIngestSummary = {
  inserted: number;
  skipped: number;
  sources: number;
  tookMs: number;
  details?: NewsIngestDetail[];
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
const CANONICAL_FETCH_CHUNK = 200;

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

function readSupabaseEnv() {
  const url = cleanText(process.env.SUPABASE_URL) || cleanText(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey =
    cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    cleanText(process.env.SUPABASE_SERVICE_KEY) ||
    cleanText(process.env.SUPABASE_SECRET_KEY);

  if (!url) {
    throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return { url, serviceRoleKey };
}

function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = readSupabaseEnv();

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
  return `${trimmed.slice(0, NEWS_SUMMARY_LIMIT - 3).trimEnd()}...`;
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
  const trimmed = cleanText(rawUrl);
  if (!trimmed) return null;

  try {
    const url = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);

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

async function parseRssSource(source: NewsSource, city: string | null, state: string | null): Promise<ParseOutcome> {
  if (!source.feed_url) {
    return { seen: 0, skipped: 0, items: [] };
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

  let skipped = 0;
  let seen = 0;
  const rows: CandidateNewsItem[] = [];

  for (const item of feed.items ?? []) {
    seen += 1;

    const title = cleanText(item.title);
    if (!title) {
      skipped += 1;
      continue;
    }

    const rawLink = cleanText(item.link ?? item.guid ?? "");
    const originalUrl = normalizeUrl(rawLink, baseUrl);
    if (!originalUrl) {
      skipped += 1;
      continue;
    }

    const canonicalUrl = normalizeUrl(originalUrl, baseUrl);
    if (!canonicalUrl) {
      skipped += 1;
      continue;
    }

    const summarySource = pickFirstNonEmpty([
      item.contentSnippet,
      item.summary,
      stripHtml(item.description ?? ""),
      stripHtml(item["content:encoded"] ?? ""),
      stripHtml(item.content ?? "")
    ]);

    const rawImage =
      item.enclosure?.url ??
      normalizeMediaField(item["media:content"]) ??
      normalizeMediaField(item["media:thumbnail"]) ??
      extractFirstImageFromHtml(item["content:encoded"] ?? item.content ?? item.description);

    rows.push({
      source_id: source.id,
      source_name: source.name,
      is_official: source.is_official,
      title,
      canonical_url: canonicalUrl,
      original_url: originalUrl,
      published_at: parseDate(item.isoDate ?? item.pubDate),
      summary: truncateSummary(summarySource),
      image_url: normalizeUrl(rawImage, baseUrl),
      category: categorizeByTitle(title, source.is_official),
      city,
      state
    });
  }

  return {
    seen,
    skipped,
    items: rows
  };
}

function extractPressReleaseCandidates(
  source: NewsSource,
  html: string,
  city: string | null,
  state: string | null
): ParseOutcome {
  const $ = cheerio.load(html);
  const baseUrl = source.page_url ?? source.site_url;
  const siteHost = source.site_url ? normalizeUrl(source.site_url) : null;
  const normalizedSiteHost = siteHost ? new URL(siteHost).host : null;

  const anchors = $("a[href]").toArray();
  const rows: CandidateNewsItem[] = [];
  const seenCanonical = new Set<string>();
  let seen = 0;
  let skipped = 0;

  for (const anchor of anchors) {
    const element = $(anchor);
    const href = cleanText(element.attr("href"));
    const title = cleanText(element.text());

    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) {
      continue;
    }

    const contextText = cleanText(element.closest("li, tr, p, div").first().text());
    const combinedContext = cleanText(`${title} ${contextText}`);
    const looksLikePressRelease =
      /press release|document center|mayor|city council|city of/i.test(combinedContext) ||
      /documentcenter|press_releases/i.test(href) ||
      /\.pdf(?:$|\?)/i.test(href);

    if (!looksLikePressRelease) {
      continue;
    }

    seen += 1;

    if (!title) {
      skipped += 1;
      continue;
    }

    const originalUrl = normalizeUrl(href, baseUrl);
    if (!originalUrl) {
      skipped += 1;
      continue;
    }

    if (normalizedSiteHost && new URL(originalUrl).host !== normalizedSiteHost) {
      skipped += 1;
      continue;
    }

    const canonicalUrl = normalizeUrl(originalUrl, baseUrl);
    if (!canonicalUrl) {
      skipped += 1;
      continue;
    }

    if (seenCanonical.has(canonicalUrl)) {
      skipped += 1;
      continue;
    }

    seenCanonical.add(canonicalUrl);
    rows.push({
      source_id: source.id,
      source_name: source.name,
      is_official: true,
      title,
      canonical_url: canonicalUrl,
      original_url: originalUrl,
      published_at: parseDateFromText(combinedContext),
      summary: truncateSummary(contextText.replace(title, "")),
      image_url: null,
      category: "city",
      city,
      state
    });
  }

  return {
    seen,
    skipped,
    items: rows
  };
}

async function parseHtmlSource(source: NewsSource, city: string | null, state: string | null): Promise<ParseOutcome> {
  if (!source.page_url) {
    return { seen: 0, skipped: 0, items: [] };
  }

  const html = await fetchTextWithRetries(source.page_url);
  return extractPressReleaseCandidates(source, html, city, state);
}

async function fetchExistingCanonicalUrls(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  canonicalUrls: string[]
): Promise<Set<string>> {
  const found = new Set<string>();

  for (const chunk of chunkArray(canonicalUrls, CANONICAL_FETCH_CHUNK)) {
    const { data, error } = await supabase.from("news_items").select("canonical_url").in("canonical_url", chunk);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of data ?? []) {
      if (typeof row.canonical_url === "string" && row.canonical_url) {
        found.add(row.canonical_url);
      }
    }
  }

  return found;
}

async function upsertCandidates(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  candidates: CandidateNewsItem[],
  parseSkipped: number
): Promise<{ inserted: number; skipped: number }> {
  if (candidates.length === 0) {
    return { inserted: 0, skipped: parseSkipped };
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

  for (const page of chunkArray(deduped, PAGE_SIZE_UPSERT)) {
    const { error } = await supabase.from("news_items").upsert(page, { onConflict: "canonical_url" });

    if (error) {
      throw new Error(error.message);
    }
  }

  const existingCount = existingCanonicalUrls.size;
  const inserted = Math.max(0, deduped.length - existingCount);
  const skipped = parseSkipped + duplicateSkips + existingCount;

  return {
    inserted,
    skipped
  };
}

async function createIngestRun(
  supabase: ReturnType<typeof createSupabaseAdminClient>
): Promise<string | null> {
  try {
    const { data: runRow, error } = await supabase
      .from("news_ingest_runs")
      .insert({ ok: true })
      .select("id")
      .maybeSingle();

    if (error) {
      return null;
    }

    return runRow?.id ?? null;
  } catch {
    return null;
  }
}

async function finalizeIngestRun(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  runId: string | null,
  {
    ok,
    inserted,
    skipped,
    details,
    fatalError
  }: {
    ok: boolean;
    inserted: number;
    skipped: number;
    details: NewsIngestDetail[];
    fatalError: string | null;
  }
): Promise<void> {
  if (!runId) {
    return;
  }

  try {
    const perSourceErrorSummary = details
      .map((entry) => entry.error)
      .filter((entry): entry is string => Boolean(entry))
      .join(" | ");

    await supabase
      .from("news_ingest_runs")
      .update({
        finished_at: new Date().toISOString(),
        ok,
        items_inserted: inserted,
        items_skipped: skipped,
        error: fatalError || perSourceErrorSummary || null
      })
      .eq("id", runId);
  } catch {
    // Best-effort logging only.
  }
}

export async function runNewsIngest(): Promise<NewsIngestSummary> {
  const startedAt = Date.now();
  const supabase = createSupabaseAdminClient();
  const city = cleanText(process.env.NEWS_DEFAULT_CITY) || null;
  const state = cleanText(process.env.NEWS_DEFAULT_STATE) || null;

  const runId = await createIngestRun(supabase);
  const details: NewsIngestDetail[] = [];

  let insertedTotal = 0;
  let skippedTotal = 0;
  let sourceCount = 0;
  let fatalError: string | null = null;

  try {
    const { data: sources, error: sourcesError } = await supabase
      .from("news_sources")
      .select("id, name, source_type, feed_url, page_url, site_url, enabled, fetch_interval_minutes, is_official")
      .eq("enabled", true)
      .order("name", { ascending: true });

    if (sourcesError) {
      throw new Error(sourcesError.message);
    }

    sourceCount = sources?.length ?? 0;

    for (const source of (sources ?? []) as NewsSource[]) {
      const sourceDetail: NewsIngestDetail = {
        sourceId: source.id,
        sourceName: source.name,
        sourceType: source.source_type,
        seen: 0,
        inserted: 0,
        skipped: 0,
        error: null
      };

      try {
        const parsed =
          source.source_type === "rss"
            ? await parseRssSource(source, city, state)
            : await parseHtmlSource(source, city, state);

        sourceDetail.seen = parsed.seen;

        const { inserted, skipped } = await upsertCandidates(supabase, parsed.items, parsed.skipped);
        sourceDetail.inserted = inserted;
        sourceDetail.skipped = skipped;

        insertedTotal += inserted;
        skippedTotal += skipped;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sourceDetail.error = message;
        sourceDetail.skipped = sourceDetail.seen > 0 ? sourceDetail.seen : 1;
        skippedTotal += sourceDetail.skipped;
      }

      details.push(sourceDetail);
    }
  } catch (error) {
    fatalError = error instanceof Error ? error.message : String(error);
  }

  const hasSourceErrors = details.some((entry) => entry.error);
  const ok = !fatalError;

  await finalizeIngestRun(supabase, runId, {
    ok: ok && !hasSourceErrors,
    inserted: insertedTotal,
    skipped: skippedTotal,
    details,
    fatalError
  });

  if (fatalError) {
    throw new Error(fatalError);
  }

  return {
    inserted: insertedTotal,
    skipped: skippedTotal,
    sources: sourceCount,
    tookMs: Date.now() - startedAt,
    details
  };
}

export async function runNewsIngestion(): Promise<NewsIngestSummary> {
  return runNewsIngest();
}
