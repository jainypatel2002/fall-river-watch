"use client";

import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWeatherTarget } from "@/hooks/use-weather-target";
import { useWeatherQuery } from "@/lib/queries/weather";
import { useUiStore } from "@/lib/store/ui-store";
import { shortConditionLabel, weatherIconToEmoji } from "@/lib/weather/format";
import { cn } from "@/lib/utils";

export function WeatherPill({ compact = false, className }: { compact?: boolean; className?: string }) {
  const openWeatherPanel = useUiStore((state) => state.openWeatherPanel);
  const weatherTarget = useWeatherTarget();
  const weatherQuery = useWeatherQuery({
    target: weatherTarget.coordinates,
    source: weatherTarget.source
  });

  const weather = weatherQuery.data;
  const hasAlerts = (weather?.alerts.length ?? 0) > 0;
  const isLoading = weatherQuery.isFetching && !weather;

  let label = "Weather";
  if (isLoading) {
    label = "Weather ...";
  } else if (weather) {
    const emoji = weatherIconToEmoji(weather.current.icon);
    const condition = shortConditionLabel(weather.current.condition);
    const temp = `${Math.round(weather.current.temp)}°`;
    label = compact ? `${emoji} ${temp}` : `${emoji} ${temp} | ${condition} | Wind ${Math.round(weather.current.windMph)}`;
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("min-h-9 gap-1.5 px-2.5 sm:px-3", compact ? "max-w-[8.5rem]" : "max-w-[19rem]", className)}
      onClick={() => openWeatherPanel("overview")}
      aria-label="Open weather details"
    >
      {isLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
      <span className="truncate text-xs">{label}</span>
      {hasAlerts ? <span className="h-2 w-2 shrink-0 rounded-full bg-rose-400" aria-hidden /> : null}
    </Button>
  );
}
