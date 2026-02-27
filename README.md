# Neighborhood Incident Map (Citizen-lite)

A separate Next.js + Supabase app for local incident reporting, map/feed browsing, and community verification.

## Stack

- Next.js App Router + React 19 + TypeScript
- Tailwind CSS v4 + shadcn-style UI + lucide-react
- Mapbox GL JS (client-only dynamic import)
- TanStack Query (server state), Zustand (UI state), Zod (validation)
- Supabase Auth, Postgres + PostGIS, Storage, Realtime, RLS
- Supabase Edge Functions scaffold (notifications + rate-limit guard)

## MVP Defaults (Documented Choices)

- Query strategy: reports are loaded by **selected radius around current map center** (not full-city fetch).
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

Optional server-only placeholders:

- `SUPABASE_SERVICE_ROLE_KEY` (not required in MVP runtime)
- `RESEND_API_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `APP_BASE_URL`

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
