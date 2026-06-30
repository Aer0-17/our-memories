import type { City } from "@/data/cities";

export const weatherFallbackTemp = 24;

export type WeatherKind =
  | "sunny"
  | "partly"
  | "cloudy"
  | "rain"
  | "light-rain"
  | "moderate-rain"
  | "heavy-rain"
  | "thunder"
  | "snow"
  | "moderate-snow"
  | "heavy-snow"
  | "sleet"
  | "fog"
  | "wind"
  | "night-clear"
  | "night-partly";

export type WeatherInfo = {
  cityId: string;
  temp: number;
  kind: WeatherKind;
  label: string;
};

type OpenMeteoCurrent = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    is_day?: number;
  };
};

export function getWeatherKind(code: number, windSpeed: number, isDay: boolean): { kind: WeatherKind; label: string } {
  if (windSpeed >= 38) return { kind: "wind", label: "大风" };
  if (code === 0) return isDay ? { kind: "sunny", label: "晴" } : { kind: "night-clear", label: "夜晴" };
  if (code === 1 || code === 2) {
    return isDay ? { kind: "partly", label: "多云" } : { kind: "night-partly", label: "夜多云" };
  }
  if (code === 3) return { kind: "cloudy", label: "阴" };
  if (code === 45 || code === 48) return { kind: "fog", label: "大雾" };
  if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) return { kind: "light-rain", label: "小雨" };
  if (code === 61 || code === 80) return { kind: "light-rain", label: "小雨" };
  if (code === 63 || code === 81) return { kind: "moderate-rain", label: "中雨" };
  if (code === 65 || code === 82) return { kind: "heavy-rain", label: "大雨" };
  if (code === 66 || code === 67) return { kind: "sleet", label: "雨夹雪" };
  if (code === 71 || code === 77 || code === 85) return { kind: "snow", label: "小雪" };
  if (code === 73) return { kind: "moderate-snow", label: "中雪" };
  if (code === 75 || code === 86) return { kind: "heavy-snow", label: "大雪" };
  if (code === 95 || code === 96 || code === 99) return { kind: "thunder", label: "雷雨" };

  return { kind: "rain", label: "阵雨" };
}

export function buildWeatherUrl(lat: number, lng: number) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "temperature_2m,weather_code,wind_speed_10m,is_day",
    timezone: "Asia/Shanghai",
  });

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

export async function fetchCityWeather(city: City, fallbackTemp = weatherFallbackTemp): Promise<WeatherInfo> {
  const response = await fetch(buildWeatherUrl(city.lat, city.lng)).catch(() => null);
  const data = response?.ok ? ((await response.json().catch(() => null)) as OpenMeteoCurrent | null) : null;
  const current = data?.current;
  const temp = Math.round(current?.temperature_2m ?? fallbackTemp);
  const weatherCode = current?.weather_code ?? 0;
  const windSpeed = current?.wind_speed_10m ?? 0;
  const mapped = getWeatherKind(weatherCode, windSpeed, (current?.is_day ?? 1) === 1);

  return {
    cityId: city.id,
    temp,
    ...mapped,
  };
}
