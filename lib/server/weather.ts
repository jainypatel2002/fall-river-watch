import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WeatherAlert, WeatherApiResponse, WeatherDaily, WeatherHourly, WeatherUnits } from "@/lib/weather/types";

const SHORT_TTL_MS = 15 * 60 * 1000;
const DAILY_TTL_MS = 60 * 60 * 1000;
const HOURLY_LIMIT = 8;
const DAILY_LIMIT = 4;
const PROVIDER = "openweather";
const CACHE_SOURCE_SHORT = "short";
const CACHE_SOURCE_DAILY = "daily";

type CacheRow = {
  key: string;
  payload: unknown;
  expires_at: string;
};

type ShortSegmentPayload = {
  current: WeatherApiResponse["current"];
  hourly: WeatherHourly[];
  alerts: WeatherAlert[];
  fetchedAt: string;
};

type DailySegmentPayload = {
  daily: WeatherDaily[];
  fetchedAt: string;
};

type OpenWeatherBlock = {
  dt?: number;
  temp?: number | { min?: number; max?: number };
  feels_like?: number;
  humidity?: number;
  wind_speed?: number;
  pop?: number;
  rain?: { "1h"?: number };
  snow?: { "1h"?: number };
  weather?: Array<{ main?: string; description?: string; icon?: string }>;
};

type OpenWeatherAlert = {
  event?: string;
  start?: number;
  end?: number;
  description?: string;
  tags?: string[];
};

type OpenWeatherOneCallResponse = {
  current?: OpenWeatherBlock;
  hourly?: OpenWeatherBlock[];
  daily?: OpenWeatherBlock[];
  alerts?: OpenWeatherAlert[];
};

const inFlightByCacheKey = new Map<string, Promise<unknown>>();
const inMemoryWeatherCache = new Map<
  string,
  {
    payload: unknown;
    expiresAt: number;
  }
>();

export class WeatherProviderError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "WeatherProviderError";
    this.status = status;
  }
}

function roundCoordinate(value: number) {
  return Math.round(value * 100) / 100;
}

function cacheKeyBase(lat: number, lng: number, units: WeatherUnits) {
  return `lat:${roundCoordinate(lat).toFixed(2)}|lng:${roundCoordinate(lng).toFixed(2)}|units:${units}`;
}

