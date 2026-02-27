import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

const geocodeQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  proximity: z.string().trim().optional()
});

const mapboxFeatureSchema = z.object({
  id: z.string(),
  place_name: z.string(),
  center: z.tuple([z.number(), z.number()]),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  context: z
    .array(
      z.object({
        id: z.string().optional(),
        text: z.string().optional(),
        short_code: z.string().optional()
      })
    )
    .optional()
});

const mapboxResponseSchema = z.object({
  features: z.array(mapboxFeatureSchema).default([])
});

function parseProximity(value: string | undefined) {
  if (!value) return null;
  const [lngRaw, latRaw] = value.split(",");
  if (!lngRaw || !latRaw) return null;

  const lng = Number(lngRaw.trim());
  const lat = Number(latRaw.trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = geocodeQuerySchema.parse({
      q: url.searchParams.get("q") ?? "",
      proximity: url.searchParams.get("proximity") ?? undefined
    });
    const proximity = parseProximity(parsed.proximity);

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "Missing NEXT_PUBLIC_MAPBOX_TOKEN" }, { status: 500 });
    }

    const endpoint = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(parsed.q)}.json`);
    endpoint.searchParams.set("access_token", token);
    endpoint.searchParams.set("autocomplete", "true");
    endpoint.searchParams.set("limit", "8");
    endpoint.searchParams.set("types", "address,place,poi");
    if (proximity) endpoint.searchParams.set("proximity", `${proximity.lng},${proximity.lat}`);

    const response = await fetch(endpoint.toString(), { cache: "no-store" });
    if (!response.ok) {
      const fallbackMessage = `Mapbox geocoding request failed (${response.status})`;
      return NextResponse.json({ error: fallbackMessage }, { status: 502 });
    }

    const payload = mapboxResponseSchema.parse(await response.json());
    const suggestions = payload.features.map((feature) => ({
      id: feature.id,
      place_name: feature.place_name,
      center: {
        lng: feature.center[0],
        lat: feature.center[1]
      },
      bbox: feature.bbox,
      context: feature.context?.map((item) => ({
        id: item.id ?? "",
        text: item.text ?? "",
        short_code: item.short_code
      }))
    }));

    return NextResponse.json({ suggestions });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid geocode query" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Geocoding request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
