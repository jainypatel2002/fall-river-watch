export function milesToMeters(miles: number) {
  return miles * 1609.344;
}

export function metersToMiles(meters: number) {
  return meters / 1609.344;
}

export function parseTimeWindowToHours(timeWindow: "1h" | "6h" | "24h" | "7d") {
  switch (timeWindow) {
    case "1h":
      return 1;
    case "6h":
      return 6;
    case "24h":
      return 24;
    case "7d":
      return 24 * 7;
    default:
      return 24;
  }
}
