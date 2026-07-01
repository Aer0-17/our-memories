import manifest from "@/public/sprites/generated-assets.json";
import type { PartnerGender } from "@/data/appSettings";
import type { WeatherKind } from "@/lib/weather";

export type GeneratedSpriteAsset = {
  src: string;
  fallbackSrc?: string;
  width: number;
  height: number;
  frames?: number;
};

export type GeneratedWeatherGroup = "sunny" | "cloudy" | "rain" | "snow" | "wind";

const weatherGroupByKind: Record<WeatherKind, GeneratedWeatherGroup> = {
  sunny: "sunny",
  "night-clear": "sunny",
  partly: "cloudy",
  "night-partly": "cloudy",
  cloudy: "cloudy",
  fog: "cloudy",
  rain: "rain",
  "light-rain": "rain",
  "moderate-rain": "rain",
  "heavy-rain": "rain",
  thunder: "rain",
  sleet: "snow",
  snow: "snow",
  "moderate-snow": "snow",
  "heavy-snow": "snow",
  wind: "wind",
};

const generatedAssets = manifest as {
  frameCount: number;
  characters: Record<PartnerGender, Record<GeneratedWeatherGroup, GeneratedSpriteAsset>>;
  couple: Record<GeneratedWeatherGroup, GeneratedSpriteAsset>;
  weather: Record<GeneratedWeatherGroup, GeneratedSpriteAsset>;
  flowers: GeneratedSpriteAsset[];
};

function preferLocalAsset(asset: GeneratedSpriteAsset): GeneratedSpriteAsset {
  if (!asset.fallbackSrc) return asset;
  return {
    ...asset,
    src: asset.fallbackSrc,
    fallbackSrc: asset.src,
  };
}

export function weatherAssetGroup(kind: WeatherKind): GeneratedWeatherGroup {
  return weatherGroupByKind[kind] ?? "cloudy";
}

export function characterSprite(gender: PartnerGender, kind: WeatherKind) {
  const group = weatherAssetGroup(kind);
  return preferLocalAsset(generatedAssets.characters[gender]?.[group] ?? generatedAssets.characters.neutral[group]);
}

export function coupleSprite(kind: WeatherKind) {
  return preferLocalAsset(generatedAssets.couple[weatherAssetGroup(kind)]);
}

export function weatherSprite(kind: WeatherKind) {
  return preferLocalAsset(generatedAssets.weather[weatherAssetGroup(kind)]);
}

export function flowerSprite(variant: number) {
  return preferLocalAsset(generatedAssets.flowers[variant % generatedAssets.flowers.length]);
}
