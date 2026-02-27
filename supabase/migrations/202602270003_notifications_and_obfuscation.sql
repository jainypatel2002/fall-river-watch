-- Migration to add notification_subscriptions and fix obfuscated_location in reports
SET search_path = public, extensions;

-- 1. notification_subscriptions table
CREATE TABLE IF NOT EXISTS public.notification_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT true,
    channels TEXT[] DEFAULT ARRAY['email']::TEXT[],
    radius_miles DOUBLE PRECISION DEFAULT 3,
    categories TEXT[] DEFAULT NULL,
    quiet_start TIME DEFAULT '22:00',
    quiet_end TIME DEFAULT '07:00',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);

-- 1.2 updated_at trigger for notification_subscriptions
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_notification_subscriptions_updated_at ON public.notification_subscriptions;
CREATE TRIGGER set_notification_subscriptions_updated_at
BEFORE UPDATE ON public.notification_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 1.3 RLS for notification_subscriptions
ALTER TABLE public.notification_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own notification subscriptions"
ON public.notification_subscriptions
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 1.4 Fix obfuscated_location not-null inserts
-- Trigger to ensure obfuscated_location is always set on reports

CREATE OR REPLACE FUNCTION public.ensure_obfuscated_location()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if location is provided
    IF NEW.location IS NULL THEN
        RAISE EXCEPTION 'Location is required for a report';
    END IF;

    -- Set obfuscated_location based on category
    IF NEW.category = 'suspicious_activity' THEN
        -- Snap to a ~300m grid using PostGIS functions.
        -- ST_SnapToGrid takes geometry, so we cast to geometry, snap, and set the SRID back to 4326.
        -- Grid size of 0.003 degrees is roughly 300m at the equator.
        NEW.obfuscated_location = ST_SetSRID(ST_SnapToGrid(NEW.location::geometry, 0.003), 4326)::geography;
    ELSE
        -- For other categories, obfuscated_location is exact location
        NEW.obfuscated_location = NEW.location;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ensure_obfuscated_location ON public.reports;
CREATE TRIGGER trigger_ensure_obfuscated_location
BEFORE INSERT OR UPDATE ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.ensure_obfuscated_location();

-- 1.5 Refresh schema cache (Commented out for migration running, can be run manually)
-- NOTIFY pgrst, 'reload schema';
