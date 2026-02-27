import { z } from "zod";

export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  proximity: z.string().trim().optional()
});

export const geocodeFeatureSchema = z.object({
  id: z.string(),
  label: z.string(),
  center: z.object({
    lng: z.number().finite().min(-180).max(180),
    lat: z.number().finite().min(-90).max(90)
  }),
  bbox: z.array(z.number().finite()).length(4).optional()
});

export const geocodeResponseSchema = z.object({
  query: z.string(),
  features: z.array(geocodeFeatureSchema)
});

export function parseProximity(value: string | undefined) {
  if (!value) return null;

  const [lngRaw, latRaw] = value.split(",");
  if (!lngRaw || !latRaw) return null;

  const lng = Number(lngRaw.trim());
  const lat = Number(latRaw.trim());
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;

  return { lng, lat };
}

export type GeocodeFeature = z.infer<typeof geocodeFeatureSchema>;
export type GeocodeResponse = z.infer<typeof geocodeResponseSchema>;
