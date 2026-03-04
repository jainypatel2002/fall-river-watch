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
- `NEWS_INGEST_SECRET` (required for `/api/news/ingest`)

## Vercel Cron (Hobby)

- `vercel.json` is configured for one daily ingest run: `0 8 * * *`.
- Cron path uses a placeholder secret: `/api/news/ingest?secret=REPLACE_WITH_NEWS_INGEST_SECRET`.
- Replace `REPLACE_WITH_NEWS_INGEST_SECRET` with the same value you set for `NEWS_INGEST_SECRET` before deploying, since `vercel.json` cannot read env vars.

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
4. For the gigs feature, ensure private gig media bucket exists:
   - Bucket name: `gig-media`
   - Keep it private; media is served through signed URLs (`/api/gigs/media-url`) for authenticated participants only.
5. Set env vars in `.env.local`.
6. Install dependencies and run app:

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

## Events + Groups

### Events

- New routes:
  - `/events` list + map
  - `/events/new` create
  - `/events/:id` detail
  - `/events/:id/edit` edit
- Event map markers render as compact cards (title + time), expand on first tap/click, and navigate on second tap/click.
- RSVP states are supported (`going`, `interested`) with counts.
- Event ownership:
  - Creator can edit/delete
  - `mod`/`admin` can edit/delete any event

### Gigs

- New routes:
  - `/gigs` browse + filters
  - `/gigs/new` create
  - `/gigs/:id` detail + applications + status updates + reviews + flags
  - `/gigs/:id/edit` edit + media management
  - `/gigs/my` browse/my posts/my applications tabs
  - `/gigs/chat/:threadId` private realtime chat after acceptance
- Data/security:
  - Migration file: `supabase/migrations/202603040001_gigs.sql`
  - New tables: `gigs`, `gig_media`, `gig_applications`, `gig_chat_threads`, `gig_chat_messages`, `gig_reviews`, `gig_flags`
  - RLS enabled for all new tables with creator/participant/staff scoped access
  - Private storage bucket `gig-media` with path policy `gigs/{gig_id}/{uuid}.{ext}`
  - Signed URL route (`/api/gigs/media-url`) validates auth + participant access before issuing links
  - Core RPCs:
    - `apply_to_gig`
    - `respond_to_application`
    - `update_gig_status`
    - `create_signed_gig_media_url`

### Groups

- New routes:
  - `/groups` discover + follow
  - `/groups/new` create
  - `/groups/:slug` group home (Posts / Events / Chat tabs)
  - `/groups/:slug/settings` owner/mod controls
  - `/groups/:slug/requests` pending private follow requests
  - `/groups/:slug/chat` direct chat tab route
- Group creation is enforced by RPC:
  - Standard users can own at most one group.
  - `mod`/`admin` users can create unlimited groups.
- Follow rules:
  - Public groups: follow accepted immediately.
  - Private groups: follow request stays `pending` until accepted/rejected.
- Group content guard:
  - Posts/events/chat require accepted membership (or mod/admin override).
  - Locked view is shown for non-members.

### Chat Realtime

- Group chat uses `group_chat_messages` and Supabase Realtime subscriptions by `group_id`.
- If no messages exist, the UI shows a friendly empty state.

### Database / Security

- Migration file:
  - `supabase/migrations/202603020001_events_groups.sql`
- Includes:
  - New tables: `groups`, `group_members`, `group_chat_messages`, `events`, `event_rsvps`
  - Backward-compatible nullable `reports.group_id`
  - New helper functions + RPCs:
    - `is_mod`
    - `create_group_atomic`
    - `request_to_join_group`
    - `respond_to_join_request`
    - `toggle_group_visibility`
    - `delete_group_atomic`
  - RLS policies for all new tables
  - Security updates so existing incident/report RPCs respect group-linked access rules

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
