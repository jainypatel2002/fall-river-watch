export const NEWS_CATEGORIES = [
  "general",
  "city",
  "traffic",
  "crime",
  "weather",
  "schools",
  "community",
  "business",
  "sports"
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  general: "General",
  city: "City",
  traffic: "Traffic",
  crime: "Crime",
  weather: "Weather",
  schools: "Schools",
  community: "Community",
  business: "Business",
  sports: "Sports"
};

export type NewsItemRecord = {
  id: string;
  source_id: string;
  source_name: string;
  is_official: boolean;
  title: string;
  canonical_url: string;
  original_url: string;
  published_at: string | null;
  summary: string | null;
  image_url: string | null;
  category: NewsCategory;
  city: string | null;
  state: string | null;
  created_at: string;
};
