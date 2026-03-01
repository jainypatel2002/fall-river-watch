export type WeatherUnits = "imperial" | "metric";
export type WeatherSource = "mapCenter" | "userLocation";

export type WeatherCurrent = {
  temp: number;
  feelsLike: number;
  condition: string;
  icon: string;
  windMph: number;
  humidity: number;
  precipProb: number | null;
};

export type WeatherHourly = {
  time: string;
  temp: number;
  pop: number;
  precipMm: number | null;
  windMph: number;
  icon: string;
};

export type WeatherDaily = {
  date: string;
  high: number;
  low: number;
  pop: number;
  icon: string;
  summary: string;
};

export type WeatherAlert = {
  id: string;
  title: string;
  severity: string;
  startsAt: string;
  endsAt: string;
  description: string;
  geometry: GeoJSON.Geometry | null;
};

export type WeatherApiResponse = {
  location: {
    lat: number;
    lng: number;
    units: WeatherUnits;
  };
  current: WeatherCurrent;
  hourly: WeatherHourly[];
  daily: WeatherDaily[];
  alerts: WeatherAlert[];
  fetchedAt: string;
  cached: boolean;
};
