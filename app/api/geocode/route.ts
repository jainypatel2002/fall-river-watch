import { NextResponse } from "next/server";
import { z } from "zod";
import { geocodeQuerySchema, geocodeResponseSchema, parseProximity } from "@/lib/schemas/geocode";

const mapboxResponseSchema = z.object({
  features: z
    .array(
      z.object({
        id: z.string(),
        place_name: z.string(),
        center: z.tuple([z.number(), z.number()]),
        bbox: z.array(z.number()).length(4).optional()
      })
    )
    .default([])
});

function normalizeQuery(value: string) {
  return value.trim().slice(0, 100);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q") ?? "";
  const rawProximity = url.searchParams.get("proximity") ?? undefined;
  const parsedQuery = geocodeQuerySchema.safeParse({
    q: rawQuery,
    proximity: rawProximity
  });
  if (!parsedQuery.success) {
    const query = normalizeQuery(rawQuery);
    return NextResponse.json({ query, features: [] });
  }
  const query = parsedQuery.data.q;
  const proximity = parseProximity(parsedQuery.data.proximity);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    return NextResponse.json({ query, features: [] });
  }

  try {
    const endpoint = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
    endpoint.searchParams.set("access_token", token);
    endpoint.searchParams.set("autocomplete", "true");
    endpoint.searchParams.set("limit", "8");
    endpoint.searchParams.set("types", "address,place,poi");
    if (proximity) endpoint.searchParams.set("proximity", `${proximity.lng},${proximity.lat}`);

    const response = await fetch(endpoint.toString(), { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ query, features: [] });
    }

    const mapboxParsed = mapboxResponseSchema.safeParse(await response.json());
    if (!mapboxParsed.success) {
      return NextResponse.json({ query, features: [] });
    }

    const normalized = geocodeResponseSchema.parse({
      query,
      features: mapboxParsed.data.features.map((feature) => ({
        id: feature.id,
        label: feature.place_name,
        center: {
          lng: feature.center[0],
          lat: feature.center[1]
        },
        bbox: feature.bbox
      }))
    });

    return NextResponse.json(normalized);
  } catch {
    return NextResponse.json({ query, features: [] });
  }
}
