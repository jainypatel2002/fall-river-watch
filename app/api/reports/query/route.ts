import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reportFiltersSchema } from "@/lib/schemas/report";
import { reportsQueryResponseSchema } from "@/lib/schemas/api";
import { getTimeWindowHours, runReportExpiration } from "@/lib/server/reports";

const ANONYMOUS_REPORTER_ID = "00000000-0000-0000-0000-000000000000";

type Point = { lat: number; lng: number };
type Bounds = { north: number; south: number; east: number; west: number };

type ReportResponseRecord = {
  id: string;
  reporter_id: string;
  category: string;
  title: string | null;
  description: string;
  severity: number;
  status: string;
  created_at: string;
  expires_at: string;
  display_lat: number;
  display_lng: number;
  distance_meters: number | null;
  confirms: number;
  disputes: number;
  media: Array<{ id: string; storage_path: string; media_type: "image" }>;
};

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function isFunctionMissingError(error: PostgrestLikeError) {
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return (
    error.code === "PGRST202" ||
    (text.includes("get_reports_nearby") && text.includes("schema cache")) ||
    text.includes("could not find the function public.get_reports_nearby")
  );
}

function toFiniteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePointFromEwkbHex(value: string): Point | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length < 42) return null;

  try {
    const byteCount = value.length / 2;
    const bytes = new Uint8Array(byteCount);
    for (let index = 0; index < byteCount; index += 1) {
      const pair = value.slice(index * 2, index * 2 + 2);
      bytes[index] = Number.parseInt(pair, 16);
    }
    if (bytes.length < 21) return null;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const littleEndian = view.getUint8(0) === 1;
    let offset = 1;

    const type = view.getUint32(offset, littleEndian);
    offset += 4;

    const hasSrid = (type & 0x20000000) !== 0;
    const baseType = type & 0x0000ffff;
    if (baseType !== 1) return null;
    if (hasSrid) offset += 4;

    if (offset + 16 > view.byteLength) return null;
    const lng = view.getFloat64(offset, littleEndian);
    const lat = view.getFloat64(offset + 8, littleEndian);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
  } catch {
    return null;
  }
}

function parsePoint(value: unknown): Point | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    const pointMatch = trimmed.match(/POINT\s*\(\s*([-0-9.]+)\s+([-0-9.]+)\s*\)/i);
    if (pointMatch) {
      const lng = Number(pointMatch[1]);
      const lat = Number(pointMatch[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }

    const ewkbPoint = parsePointFromEwkbHex(trimmed);
    if (ewkbPoint) return ewkbPoint;

    try {
      const parsed = JSON.parse(trimmed);
      return parsePoint(parsed);
    } catch {
      return null;
    }
  }

  if (typeof value === "object") {
    const item = value as Record<string, unknown>;

    if (Array.isArray(item.coordinates) && item.coordinates.length >= 2) {
      const lng = toFiniteNumber(item.coordinates[0]);
      const lat = toFiniteNumber(item.coordinates[1]);
      if (lat !== null && lng !== null) return { lat, lng };
    }

    const lat = toFiniteNumber(item.lat);
    const lng = toFiniteNumber(item.lng);
    if (lat !== null && lng !== null) return { lat, lng };
  }

  return null;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineMeters(a: Point, b: Point) {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const term = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const arc = 2 * Math.atan2(Math.sqrt(term), Math.sqrt(1 - term));
  return earthRadiusMeters * arc;
}

function isWithinBounds(point: Point, bounds: Bounds) {
  if (point.lat > bounds.north || point.lat < bounds.south) return false;
  if (bounds.west <= bounds.east) {
    return point.lng >= bounds.west && point.lng <= bounds.east;
  }
  return point.lng >= bounds.west || point.lng <= bounds.east;
}

function normalizeMedia(media: unknown): Array<{ id: string; storage_path: string; media_type: "image" }> {
  if (!Array.isArray(media)) return [];

  return media.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = row.id ? String(row.id) : null;
    const storagePath = row.storage_path ? String(row.storage_path) : null;
    if (!id || !storagePath) return [];
    return [{ id, storage_path: storagePath, media_type: "image" as const }];
  });
}

function normalizeRpcEnrichedRows(rows: Record<string, unknown>[]) {
  return rows.flatMap((row): ReportResponseRecord[] => {
    const displayLat = toFiniteNumber(row.display_lat);
    const displayLng = toFiniteNumber(row.display_lng);
    if (displayLat === null || displayLng === null) return [];

    return [
      {
        id: String(row.id),
        reporter_id: String(row.reporter_id),
        category: String(row.category),
        title: row.title === null || row.title === undefined ? null : String(row.title),
        description: String(row.description ?? ""),
        severity: Number(row.severity ?? 1),
        status: String(row.status ?? "unverified"),
        created_at: String(row.created_at ?? ""),
        expires_at: String(row.expires_at ?? ""),
        display_lat: displayLat,
        display_lng: displayLng,
        distance_meters: toFiniteNumber(row.distance_meters),
        confirms: Number(row.confirms ?? 0),
        disputes: Number(row.disputes ?? 0),
        media: normalizeMedia(row.media)
      }
    ];
  });
}