function toIso(timestampSeconds: number | undefined, fallback: Date) {
  if (!timestampSeconds || !Number.isFinite(timestampSeconds)) return fallback.toISOString();
  return new Date(timestampSeconds * 1000).toISOString();
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function asWholeNumber(value: unknown, fallback = 0) {
  return Math.round(asNumber(value, fallback));
}

function windToMph(value: unknown, units: WeatherUnits) {
  const numeric = asNumber(value, 0);
  if (units === "imperial") return Math.round(numeric);
  return Math.round(numeric * 2.2369362921);
}

function probabilityToPercent(value: unknown) {
  const numeric = asNumber(value, 0);
  return Math.max(0, Math.min(100, Math.round(numeric * 100)));
}

function firstWeatherItem(block: OpenWeatherBlock | undefined) {
  return block?.weather?.[0];
}

function sanitizeAlertId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function inferSeverity(alert: OpenWeatherAlert) {
  const text = `${alert.event ?? ""} ${(alert.tags ?? []).join(" ")}`.toLowerCase();
  if (text.includes("extreme") || text.includes("warning")) return "warning";
  if (text.includes("watch") || text.includes("moderate")) return "watch";
  if (text.includes("advisory")) return "advisory";
  return "info";
}

function normalizeShortSegment(payload: OpenWeatherOneCallResponse, units: WeatherUnits, fallbackNow: Date): ShortSegmentPayload {
  const currentBlock = payload.current;
  const currentWeather = firstWeatherItem(currentBlock);
  const fetchedAt = toIso(currentBlock?.dt, fallbackNow);

  const current: WeatherApiResponse["current"] = {
    temp: asWholeNumber(currentBlock?.temp),
    feelsLike: asWholeNumber(currentBlock?.feels_like),
    condition: currentWeather?.main || currentWeather?.description || "Unknown",
    icon: currentWeather?.icon || "03d",
    windMph: windToMph(currentBlock?.wind_speed, units),
    humidity: asWholeNumber(currentBlock?.humidity),
    precipProb: typeof currentBlock?.pop === "number" ? probabilityToPercent(currentBlock.pop) : null
  };

  const hourly: WeatherHourly[] = (payload.hourly ?? []).slice(0, HOURLY_LIMIT).map((hour) => {
    const weather = firstWeatherItem(hour);
    const precipitationMm = typeof hour.rain?.["1h"] === "number" ? hour.rain["1h"] : typeof hour.snow?.["1h"] === "number" ? hour.snow["1h"] : null;
    return {
      time: toIso(hour.dt, fallbackNow),
      temp: asWholeNumber(hour.temp),
      pop: probabilityToPercent(hour.pop),
      precipMm: precipitationMm,
      windMph: windToMph(hour.wind_speed, units),
      icon: weather?.icon || "03d"
    };
  });

  const alerts: WeatherAlert[] = (payload.alerts ?? []).map((alert, index) => {
    const startsAt = toIso(alert.start, fallbackNow);
    const endsAt = toIso(alert.end, fallbackNow);
    const title = alert.event?.trim() || "Weather alert";
    return {
      id: sanitizeAlertId(`${title}-${alert.start ?? startsAt}-${alert.end ?? endsAt}-${index}`),
      title,
      severity: inferSeverity(alert),
      startsAt,
      endsAt,
      description: alert.description?.trim() || "No additional details were provided by the weather provider.",
      geometry: null
    };
  });

  return {
    current,
    hourly,
    alerts,
    fetchedAt
  };
}

function normalizeDailySegment(payload: OpenWeatherOneCallResponse, fallbackNow: Date): DailySegmentPayload {
  const daily = (payload.daily ?? []).slice(0, DAILY_LIMIT).map((entry) => {
    const weather = firstWeatherItem(entry);
    const tempBlock = typeof entry.temp === "object" ? entry.temp : undefined;
    return {
      date: toIso(entry.dt, fallbackNow),
      high: asWholeNumber(tempBlock?.max),
      low: asWholeNumber(tempBlock?.min),
      pop: probabilityToPercent(entry.pop),
      icon: weather?.icon || "03d",
      summary: weather?.description || weather?.main || "No summary"
    };
  });

  return {
    daily,
    fetchedAt: fallbackNow.toISOString()
  };
}

async function fetchOpenWeatherOneCall({
  lat,
  lng,
  units,
  apiKey,
  exclude
}: {
  lat: number;
  lng: number;
  units: WeatherUnits;
  apiKey: string;
  exclude: string;
}) {
  const endpoints = ["https://api.openweathermap.org/data/3.0/onecall", "https://api.openweathermap.org/data/2.5/onecall"];
  let lastError: WeatherProviderError | null = null;

  for (const endpoint of endpoints) {
    const url = new URL(endpoint);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("units", units);
    url.searchParams.set("appid", apiKey);
    url.searchParams.set("exclude", exclude);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        }
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (response.ok) {
        return data as OpenWeatherOneCallResponse;
      }

      const providerMessage =
        typeof data.message === "string" && data.message.trim() ? data.message : `Weather provider error (${response.status})`;

      lastError = new WeatherProviderError(providerMessage, response.status);

      // OpenWeather often returns plan/version errors for 3.0. Fall back to 2.5 before failing.
      continue;
    } catch {
      lastError = new WeatherProviderError("Weather provider unavailable");
    }
  }

  throw lastError ?? new WeatherProviderError("Weather provider unavailable");
}

function canUseSupabaseCache() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function readMemoryCacheRows(keys: string[]): CacheRow[] {
  const now = Date.now();
  return keys.flatMap((key) => {
    const entry = inMemoryWeatherCache.get(key);
    if (!entry) return [];
    if (entry.expiresAt <= now) {
      inMemoryWeatherCache.delete(key);
      return [];
    }

    return [
      {
        key,
        payload: entry.payload,
        expires_at: new Date(entry.expiresAt).toISOString()
      }
    ];
  });
}

async function readWeatherCache(keys: string[]) {
  const memoryRows = readMemoryCacheRows(keys);
  if (!canUseSupabaseCache()) return memoryRows;

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("weather_cache").select("key, payload, expires_at").in("key", keys);
    if (error) {
      console.warn("[weather-cache] read error:", error.message);
      return memoryRows;
    }
    const dbRows = (data ?? []) as CacheRow[];
    const merged = new Map<string, CacheRow>();
    for (const row of memoryRows) merged.set(row.key, row);
    for (const row of dbRows) merged.set(row.key, row);
    return [...merged.values()];
  } catch (error) {
    console.warn("[weather-cache] read exception:", error);
    return memoryRows;
  }
}

async function writeWeatherCache({ key, payload, ttlMs }: { key: string; payload: unknown; ttlMs: number }) {
  const expiresAtMs = Date.now() + ttlMs;
  inMemoryWeatherCache.set(key, {
    payload,
    expiresAt: expiresAtMs
  });

  if (!canUseSupabaseCache()) return;

  try {
    const admin = createSupabaseAdminClient();
    const expiresAt = new Date(expiresAtMs).toISOString();
    const { error } = await admin.from("weather_cache").upsert({
      key,
      provider: PROVIDER,
      payload,
      expires_at: expiresAt
    });
    if (error) {
      console.warn("[weather-cache] write error:", error.message);
    }
  } catch (error) {
    console.warn("[weather-cache] write exception:", error);
  }
}

