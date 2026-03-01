import { NextResponse } from "next/server";
import { z } from "zod";
import { getWeatherSnapshot, WeatherProviderError } from "@/lib/server/weather";

export const runtime = "nodejs";

const coordinateSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => Number(value))
  .refine((value) => Number.isFinite(value), "Must be a valid number");

const querySchema = z.object({
  lat: coordinateSchema.refine((value) => value >= -90 && value <= 90, "Latitude out of range"),
  lng: coordinateSchema.refine((value) => value >= -180 && value <= 180, "Longitude out of range"),
  units: z.enum(["imperial", "metric"]).default("imperial"),
  source: z.enum(["mapCenter", "userLocation"]).optional()
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    lat: url.searchParams.get("lat"),
    lng: url.searchParams.get("lng"),
    units: url.searchParams.get("units") ?? "imperial",
    source: url.searchParams.get("source") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid weather query. `lat` and `lng` are required within valid coordinate ranges."
      },
      { status: 400 }
    );
  }

  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE) {
      console.warn("Missing WEATHER_API_KEY in server environment.");
    }
    return NextResponse.json({ error: "Server weather configuration missing" }, { status: 500 });
  }

  try {
    const weather = await getWeatherSnapshot({
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      units: parsed.data.units,
      apiKey
    });
    return NextResponse.json(weather);
  } catch (error) {
    if (error instanceof WeatherProviderError) {
      return NextResponse.json({ error: "Weather provider unavailable" }, { status: 502 });
    }
    console.error("[weather-route] unexpected error", error);
    return NextResponse.json({ error: "Weather provider unavailable" }, { status: 502 });
  }
}
