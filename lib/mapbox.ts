import { z } from "zod";

const FALL_RIVER_PROXIMITY = {
  lat: 41.7015,
  lng: -71.155
};

// Rough boundary around Fall River and immediate nearby area.
const FALL_RIVER_BBOX = {
  west: -71.22,
  south: 41.62,
  east: -71.08,
  north: 41.78
};

const mapboxContextSchema = z.object({
  id: z.string().optional().default(""),
  text: z.string().optional().default(""),
  short_code: z.string().optional()
});

const mapboxFeatureSchema = z.object({
  id: z.string().optional(),
  text: z.string().optional().default(""),
  place_name: z.string().optional().default(""),
  place_type: z.array(z.string()).optional().default([]),
  center: z.tuple([z.number(), z.number()]).optional(),
  address: z.union([z.string(), z.number()]).optional(),
  context: z.array(mapboxContextSchema).optional().default([]),
  properties: z
    .object({
      address: z.string().optional(),
      name: z.string().optional(),
      mapbox_id: z.string().optional()
    })
    .optional()
});

const mapboxResponseSchema = z.object({
  features: z.array(mapboxFeatureSchema).default([])
});

export type PlaceSuggestion = {
  place_id: string | null;
  title: string;
  location_name: string;
  formatted_address: string;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number;
  lng: number;
};

function normalizeValue(value: string | null | undefined) {
  const next = value?.trim();
  return next ? next : null;
}

function pickContextValue(context: Array<z.infer<typeof mapboxContextSchema>>, prefix: string) {
  return context.find((item) => item.id.startsWith(prefix)) ?? null;
}

function normalizeState(context: Array<z.infer<typeof mapboxContextSchema>>) {
  const region = pickContextValue(context, "region.");
  if (!region) return null;

  const shortCode = region.short_code?.trim().toLowerCase();
  if (shortCode?.startsWith("us-") && shortCode.length > 3) {
    return shortCode.slice(3).toUpperCase();
  }

  return normalizeValue(region.text);
}

function normalizeStreet(feature: z.infer<typeof mapboxFeatureSchema>) {
  const isAddress = feature.place_type.includes("address");
  const numberPart = typeof feature.address === "number" ? String(feature.address) : feature.address?.trim() ?? "";
  const streetName = feature.text.trim();
  const composed = [numberPart, streetName].filter(Boolean).join(" ").trim();
  if (isAddress && composed) return composed;

  const propertyAddress = normalizeValue(feature.properties?.address);
  if (propertyAddress) return propertyAddress;

  if (isAddress) return normalizeValue(streetName);
  return null;
}

function toSuggestion(feature: z.infer<typeof mapboxFeatureSchema>): PlaceSuggestion | null {
  if (!feature.center || feature.center.length !== 2) return null;
  const [lng, lat] = feature.center;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const cityFromContext = normalizeValue(pickContextValue(feature.context, "place.")?.text);
  const city = cityFromContext ?? (feature.place_type.includes("place") ? normalizeValue(feature.text) : null);
  const state = normalizeState(feature.context);
  const zip = normalizeValue(pickContextValue(feature.context, "postcode.")?.text);
  const title = normalizeValue(feature.text) ?? normalizeValue(feature.place_name) ?? "Selected location";

  return {
    place_id: normalizeValue(feature.id ?? feature.properties?.mapbox_id),
    title,
    location_name: title,
    formatted_address: normalizeValue(feature.place_name) ?? title,
    street: normalizeStreet(feature),
    city,
    state,
    zip,
    lat,
    lng
  };
}

export async function searchPlaces(query: string, options?: { signal?: AbortSignal }): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return [];

  const endpoint = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json`);
  endpoint.searchParams.set("access_token", token);
  endpoint.searchParams.set("autocomplete", "true");
  endpoint.searchParams.set("limit", "5");
  endpoint.searchParams.set("types", "address,poi,place");
  endpoint.searchParams.set("country", "us");
  endpoint.searchParams.set("proximity", `${FALL_RIVER_PROXIMITY.lng},${FALL_RIVER_PROXIMITY.lat}`);
  endpoint.searchParams.set(
    "bbox",
    `${FALL_RIVER_BBOX.west},${FALL_RIVER_BBOX.south},${FALL_RIVER_BBOX.east},${FALL_RIVER_BBOX.north}`
  );

  const response = await fetch(endpoint.toString(), {
    cache: "no-store",
    signal: options?.signal
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Mapbox token is invalid or missing geocoding permissions.");
    }

    return [];
  }

  const parsed = mapboxResponseSchema.safeParse(await response.json());
  if (!parsed.success) return [];

  return parsed.data.features.map(toSuggestion).filter((item): item is PlaceSuggestion => Boolean(item)).slice(0, 5);
}
