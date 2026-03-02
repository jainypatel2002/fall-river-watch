export const EVENT_CATEGORIES = ["meeting", "protest", "community", "roadwork", "safety", "other"] as const;
export const EVENT_STATUSES = ["scheduled", "canceled", "moved", "ended"] as const;
export const EVENT_RSVP_STATUSES = ["going", "interested"] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type EventRsvpStatus = (typeof EVENT_RSVP_STATUSES)[number];

export type EventRecord = {
  id: string;
  creator_user_id: string;
  title: string;
  description: string;
  category: EventCategory;
  start_at: string;
  end_at: string | null;
  location_name: string;
  address: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  place_id: string | null;
  formatted_address: string | null;
  lat: number;
  lng: number;
  status: EventStatus;
  created_at: string;
  updated_at: string;
};

export type EventWithMeta = EventRecord & {
  going_count: number;
  interested_count: number;
  user_rsvp: EventRsvpStatus | null;
  can_manage: boolean;
};
