import type { City } from "../data/geo";
import { getWeather, type WeatherApiItem } from "./api";

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

export interface WeatherInfo {
  cityId: string;
  temp: number;
  kind: WeatherKind;
  label: string;
}

export const fallbackWeather = (cityId: string): WeatherInfo => ({
  cityId,
  temp: weatherFallbackTemp,
  kind: "partly",
  label: "多云",
});

const weatherKinds = new Set<WeatherKind>([
  "sunny", "partly", "cloudy", "rain", "light-rain", "moderate-rain",
  "heavy-rain", "thunder", "snow", "moderate-snow", "heavy-snow",
  "sleet", "fog", "wind", "night-clear", "night-partly",
]);

function normalizeWeather(item: WeatherApiItem | undefined, cityId: string): WeatherInfo {
  if (!item || !Number.isFinite(item.temp) || !weatherKinds.has(item.kind as WeatherKind)) {
    return fallbackWeather(cityId);
  }
  return {
    cityId,
    temp: Math.round(item.temp),
    kind: item.kind as WeatherKind,
    label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : "多云",
  };
}

export async function fetchCitiesWeather(cityList: City[]): Promise<Record<string, WeatherInfo>> {
  const unique = new Map<string, City>();
  cityList.forEach((city) => {
    if (city && !unique.has(city.id)) unique.set(city.id, city);
  });
  const cities = [...unique.values()];
  if (cities.length === 0) return {};
  try {
    const response = await getWeather(
      cities.slice(0, 8).map((city) => ({
        cityId: city.id,
        lat: city.lat,
        lng: city.lng,
        fallbackTemp: weatherFallbackTemp,
      })),
    );
    return Object.fromEntries(
      cities.map((city) => [city.id, normalizeWeather(response.weather?.[city.id], city.id)]),
    );
  } catch {
    return Object.fromEntries(cities.map((city) => [city.id, fallbackWeather(city.id)]));
  }
}
