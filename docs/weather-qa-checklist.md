# Weather Feature QA Checklist

## Functional Checks

- [ ] Header weather pill appears on desktop and mobile.
- [ ] Pill states render correctly:
  - [ ] Default: `Weather`
  - [ ] Loading: `Weather ...`
  - [ ] Loaded: `icon + temp + condition + wind`
- [ ] Clicking the pill opens the weather panel.
- [ ] Desktop panel opens as a right-side drawer.
- [ ] Mobile panel opens as a bottom sheet and can be closed by swipe-down on the handle.
- [ ] Weather panel sections render:
  - [ ] NOW
  - [ ] NEXT HOURS
  - [ ] TODAY / TOMORROW
  - [ ] ALERTS
- [ ] Map + Feed tabs still work normally after weather integration.

## Data Source and Fallback Checks

- [ ] Without location permission, weather loads using map center.
- [ ] With location permission granted, `Use my location` switches weather source and refreshes data.
- [ ] `Use map center` switches source back and refreshes weather context.
- [ ] Denied geolocation falls back cleanly to map center with no crash.
- [ ] Missing `WEATHER_API_KEY` returns server error and UI handles it (shows unavailable/retry state).
- [ ] Provider outage returns `502` and UI shows graceful fallback messaging.

## Caching and Performance Checks

- [ ] `/api/weather` returns `cached: true` for warm cache hits.
- [ ] Cache key rounds to 2 decimals (`lat/lng`) to improve hit rate.
- [ ] Short weather data TTL behaves as ~15 minutes.
- [ ] Daily forecast TTL behaves as ~60 minutes.
- [ ] Repeated same-coordinate requests dedupe in-flight server fetches.
- [ ] Weather does not refetch on every tiny map movement (debounce + rounded keys working).
- [ ] Map remains smooth while weather layers are enabled.

## Map Layer Checks

- [ ] `Weather Alerts` toggle in Category Layers turns alert layer on/off.
- [ ] Weather alert layers appear only at practical zoom (`minzoom` threshold) to reduce noise.
- [ ] Clicking weather alert polygon/pin opens a popup.
- [ ] Popup `View details` opens weather panel to alerts section.
- [ ] Turning weather alerts off removes layer visibility without map re-init.
- [ ] No memory leaks after toggling weather layer repeatedly.

## Mobile Responsiveness Checks

- [ ] Header actions remain accessible on small screens (menu + core actions).
- [ ] Weather pill remains accessible on mobile header.
- [ ] Category Layers mobile sheet still opens and works.
- [ ] Search bar remains visible/usable while weather UI is present.
- [ ] `+ Report` FAB repositions upward when weather sheet is open and remains tappable.

## Regression Checks

- [ ] Incident reporting flow works (`/report/new`).
- [ ] Report detail flow works (`/report/[id]`).
- [ ] Authentication flow works (`/auth`, sign in/out).
- [ ] Admin and notification pages still load and operate.
- [ ] Existing incident map clustering and category filters still work.

## Deployment Notes

- Add `WEATHER_API_KEY` in Vercel Project Settings -> Environment Variables for:
  - Production
  - Preview (if used)
- Redeploy after adding or changing environment variables.
- Keep `.env.local` local-only and never commit it.
  - This repository already ignores `.env.local` in `.gitignore`.
- `SUPABASE_SERVICE_ROLE_KEY` is required for persistent server-side weather caching.
  - It must only be used in server code (`app/api/*`, server utilities).
  - Never expose service role key via `NEXT_PUBLIC_*`.
