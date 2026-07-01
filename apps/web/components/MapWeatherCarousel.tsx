"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import { cities } from "@/data/cities";
import {
  appSettingsUpdatedEvent,
  defaultSelfCityId,
  normalizeMemberProfiles,
  readAppSettings,
} from "@/data/appSettings";
import { fetchCitiesWeather, weatherFallbackTemp, type WeatherInfo } from "@/lib/weather";
import { weatherSprite, type GeneratedSpriteAsset } from "@/lib/generatedAssets";

const cityById = new Map(cities.map((city) => [city.id, city]));
const defaultWeatherCityIds = [defaultSelfCityId, "city-451100"];

function readCarouselCityIds() {
  const profiles = normalizeMemberProfiles(readAppSettings().memberProfiles);
  const ids = Object.values(profiles)
    .map((profile) => profile.cityId)
    .filter((cityId): cityId is string => Boolean(cityId && cityById.has(cityId)));

  return Array.from(new Set(ids.length > 0 ? ids : defaultWeatherCityIds)).slice(0, 4);
}

function WeatherSpriteIcon({ asset }: Readonly<{ asset: GeneratedSpriteAsset }>) {
  const [failedSrc, setFailedSrc] = useState("");
  const src = failedSrc === asset.src && asset.fallbackSrc ? asset.fallbackSrc : asset.src;

  return (
    <span
      className="generated-sprite pixelated h-4 w-4 shrink-0 sm:h-5 sm:w-5"
      aria-hidden="true"
      style={{
        "--sprite-url": `url(${src})`,
        "--sprite-frames": asset.frames ?? 4,
      } as CSSProperties}
    >
      {asset.fallbackSrc && src === asset.src ? (
        <Image
          className="hidden"
          src={asset.src}
          alt=""
          width={1}
          height={1}
          unoptimized
          aria-hidden="true"
          onError={() => setFailedSrc(asset.src)}
        />
      ) : null}
    </span>
  );
}

export default function MapWeatherCarousel() {
  const [cityIds, setCityIds] = useState<string[]>(defaultWeatherCityIds);
  const [weatherByCityId, setWeatherByCityId] = useState<Record<string, WeatherInfo>>({});
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const sync = () => setCityIds(readCarouselCityIds());
    sync();
    window.addEventListener(appSettingsUpdatedEvent, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(appSettingsUpdatedEvent, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (cityIds.length === 0) return;
    let cancelled = false;

    async function loadWeather() {
      const points = cityIds
        .map((cityId) => cityById.get(cityId))
        .filter((city): city is NonNullable<typeof city> => Boolean(city));
      const weather = await fetchCitiesWeather(points.map((city) => ({ city })));
      if (!cancelled) setWeatherByCityId(weather);
    }

    void loadWeather();
    const refreshTimer = window.setInterval(loadWeather, 30 * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [cityIds]);

  useEffect(() => {
    if (cityIds.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % cityIds.length);
    }, 5_000);

    return () => window.clearInterval(timer);
  }, [cityIds.length]);

  const safeActiveIndex = cityIds.length > 0 ? activeIndex % cityIds.length : 0;
  const activeCityId = cityIds[safeActiveIndex] ?? cityIds[0] ?? defaultSelfCityId;
  const city = cityById.get(activeCityId) ?? cityById.get(defaultSelfCityId);
  const weather = weatherByCityId[activeCityId];
  const icon = weatherSprite(weather?.kind ?? "partly");
  const label = useMemo(() => {
    if (!city) return "天气读取中";
    return `${city.name} ${weather?.label ?? "多云"} ${weather?.temp ?? weatherFallbackTemp}°`;
  }, [city, weather?.label, weather?.temp]);

  return (
    <div className="flex min-h-7 items-center gap-2 text-sm font-semibold text-ink/68 sm:text-base">
      <WeatherSpriteIcon asset={icon} />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}
