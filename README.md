# Neighborhood Incident Map (Citizen-lite)

A separate Next.js + Supabase app for local incident reporting, map/feed browsing, and community verification.

## Stack

- Next.js App Router + React 19 + TypeScript
- Tailwind CSS v4 + shadcn-style UI + lucide-react
- Mapbox GL JS (client-only dynamic import)
- Server-backed Mapbox forward geocoding (`/api/geocode`) for autocomplete
- TanStack Query (server state), Zustand (UI state), Zod (validation)
- Supabase Auth, Postgres + PostGIS, Storage, Realtime, RLS
- Supabase Edge Functions scaffold (notifications + rate-limit guard)

## MVP Defaults (Documented Choices)

- Query strategy: reports are loaded by **map viewport bounds + selected radius around current center** (not full-city fetch).
- Realtime strategy: on `reports` / `report_votes` changes, clients **refetch current query filters**.
- Expiration: reports auto-expire after 24h unless verified via a DB helper function called during API reads/writes.
- Privacy: `suspicious_activity` uses deterministic ~300m snapped location for map and distance display.

## Environment Variables

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Required:

- `NEXT_PUBLIC_MAPBOX_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `WEATHER_API_KEY` (server-only; required for `/api/weather`)

Optional:

- `NEXT_PUBLIC_APP_BASE_URL` (for absolute links in client-facing contexts)

Optional server-only placeholders:

- `SUPABASE_SERVICE_ROLE_KEY` (not required in MVP runtime)
- `RESEND_API_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `APP_BASE_URL`

Weather cache note:

- `SUPABASE_SERVICE_ROLE_KEY` is required if you want persistent weather response caching in `weather_cache`.
- Never expose this key in client bundles (`NEXT_PUBLIC_*`).

## Map + Geocoding Notes

- The main incident map remains client-only via dynamic import and `ssr: false`.
- Report pins use a Mapbox GeoJSON source + layers with clustering (no heavy React marker lists).
- The map instance is initialized once and updated imperatively to reduce jitter/re-init flicker.
- Address autocomplete calls `GET /api/geocode?q=...&proximity=lng,lat`.
- `/api/geocode` validates input with Zod (`q` min 2/max 100, safe proximity parsing), calls Mapbox forward geocoding server-side, and returns normalized suggestions:
  - `id`
  - `place_name`
  - `center: { lng, lat }`
  - `bbox` (optional)
  - `context` (optional)
- The client never hardcodes tokens; it only calls the local API route.

## Manual Test Checklist

1. Start the app with `NEXT_PUBLIC_MAPBOX_TOKEN` set and open `/`.
2. Verify the Map tab renders without hydration warnings and the map does not flicker while idle.
3. Pan/zoom the map repeatedly on desktop and mobile viewport; confirm interaction stays smooth.
4. Switch between Map and Feed tabs several times; confirm map state persists and map is not re-created.
5. In Map tab, type at least 2 characters in the search box; confirm suggestions appear within ~300-600ms.
6. Use keyboard controls in search:
   - `ArrowDown`/`ArrowUp` to move selection
   - `Enter` to select
   - `Esc` to close
7. Select a suggestion; confirm map smoothly flies to the location and drops a temporary pin.
8. Confirm reports/feed refresh around the new center (respecting existing filters: category/radius/time/verified).
9. Validate existing flows still work:
   - Create report
   - Open report detail from map/feed
   - Filters sheet changes
   - Auth/admin/notifications pages load

## Weather Feature QA

- Full checklist (including edge cases + mobile behavior): `docs/weather-qa-checklist.md`.

## Local Setup

1. Create a Supabase project.
2. Run SQL migration:
   - File: `supabase/migrations/202602270001_init.sql`
   - Includes `postgis` extension, schema, indexes, triggers, RLS, and storage policies.
3. Ensure Storage bucket exists:
   - Bucket name: `report-media`
   - Migration attempts to create it automatically.
4. Set env vars in `.env.local`.
5. Install dependencies and run app:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Auth + Profiles

- Auth is email/password only.
- On first signup, DB trigger creates a `profiles` row automatically.

## Rate Limits (MVP)

Server-side guards in route handlers enforce:

- max `5` reports/day/user
- max `60` votes/day/user

Edge function `rate_limit_guard` exists as scaffold only.

## Admin Access (Local Dev)

1. Find your user UUID in Supabase `auth.users`.
2. Run:

```sql
-- sql/dev_make_admin.sql
update public.profiles
set role = 'admin'
where id = '<YOUR-USER-UUID>';
```

3. Visit `/admin`.

## Routes

- `/` Home map + feed tabs with filters and report FAB
- `/auth` Login/signup
- `/report/new` Create report with map picker + image upload
- `/report/[id]` Detail page with votes + resolve action
- `/admin` Admin dashboard (role=admin)
- `/settings/notifications` Notification preferences placeholder

## Security Notes

- No secrets are hardcoded.
- Client uses public env vars only.
- Writes are protected by Supabase RLS + server-side validation.
- `suspicious_activity` blocks obvious personal info patterns client + server side.
- `report_votes` is configured for public read in MVP for aggregate transparency.

## Notification Scaffolding (Phase 2)

Edge function stubs:

- `supabase/functions/send_email_notification/index.ts`
- `supabase/functions/send_web_push_notification/index.ts`
- `supabase/functions/rate_limit_guard/index.ts`

Provider integration (Resend/VAPID) intentionally deferred.
# fall-river-watch
