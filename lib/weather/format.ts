const weatherEmojiByPrefix: Record<string, string> = {
  "01": "☀️",
  "02": "🌤",
  "03": "☁️",
  "04": "☁️",
  "09": "🌧",
  "10": "🌦",
  "11": "⛈",
  "13": "❄️",
  "50": "🌫"
};

export function weatherIconToEmoji(icon: string | null | undefined) {
  if (!icon) return "🌤";
  const prefix = icon.slice(0, 2);
  return weatherEmojiByPrefix[prefix] ?? "🌤";
}

export function shortConditionLabel(value: string) {
  if (!value) return "Weather";
  return value
    .split(" ")
    .slice(0, 2)
    .join(" ");
}

export function weatherSeverityTone(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("extreme") || lower.includes("warning")) return "rose";
  if (lower.includes("watch") || lower.includes("moderate")) return "amber";
  return "cyan";
}

export function formatWeatherClock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatWeatherDay(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: "short" });
}

export function formatAlertEndTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}
