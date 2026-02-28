# Report Detail Manual Checklist

## Preconditions
- App is running locally with Supabase configured.
- At least one authenticated non-admin user account exists.

## Checklist
1. Normal user creates a report from `/report/new`.
2. After submit redirect to `/report/{id}` succeeds and detail card renders.
3. Refresh `/report/{id}` directly; the same detail still loads.
4. Confirm map pins and feed list still show the new report.
5. Try `/report/{random-uuid}` for a non-existent id; UI shows "Report not found".
6. Public app mode: as a different normal user, open `/report/{id}` and confirm detail loads.
7. Private app mode (if enabled by RLS): as a user without access, open `/report/{id}` and confirm API/UI show "Forbidden" (403), not "Report not found".

## API Spot Checks (optional)
- Existing report: `GET /api/reports/{id}` returns `200`.
- Missing report: `GET /api/reports/{random-uuid}` returns `404`.
- RLS-blocked report (private mode): `GET /api/reports/{id}` returns `403` with `{ "error": "Forbidden" }`.
