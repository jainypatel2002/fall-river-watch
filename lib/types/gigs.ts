export const GIG_CATEGORIES = [
  "moving",
  "yard_work",
  "cleaning",
  "handyman",
  "delivery",
  "pet_care",
  "tech_help",
  "other"
] as const;

export const GIG_PAY_TYPES = ["fixed", "hourly", "free"] as const;
export const GIG_SCHEDULE_TYPES = ["asap", "scheduled", "flexible"] as const;
export const GIG_STATUSES = ["open", "assigned", "in_progress", "completed", "canceled", "expired"] as const;
export const GIG_APPLICATION_STATUSES = ["pending", "accepted", "declined", "withdrawn"] as const;
export const GIG_FLAG_REASONS = ["spam", "scam", "unsafe", "harassment", "other"] as const;

export type GigCategory = (typeof GIG_CATEGORIES)[number];
export type GigPayType = (typeof GIG_PAY_TYPES)[number];
export type GigScheduleType = (typeof GIG_SCHEDULE_TYPES)[number];
export type GigStatus = (typeof GIG_STATUSES)[number];
export type GigApplicationStatus = (typeof GIG_APPLICATION_STATUSES)[number];
export type GigFlagReason = (typeof GIG_FLAG_REASONS)[number];

export type GigRecord = {
  id: string;
  creator_user_id: string;
  title: string;
  category: GigCategory;
  description: string;
  pay_type: GigPayType;
  pay_amount: number | null;
  currency: string;
  is_remote: boolean;
  location_name: string;
  street: string | null;
  city: string;
  state: string;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  schedule_type: GigScheduleType;
  start_at: string | null;
  duration_minutes: number | null;
  people_needed: number;
  tools_required: boolean;
  tools_list: string | null;
  status: GigStatus;
  assigned_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type GigMediaRecord = {
  id: string;
  gig_id: string;
  uploader_user_id: string;
  storage_path: string;
  public_url: string;
  mime_type: string;
  created_at: string;
};

export type GigApplicationRecord = {
  id: string;
  gig_id: string;
  applicant_user_id: string;
  message: string;
  offered_pay_amount: number | null;
  availability: string | null;
  has_tools: boolean;
  status: GigApplicationStatus;
  created_at: string;
};

export type GigChatThreadRecord = {
  id: string;
  gig_id: string;
  creator_user_id: string;
  worker_user_id: string;
  created_at: string;
};

export type GigChatMessageRecord = {
  id: string;
  thread_id: string;
  sender_user_id: string;
  message: string;
  created_at: string;
};

export type GigReviewRecord = {
  id: string;
  gig_id: string;
  reviewer_user_id: string;
  reviewee_user_id: string;
  rating: -1 | 1;
  comment: string | null;
  created_at: string;
};

export type GigWithRelations = {
  gig: GigRecord;
  media: GigMediaRecord[];
  applications: GigApplicationRecord[];
  myApplication: GigApplicationRecord | null;
  chatThread: GigChatThreadRecord | null;
  reviews: GigReviewRecord[];
};

export type GigApplicationWithGig = {
  application: GigApplicationRecord;
  gig: GigRecord | null;
};