function normalizeReportRows(
  rows: Record<string, unknown>[],
  center: Point,
  radiusMiles: number,
  applyRadiusFilter: boolean
) {
  const radiusMeters = radiusMiles * 1609.344;

  return rows.flatMap((row): ReportResponseRecord[] => {
    const category = String(row.category ?? "");
    const displaySource = category === "suspicious_activity" ? row.obfuscated_location : row.location;
    const displayPoint = parsePoint(displaySource);
    if (!displayPoint) return [];

    const distanceMeters = haversineMeters(center, displayPoint);
    if (applyRadiusFilter && distanceMeters > radiusMeters) return [];

    return [
      {
        id: String(row.id),
        reporter_id: String(row.reporter_id),
        category,
        title: row.title === null || row.title === undefined ? null : String(row.title),
        description: String(row.description ?? ""),
        severity: Number(row.severity ?? 1),
        status: String(row.status ?? "unverified"),
        created_at: String(row.created_at ?? ""),
        expires_at: String(row.expires_at ?? ""),
        display_lat: displayPoint.lat,
        display_lng: displayPoint.lng,
        distance_meters: distanceMeters,
        confirms: 0,
        disputes: 0,
        media: []
      }
    ];
  });
}

async function hydrateVotesAndMedia(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  reports: ReportResponseRecord[]
) {
  const reportIds = reports.map((report) => report.id);
  if (!reportIds.length) return reports;

  const [{ data: votes, error: votesError }, { data: media, error: mediaError }] = await Promise.all([
    supabase.from("report_votes").select("report_id, vote_type").in("report_id", reportIds),
    supabase
      .from("report_media")
      .select("id, report_id, storage_path, media_type, created_at")
      .in("report_id", reportIds)
      .order("created_at", { ascending: true })
  ]);

  if (votesError || mediaError) {
    throw new Error(votesError?.message ?? mediaError?.message ?? "Failed to load report votes/media");
  }

  const voteCounts = new Map<string, { confirms: number; disputes: number }>();
  for (const vote of votes ?? []) {
    const entry = voteCounts.get(vote.report_id) ?? { confirms: 0, disputes: 0 };
    if (vote.vote_type === "confirm") entry.confirms += 1;
    if (vote.vote_type === "dispute") entry.disputes += 1;
    voteCounts.set(vote.report_id, entry);
  }

  const mediaByReport = new Map<string, Array<{ id: string; storage_path: string; media_type: "image" }>>();
  for (const item of media ?? []) {
    const bucket = mediaByReport.get(item.report_id) ?? [];
    bucket.push({
      id: item.id,
      storage_path: item.storage_path,
      media_type: "image"
    });
    mediaByReport.set(item.report_id, bucket);
  }

  return reports.map((report) => ({
    ...report,
    confirms: voteCounts.get(report.id)?.confirms ?? 0,
    disputes: voteCounts.get(report.id)?.disputes ?? 0,
    media: mediaByReport.get(report.id) ?? []
  }));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const filters = reportFiltersSchema.parse(body);
    const hours = getTimeWindowHours(filters.timeWindow);
    const center = { lat: filters.centerLat, lng: filters.centerLng };

    const supabase = await createSupabaseServerClient();
    await runReportExpiration(supabase);

    const { data: rpcData, error: rpcError } = await supabase.rpc("get_reports_nearby", {
      p_categories: filters.categories,
      p_center_lat: filters.centerLat,
      p_center_lng: filters.centerLng,
      p_hours: hours,
      p_radius_miles: filters.radiusMiles,
      p_verified_only: filters.verifiedOnly
    });

    let fallbackUsed = false;
    let rows: Record<string, unknown>[] = (rpcData ?? []) as Record<string, unknown>[];

    if (rpcError) {
      if (!isFunctionMissingError(rpcError)) {
        return NextResponse.json({ error: rpcError.message }, { status: 500 });
      }

      fallbackUsed = true;
      const now = new Date();
      const fromTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

      let fallbackQuery = supabase
        .from("reports")
        .select(
          "id, reporter_id, category, title, description, severity, status, created_at, expires_at, location, obfuscated_location"
        )
        .gte("created_at", fromTime.toISOString())
        .gt("expires_at", now.toISOString())
        .order("created_at", { ascending: false });

      if (filters.verifiedOnly) {
        fallbackQuery = fallbackQuery.eq("status", "verified");
      }
      if (filters.categories.length) {
        fallbackQuery = fallbackQuery.in("category", filters.categories);
      }

      const { data: fallbackData, error: fallbackError } = await fallbackQuery;
      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      }

      rows = (fallbackData ?? []) as Record<string, unknown>[];
    }

    const hasDisplayColumns = rows.some((row) => "display_lat" in row && "display_lng" in row);

    let reports = hasDisplayColumns
      ? normalizeRpcEnrichedRows(rows)
      : normalizeReportRows(
          rows,
          center,
          filters.radiusMiles,
          // Temporary fallback: distance filtering is done in JS when RPC is unavailable.
          fallbackUsed
        );

    if (!hasDisplayColumns) {
      reports = await hydrateVotesAndMedia(supabase, reports);
    }

    if (reports.length) {
      const reportIds = reports.map((report) => report.id);
      const { data: anonymityRows, error: anonymityError } = await supabase.from("reports").select("id, is_anonymous").in("id", reportIds);

      if (anonymityError) {
        return NextResponse.json({ error: anonymityError.message }, { status: 500 });
      }

      const anonymousIds = new Set((anonymityRows ?? []).filter((row) => row.is_anonymous).map((row) => row.id));
      if (anonymousIds.size) {
        reports = reports.map((report) =>
          anonymousIds.has(report.id)
            ? {
                ...report,
                reporter_id: ANONYMOUS_REPORTER_ID
              }
            : report
        );
      }
    }

    const bounds = filters.bounds;
    if (bounds) {
      reports = reports.filter((report) => isWithinBounds({ lat: report.display_lat, lng: report.display_lng }, bounds));
    }

    const validated = reportsQueryResponseSchema.parse({
      reports,
      fallbackUsed: fallbackUsed || undefined
    });

    return NextResponse.json(validated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    const status = error instanceof ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
