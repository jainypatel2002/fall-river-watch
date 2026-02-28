-- Migration to enhance notification_subscriptions and add push/delivery tables
SET search_path = public, extensions;

-- 1. Add location + timezone fields to existing notification_subscriptions
ALTER TABLE public.notification_subscriptions 
ADD COLUMN IF NOT EXISTS center_lat DOUBLE PRECISION NULL,
ADD COLUMN IF NOT EXISTS center_lng DOUBLE PRECISION NULL,
ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York';

-- 2. push_subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast push targeting
CREATE INDEX IF NOT EXISTS idx_push_subs_user_active ON public.push_subscriptions(user_id, is_active);

-- RLS for push_subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push subscriptions"
ON public.push_subscriptions FOR SELECT
TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own push subscriptions"
ON public.push_subscriptions FOR INSERT
TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own push subscriptions"
ON public.push_subscriptions FOR UPDATE
TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 3. notification_deliveries table (deduplication sink)
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    incident_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'push')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Strict unique constraint for idempotency
    UNIQUE(user_id, incident_id, channel)
);

-- RLS for deliveries (mostly server-driven, but secure for users if needed)
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server and users can safely view own deliveries"
ON public.notification_deliveries FOR SELECT
TO authenticated USING (user_id = auth.uid());
-- Only service role (server) can insert into deliveries, usually bypassing RLS anyway, 
-- but explicitly leaving out authenticated insert to prevent client abuse.

-- Refresh schema cache signal
-- NOTIFY pgrst, 'reload schema';