function getCacheRowByKey(rows: CacheRow[], key: string) {
  return rows.find((row) => row.key === key) ?? null;
}

function cacheRowIsFresh(row: CacheRow | null) {
  if (!row) return false;
  const expiresAt = new Date(row.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

async function withInFlightDedupe<T>(key: string, task: () => Promise<T>) {
  const existing = inFlightByCacheKey.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const pending = task().finally(() => {
    inFlightByCacheKey.delete(key);
  });
  inFlightByCacheKey.set(key, pending);
  return pending;
}

async function loadShortSegment({
  shortKey,
  cachedRow,
  lat,
  lng,
  units,
  apiKey
}: {
  shortKey: string;
  cachedRow: CacheRow | null;
  lat: number;
  lng: number;
  units: WeatherUnits;
  apiKey: string;
}) {
  if (cachedRow && cacheRowIsFresh(cachedRow)) {
    return { payload: cachedRow.payload as ShortSegmentPayload, fromCache: true };
  }

  const stalePayload = cachedRow?.payload as ShortSegmentPayload | undefined;

  try {
    const payload = await withInFlightDedupe(shortKey, async () => {
      const providerPayload = await fetchOpenWeatherOneCall({
        lat,
        lng,
        units,
        apiKey,
        exclude: "minutely,daily"
      });
      const normalized = normalizeShortSegment(providerPayload, units, new Date());
      await writeWeatherCache({ key: shortKey, payload: normalized, ttlMs: SHORT_TTL_MS });
      return normalized;
    });

    return { payload, fromCache: false };
  } catch (error) {
    if (stalePayload) {
      return { payload: stalePayload, fromCache: true };
    }
    throw error;
  }
}

async function loadDailySegment({
  dailyKey,
  cachedRow,
  lat,
  lng,
  units,
  apiKey
}: {
  dailyKey: string;
  cachedRow: CacheRow | null;
  lat: number;
  lng: number;
  units: WeatherUnits;
  apiKey: string;
}) {
  if (cachedRow && cacheRowIsFresh(cachedRow)) {
    return { payload: cachedRow.payload as DailySegmentPayload, fromCache: true };
  }

  const stalePayload = cachedRow?.payload as DailySegmentPayload | undefined;

  try {
    const payload = await withInFlightDedupe(dailyKey, async () => {
      const providerPayload = await fetchOpenWeatherOneCall({
        lat,
        lng,
        units,
        apiKey,
        exclude: "current,minutely,hourly,alerts"
      });
      const normalized = normalizeDailySegment(providerPayload, new Date());
      await writeWeatherCache({ key: dailyKey, payload: normalized, ttlMs: DAILY_TTL_MS });
      return normalized;
    });

    return { payload, fromCache: false };
  } catch (error) {
    if (stalePayload) {
      return { payload: stalePayload, fromCache: true };
    }
    throw error;
  }
}

export async function getWeatherSnapshot({
  lat,
  lng,
  units,
  apiKey
}: {
  lat: number;
  lng: number;
  units: WeatherUnits;
  apiKey: string;
}) {
  const keyBase = cacheKeyBase(lat, lng, units);
  const shortKey = `${keyBase}|segment:${CACHE_SOURCE_SHORT}`;
  const dailyKey = `${keyBase}|segment:${CACHE_SOURCE_DAILY}`;

  const cacheRows = await readWeatherCache([shortKey, dailyKey]);
  const shortCachedRow = getCacheRowByKey(cacheRows, shortKey);
  const dailyCachedRow = getCacheRowByKey(cacheRows, dailyKey);

  const [{ payload: shortPayload, fromCache: shortFromCache }, { payload: dailyPayload, fromCache: dailyFromCache }] = await Promise.all([
    loadShortSegment({
      shortKey,
      cachedRow: shortCachedRow,
      lat,
      lng,
      units,
      apiKey
    }),
    loadDailySegment({
      dailyKey,
      cachedRow: dailyCachedRow,
      lat,
      lng,
      units,
      apiKey
    })
  ]);

  const fetchedAt = [shortPayload.fetchedAt, dailyPayload.fetchedAt]
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];

  return {
    location: {
      lat: roundCoordinate(lat),
      lng: roundCoordinate(lng),
      units
    },
    current: shortPayload.current,
    hourly: shortPayload.hourly,
    daily: dailyPayload.daily,
    alerts: shortPayload.alerts,
    fetchedAt: Number.isFinite(fetchedAt) ? new Date(fetchedAt).toISOString() : new Date().toISOString(),
    cached: shortFromCache && dailyFromCache
  } satisfies WeatherApiResponse;
}
