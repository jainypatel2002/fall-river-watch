# Supabase Edge Function Stubs

This project scaffolds the following Phase 2 functions:

- `send_email_notification`
- `send_web_push_notification`
- `rate_limit_guard`

## Deploy

```bash
supabase functions deploy send_email_notification
supabase functions deploy send_web_push_notification
supabase functions deploy rate_limit_guard
```

## Env vars

Set these in Supabase Edge Function Secrets (do not expose to client):

- `RESEND_API_KEY` (future email integration)
- `VAPID_PUBLIC_KEY` (future web push)
- `VAPID_PRIVATE_KEY` (future web push)
- `APP_BASE_URL` (link generation)

## MVP behavior

These functions are scaffolds only. Notification providers are intentionally not fully integrated in MVP.
