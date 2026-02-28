import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { INCIDENT_CATEGORIES, TIME_WINDOWS } from "@/lib/utils/constants";
import { parseIncidentCategories } from "@/lib/incidents/categories";
import { createIncidentSchema } from "@/lib/schemas/incident";
import { decodeTimestampCursor, encodeTimestampCursor } from "@/lib/server/cursor";
import { getTimeWindowHours, runReportExpiration } from "@/lib/server/reports";
import { requireAuth } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dispatchNotifications } from "@/lib/notifications/dispatch";

function parseBbox(raw: string | null) {
  if (!raw) return null;
  const parts = raw.split(",").map((value) => Number(value));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const [west, south, east, north] = parts;
  if (south < -90 || south > 90 || north < -90 || north > 90 || west < -180 || west > 180 || east < -180 || east > 180) {
    return null;
  }

  if (north < south) return null;

  return { west, south, east, north };
}

function parseLimit(raw: string | null) {
  const parsed = Number(raw ?? 200);
  if (!Number.isFinite(parsed)) return 200;
  return Math.max(1, Math.min(500, Math.trunc(parsed)));
}

function parseCategoriesFromSearchParams(searchParams: URLSearchParams) {
  const raw = [
    ...searchParams
      .getAll("categories")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean),
    ...searchParams
      .getAll("category")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean)
  ];

  if (!raw.length) {
    return { categories: [...INCIDENT_CATEGORIES] as string[] };
  }

  const parsed = parseIncidentCategories(raw);
  const invalid = raw.filter((value) => !INCIDENT_CATEGORIES.includes(value as (typeof INCIDENT_CATEGORIES)[number]));

  if (invalid.length) {
    return { error: `Unsupported category keys: ${invalid.join(", ")}` };
  }

  return { categories: parsed };
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();

  try {
    const url = new URL(request.url);
    const bbox = parseBbox(url.searchParams.get("bbox"));
    if (!bbox) {
      return NextResponse.json({ error: "bbox is required and must be west,south,east,north" }, { status: 400 });
    }

    const categoriesResult = parseCategoriesFromSearchParams(url.searchParams);
    if (categoriesResult.error) {
      return NextResponse.json({ error: categoriesResult.error }, { status: 400 });
    }

    const limit = parseLimit(url.searchParams.get("limit"));
    const cursorParam = url.searchParams.get("cursor");
    const cursor = decodeTimestampCursor(cursorParam);
    if (cursorParam && !cursor) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }

    const timeRange = url.searchParams.get("timeRange");
    if (timeRange && !TIME_WINDOWS.includes(timeRange as (typeof TIME_WINDOWS)[number])) {
      return NextResponse.json({ error: "Invalid timeRange" }, { status: 400 });
    }

    await runReportExpiration(supabase);

    const { data, error } = await supabase.rpc("get_incidents_bbox", {
      p_west: bbox.west,
      p_south: bbox.south,
      p_east: bbox.east,
      p_north: bbox.north,
      p_categories: categoriesResult.categories,
      p_hours: timeRange ? getTimeWindowHours(timeRange as (typeof TIME_WINDOWS)[number]) : null,
      p_limit: limit,
      p_cursor_created_at: cursor?.createdAt ?? null,
      p_cursor_id: cursor?.id ?? null
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Array<{
      id: string;
      category: string;
      title: string | null;
      description: string;
      severity: number;
      status: string;
      created_at: string;
      lat: number;
      lng: number;
      is_anonymous: boolean;
      author_display_name: string;
      danger_radius_meters: number | null;
      danger_center_lat: number | null;
      danger_center_lng: number | null;
    }>;

    const items = rows.map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      description: row.description,
      severity: row.severity,
      status: row.status,
      lat: row.lat,
      lng: row.lng,
      created_at: row.created_at,
      is_anonymous: row.is_anonymous,
      author_display_name: row.is_anonymous ? "Anonymous" : row.author_display_name,
      danger_radius_meters: row.danger_radius_meters,
      danger_center_lat: row.danger_center_lat,
      danger_center_lng: row.danger_center_lng
    }));

    const last = rows[rows.length - 1];
    const nextCursor = rows.length === limit && last ? encodeTimestampCursor({ createdAt: last.created_at, id: last.id }) : null;

    return NextResponse.json({ items, nextCursor });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    const status = error instanceof ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const payload = createIncidentSchema.parse(body);

    // Existing schema uses `reports.reporter_id` as creator ownership.
    const { data: inserted, error: insertError } = await auth.supabase
      .from("reports")
      .insert({
        reporter_id: auth.user.id,
        category: payload.category,
        title: payload.title,
        description: payload.description,
        severity: 3,
        location: `SRID=4326;POINT(${payload.lng} ${payload.lat})`,
        is_anonymous: payload.is_anonymous,
        danger_radius_meters: payload.danger_radius_meters ?? null,
        danger_center_lat: payload.danger_radius_meters ? (payload.danger_center_lat ?? payload.lat) : null,
        danger_center_lng: payload.danger_radius_meters ? (payload.danger_center_lng ?? payload.lng) : null
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json({ error: insertError?.message ?? "Failed to create incident" }, { status: 400 });
    }

    await runReportExpiration(auth.supabase);

    const { data: detailRows, error: detailError } = await auth.supabase.rpc("get_incident_detail", {
      p_incident_id: inserted.id
    });

    if (detailError || !detailRows?.length) {
      return NextResponse.json({ error: detailError?.message ?? "Incident created but detail lookup failed" }, { status: 500 });
    }

    const detail = detailRows[0] as {
      id: string;
      category: string;
      title: string | null;
      description: string;
      severity: number;
      status: string;
      created_at: string;
      updated_at: string;
      lat: number;
      lng: number;
      is_anonymous: boolean;
      author_display_name: string;
      danger_radius_meters: number | null;
      danger_center_lat: number | null;
      danger_center_lng: number | null;
      top_level_comment_count: number;
    };

    // Fire-and-forget background push/email notifications
    dispatchNotifications({
      incidentId: detail.id,
      category: detail.category,
      title: detail.title,
      description: detail.description,
      lat: detail.lat,
      lng: detail.lng
    }).catch((err) => console.error("[Dispatch error]", err));

    return NextResponse.json(
      {
        incident: {
          id: detail.id,
          category: detail.category,
          title: detail.title,
          description: detail.description,
          severity: detail.severity,
          status: detail.status,
          lat: detail.lat,
          lng: detail.lng,
          created_at: detail.created_at,
          updated_at: detail.updated_at,
          is_anonymous: detail.is_anonymous,
          author_display_name: detail.is_anonymous ? "Anonymous" : detail.author_display_name,
          danger_radius_meters: detail.danger_radius_meters,
          danger_center_lat: detail.danger_center_lat,
          danger_center_lng: detail.danger_center_lng
        }
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    const status = error instanceof ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
