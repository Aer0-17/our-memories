"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Minus, Plus, RotateCcw } from "lucide-react";
import {
  chinaFeatures,
  dashLineFeature,
  makePath,
  makeProjection,
  makeProjectionForFeature,
  provinceIdOf,
} from "@/lib/geo";
import {
  getLitCityIds,
  getLitProvinceIds,
  type LocalMemoryStore,
} from "@/data/progress";
import { buildMemoryRoutePoints, curvedRoutePath } from "@/lib/memoryRoutes";
import { provinces } from "@/data/provinces";
import Image from "next/image";
import { cities } from "@/data/cities";
import { memoryTime, type Memory } from "@/data/memories";
import { summaryToMemoryStore, useMemorySummary } from "@/lib/memorySummaryStore";
import { Modal } from "@/components/ui/modal";
import {
  appSettingsUpdatedEvent,
  defaultSelfCityId,
  normalizeMemberProfiles,
  readAppSettings,
  type PartnerProfile,
} from "@/data/appSettings";
import { readSession } from "@/lib/authStore";
import { fetchCitiesWeather, weatherFallbackTemp, type WeatherInfo } from "@/lib/weather";
import { WeatherPixelIcon } from "@/components/WeatherPixelIcon";
import {
  characterSprite,
  coupleSprite,
  type GeneratedSpriteAsset,
} from "@/lib/generatedAssets";

interface ChinaMapProps {
  width?: number;
  height?: number;
  className?: string;
}

const colors = {
  cream: "var(--color-cream)",
  dim: "var(--color-dim)",
  ink: "var(--color-ink)",
  sakura: "var(--color-sakura)",
  bloom: "var(--color-bloom)",
  sky: "var(--color-sky)",
};

const provinceById = new Map(provinces.map((province) => [province.id, province]));
const cityById = new Map(cities.map((city) => [city.id, city]));
const easyTapProvinceIds = new Set(["hongkong", "macau"]);
const initialZoom = 1.3;
const maxZoom = 1.75;
const minZoom = 1;
const stableCoordinate = (value: number) => Number(value.toFixed(3));

function profileSprite(profile: PartnerProfile, weather: WeatherInfo): GeneratedSpriteAsset {
  if (profile.avatarSprite) {
    return {
      src: profile.avatarSprite,
      fallbackSrc: profile.avatarSpriteFallback,
      width: 1024,
      height: 1024,
      frames: profile.avatarSpriteFrames ?? 4,
    };
  }
  return characterSprite(profile.gender ?? "neutral", weather.kind);
}

function avatarSpriteClass(profile: PartnerProfile) {
  if (!profile.avatarSprite) return "map-avatar-sprite";
  return (profile.avatarSpriteFrames ?? 4) === 1
    ? "map-avatar-sprite map-custom-avatar-sprite"
    : "map-avatar-sprite map-custom-avatar-sheet";
}

function AnimatedSprite({
  asset,
  className,
  frameDelay = 0,
}: Readonly<{
  asset: GeneratedSpriteAsset;
  className: string;
  frameDelay?: number;
}>) {
  const [failedSrc, setFailedSrc] = useState("");
  const [naturalSize, setNaturalSize] = useState({ src: "", width: asset.width, height: asset.height });
  const src = failedSrc === asset.src && asset.fallbackSrc ? asset.fallbackSrc : asset.src;
  const frames = asset.frames ?? 4;
  const spriteSize = naturalSize.src === src ? naturalSize : { width: asset.width, height: asset.height };
  const frameWidth = Math.max(1, spriteSize.width / frames);
  const frameHeight = Math.max(1, spriteSize.height);

  useEffect(() => {
    let active = true;
    const image = new window.Image();
    image.onload = () => {
      if (!active) return;
      setNaturalSize({
        src,
        width: image.naturalWidth || asset.width,
        height: image.naturalHeight || asset.height,
      });
    };
    image.onerror = () => {
      if (active && asset.fallbackSrc && src === asset.src) {
        setFailedSrc(asset.src);
      }
    };
    image.src = src;
    return () => {
      active = false;
    };
  }, [asset.fallbackSrc, asset.height, asset.src, asset.width, src]);

  return (
    <span
      className={`generated-sprite pixelated ${className}`}
      aria-hidden="true"
      style={{
        "--sprite-url": `url(${src})`,
        "--sprite-frames": frames,
        "--sprite-frame-aspect": `${frameWidth} / ${frameHeight}`,
        animationDelay: `${frameDelay}s`,
      } as CSSProperties}
    />
  );
}

function CoupleMarker({
  profile,
  weather,
  x,
  y,
  index,
}: Readonly<{
  profile: PartnerProfile;
  weather: WeatherInfo;
  x: number;
  y: number;
  index: number;
}>) {
  const [showWeather, setShowWeather] = useState(true);

  return (
    <div
      className="absolute z-10 flex w-10 -translate-x-1/2 -translate-y-full flex-col items-center sm:w-12"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {showWeather && (
        <button
          className="pointer-events-auto"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setShowWeather(false);
          }}
          aria-label="隐藏天气图标"
        >
          <WeatherPixelIcon kind={weather.kind} className="map-weather-sprite" />
        </button>
      )}
      <AnimatedSprite
        asset={profileSprite(profile, weather)}
        className={avatarSpriteClass(profile)}
        frameDelay={index * -0.16}
      />
      {!showWeather && (
        <button
          className="pointer-events-auto mt-0.5 h-2.5 w-2.5 rounded-full bg-sky/55"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setShowWeather(true);
          }}
          aria-label="显示天气图标"
        />
      )}
    </div>
  );
}

function CoupleTogetherMarker({
  weather,
  x,
  y,
}: Readonly<{
  weather: WeatherInfo;
  x: number;
  y: number;
}>) {
  const [showWeather, setShowWeather] = useState(true);

  return (
    <div
      className="absolute z-10 flex w-20 -translate-x-1/2 -translate-y-full flex-col items-center sm:w-24"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {showWeather && (
        <button
          className="pointer-events-auto"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setShowWeather(false);
          }}
          aria-label="隐藏天气图标"
        >
          <WeatherPixelIcon kind={weather.kind} className="map-weather-sprite" />
        </button>
      )}
      <AnimatedSprite asset={coupleSprite(weather.kind)} className="map-couple-sprite" />
      {!showWeather && (
        <button
          className="pointer-events-auto mt-0.5 h-2.5 w-2.5 rounded-full bg-sky/55"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setShowWeather(true);
          }}
          aria-label="显示天气图标"
        />
      )}
    </div>
  );
}

// The South China Sea ten-dash line, drawn as a small standalone inset box so it
// is always visible and never overlapped by floating cards on the main map.
export function SouthChinaSeaInset({ compact = false }: Readonly<{ compact?: boolean }> = {}) {
  const inset = useMemo(() => {
    if (!dashLineFeature) return null;

    const insetWidth = compact ? 70 : 116;
    const insetHeight = compact ? 96 : 162;
    const projection = makeProjectionForFeature(dashLineFeature, insetWidth, insetHeight, compact ? 8 : 12);
    const path = makePath(projection);

    return { width: insetWidth, height: insetHeight, d: path(dashLineFeature as never) ?? "" };
  }, [compact]);

  if (!inset || !inset.d) return null;

  return (
    <div className="w-fit shrink-0 rounded-[8px] border border-dim/80 bg-cream/70 p-1 shadow-[0_10px_28px_rgba(90,102,112,0.08)] backdrop-blur">
      <svg
        width={inset.width}
        height={inset.height}
        viewBox={`0 0 ${inset.width} ${inset.height}`}
        role="img"
        aria-label="南海诸岛"
      >
        <path
          d={inset.d}
          fill={colors.ink}
          fillOpacity="0.55"
          stroke={colors.ink}
          strokeOpacity="0.5"
          strokeWidth="0.8"
        />
        <text
          x={inset.width / 2}
          y={inset.height - 5}
          textAnchor="middle"
          fontSize={compact ? "7" : "9"}
          fontWeight="600"
          fill={colors.ink}
          fillOpacity="0.6"
        >
          南海诸岛
        </text>
      </svg>
    </div>
  );
}

export default function ChinaMap({ width = 1100, height = 860, className }: ChinaMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(initialZoom);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, PartnerProfile>>({});
  const [markerWeather, setMarkerWeather] = useState<Record<string, WeatherInfo>>({});
  const router = useRouter();
  const { data: memoryData } = useMemorySummary();
  const memorySummary = useMemo(() => memoryData?.summary ?? {}, [memoryData?.summary]);
  const localMemories = useMemo<LocalMemoryStore>(() => summaryToMemoryStore(memorySummary), [memorySummary]);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const syncSettings = () => {
      const settings = readAppSettings();
      const profiles = normalizeMemberProfiles(settings.memberProfiles);
      const session = readSession();
      const memberKey = session?.user?.id || session?.user?.username || "local-user";

      if (Object.keys(profiles).length > 0) {
        setMemberProfiles(profiles);
        return;
      }

      setMemberProfiles({
        [memberKey]: {
          name: session?.user?.displayName || session?.user?.username || "我",
          gender: "neutral",
          cityId: defaultSelfCityId,
        },
      });
    };

    syncSettings();
    window.addEventListener(appSettingsUpdatedEvent, syncSettings);
    window.addEventListener("storage", syncSettings);

    return () => {
      window.removeEventListener(appSettingsUpdatedEvent, syncSettings);
      window.removeEventListener("storage", syncSettings);
    };
  }, []);

  const provinceStats = useMemo(() => {
    const stats = new Map<string, { count: number; cities: Set<string>; latest?: Memory }>();
    Object.values(memorySummary)
      .forEach((item) => {
        const city = cityById.get(item.cityId);
        if (!city) return;
        const entry = stats.get(city.provinceId) ?? { count: 0, cities: new Set<string>() };
        entry.count += item.count;
        entry.cities.add(city.id);
        if (item.latest && (!entry.latest || memoryTime(item.latest) > memoryTime(entry.latest))) entry.latest = item.latest;
        stats.set(city.provinceId, entry);
      });
    return stats;
  }, [memorySummary]);

  const litProvinceIds = useMemo(
    () => getLitProvinceIds(getLitCityIds(localMemories)),
    [localMemories],
  );

  const mapPaths = useMemo(() => {
    const projection = makeProjection(width, height, 24);
    const path = makePath(projection);

    return chinaFeatures.map((feature) => {
      const id = provinceIdOf(feature);
      const [cx, cy] = path.centroid(feature as never);

      return {
        id,
        d: path(feature as never) ?? "",
        x: stableCoordinate(cx),
        y: stableCoordinate(cy),
        province: provinceById.get(id),
      };
    });
  }, [height, width]);

  const route = useMemo(() => {
    const projection = makeProjection(width, height, 24);
    const points = buildMemoryRoutePoints(localMemories)
      .map((point) => {
        const projected = projection([point.city.lng, point.city.lat]);
        if (!projected) return null;

        return {
          ...point,
          x: stableCoordinate(projected[0]),
          y: stableCoordinate(projected[1]),
        };
      })
      .filter(Boolean) as Array<ReturnType<typeof buildMemoryRoutePoints>[number] & { x: number; y: number }>;

    return {
      points,
      d: curvedRoutePath(points),
    };
  }, [height, localMemories, width]);

  const coupleMarkers = useMemo(() => {
    const projection = makeProjection(width, height, 24);
    const entries = Object.entries(memberProfiles).slice(0, 4);

    return entries
      .map(([key, profile], index) => {
        const city = cityById.get(profile.cityId ?? "");
        if (!city) return null;

        const projected = projection([city.lng, city.lat]);
        if (!projected) return null;

        const [x, y] = projected;

        return {
          key,
          profile,
          index,
          city,
          x: (stableCoordinate(x) / width) * 100,
          y: (stableCoordinate(y) / height) * 100,
        };
      })
      .filter(Boolean) as Array<{
        key: string;
        profile: PartnerProfile;
        index: number;
        city: (typeof cities)[number];
        x: number;
        y: number;
      }>;
  }, [height, memberProfiles, width]);

  const sameCityCoupleMarker = useMemo(() => {
    if (coupleMarkers.length < 2) return null;
    const firstCityId = coupleMarkers[0]?.city.id;
    if (!firstCityId || !coupleMarkers.every((marker) => marker.city.id === firstCityId)) return null;

    return {
      city: coupleMarkers[0].city,
      x: coupleMarkers.reduce((sum, marker) => sum + marker.x, 0) / coupleMarkers.length,
      y: coupleMarkers.reduce((sum, marker) => sum + marker.y, 0) / coupleMarkers.length,
    };
  }, [coupleMarkers]);

  useEffect(() => {
    if (coupleMarkers.length === 0) return;
    let cancelled = false;

    async function loadMarkerWeather() {
      const weather = await fetchCitiesWeather(coupleMarkers.map((marker) => ({ city: marker.city })));
      if (!cancelled) setMarkerWeather(weather);
    }

    void loadMarkerWeather();
    const interval = window.setInterval(loadMarkerWeather, 30 * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [coupleMarkers]);

  const selectedPath = selectedProvinceId ? mapPaths.find((path) => path.id === selectedProvinceId) : undefined;
  const selectedStats = selectedProvinceId ? provinceStats.get(selectedProvinceId) : undefined;
  const selectedCover = selectedStats?.latest?.image || selectedStats?.latest?.photos?.[0] || null;
  const zoomProgress = ((zoom - minZoom) / (maxZoom - minZoom)) * 100;
  const setClampedZoom = (nextZoom: number) => {
    setZoom(Math.min(Math.max(nextZoom, minZoom), maxZoom));
  };

  const goProvinceCity = (provinceId: string, cityId: string) => {
    router.push(`/province/${provinceId}?city=${cityId}`);
  };

  // 点击省份统一打开居中预览弹窗，再由弹窗进入省份页。
  const handleProvinceTap = (id: string) => {
    setSelectedProvinceId(id);
  };

  return (
    <motion.div
      className={`relative ${className ?? ""}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <div className="absolute right-2 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 rounded-full border border-dim/85 bg-cream/86 px-1.5 py-1.5 shadow-[0_12px_28px_rgba(90,102,112,0.1)] backdrop-blur sm:left-4 sm:right-auto sm:gap-2 sm:px-2 sm:py-3">
        <button
          className="grid h-8 w-8 place-items-center rounded-full text-ink transition hover:bg-mist/42 disabled:opacity-35 sm:h-9 sm:w-9"
          type="button"
          onClick={() => setClampedZoom(zoom + 0.15)}
          disabled={zoom >= maxZoom}
          aria-label="放大中国地图"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="hidden h-9 min-w-12 items-center justify-center px-1 sm:flex sm:min-h-28 sm:w-9 sm:min-w-0 sm:flex-col sm:gap-2 sm:px-0">
          <input
            className="map-zoom-slider hidden sm:block"
            type="range"
            min={minZoom}
            max={maxZoom}
            step="0.01"
            value={zoom}
            onChange={(event) => setClampedZoom(Number(event.target.value))}
            aria-label="拖动缩放中国地图"
            style={{ "--zoom-progress": `${zoomProgress}%` } as CSSProperties}
          />
          <span className="text-[10px] font-semibold leading-none text-ink/58">
            {Math.round(zoom * 100)}%
          </span>
        </div>
        <button
          className="grid h-8 w-8 place-items-center rounded-full text-ink transition hover:bg-sakura/55 disabled:opacity-35 sm:h-9 sm:w-9"
          type="button"
          onClick={() => setClampedZoom(zoom - 0.15)}
          disabled={zoom <= minZoom}
          aria-label="缩小中国地图"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          className="grid h-8 w-8 place-items-center rounded-full text-ink transition hover:bg-mint/48 disabled:opacity-35 sm:h-9 sm:w-9"
          type="button"
          onClick={() => setZoom(initialZoom)}
          disabled={zoom === initialZoom}
          aria-label="重置中国地图缩放"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <motion.div
        className="relative h-full w-full overflow-visible"
        animate={{ scale: zoom }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
        style={{ transformOrigin: "55% 58%" }}
      >
        <div
          className="map-visual-scale relative h-full w-full overflow-visible"
          onClick={() => setSelectedProvinceId(null)}
        >
          <svg
            className="h-full w-full overflow-visible drop-shadow-[0_16px_26px_rgba(168,200,220,0.18)]"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="China map with visited provinces highlighted"
          >
            <defs>
              <filter id="visitedGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feFlood floodColor={colors.bloom} floodOpacity="0.42" />
                <feComposite in2="blur" operator="in" />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <pattern id="softPixelTexture" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M0 0h2v2H0z" fill={colors.cream} opacity="0.26" />
                <path d="M5 5h1.5v1.5H5z" fill={colors.sky} opacity="0.08" />
              </pattern>
              <linearGradient id="memoryRouteGradient" x1="0%" x2="100%" y1="15%" y2="85%">
                <stop offset="0%" stopColor={colors.bloom} stopOpacity="0.78" />
                <stop offset="48%" stopColor={colors.sky} stopOpacity="0.86" />
                <stop offset="100%" stopColor="var(--color-mint)" stopOpacity="0.75" />
              </linearGradient>
            </defs>

            <g shapeRendering="geometricPrecision">
              {mapPaths.map((path) => {
                const lit = litProvinceIds.has(path.id);

                return (
                  <path
                    key={`${path.id}-glow`}
                    d={path.d}
                    fill="none"
                    stroke={lit ? colors.bloom : "transparent"}
                    strokeWidth={lit ? 10 : 0}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={lit ? 0.18 : 0}
                    filter={lit ? "url(#visitedGlow)" : undefined}
                    pointerEvents="none"
                  />
                );
              })}

              {mapPaths.map((path) => {
                const isHovered = hoveredId === path.id;
                const lit = litProvinceIds.has(path.id);

                return (
                  <path
                    key={path.id}
                    d={path.d}
                    fill={lit ? colors.sakura : colors.dim}
                    fillOpacity={lit ? 0.68 : 0.34}
                    stroke={lit ? colors.bloom : colors.ink}
                    strokeOpacity={lit ? 0.95 : 0.24}
                    strokeWidth={lit ? 2.2 : 1.25}
                    strokeLinejoin="round"
                    className="cursor-pointer transition-all duration-300"
                    filter={lit || isHovered ? "url(#visitedGlow)" : undefined}
                    onMouseEnter={() => setHoveredId(path.id)}
                    onMouseLeave={() =>
                      setHoveredId((current) => (current === path.id ? null : current))
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      handleProvinceTap(path.id);
                    }}
                  />
                );
              })}

              {mapPaths
                .filter((path) => easyTapProvinceIds.has(path.id))
                .map((path) => (
                  <g key={`${path.id}-easy-tap`}>
                    <circle
                      cx={path.x}
                      cy={path.y}
                      r={path.id === "macau" ? 18 : 24}
                      fill={colors.sakura}
                      fillOpacity={hoveredId === path.id ? 0.22 : 0.08}
                      stroke={colors.bloom}
                      strokeOpacity={hoveredId === path.id ? 0.5 : 0.18}
                      strokeWidth="1.5"
                      className="cursor-pointer transition-all duration-300"
                      onMouseEnter={() => setHoveredId(path.id)}
                      onMouseLeave={() =>
                        setHoveredId((current) => (current === path.id ? null : current))
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        handleProvinceTap(path.id);
                      }}
                    />
                    <circle
                      cx={path.x}
                      cy={path.y}
                      r="3.5"
                      fill={colors.bloom}
                      opacity="0.55"
                      pointerEvents="none"
                    />
                  </g>
                ))}

              {mapPaths.map((path) =>
                litProvinceIds.has(path.id) ? (
                  <path
                    key={`${path.id}-inner`}
                    d={path.d}
                    fill="url(#softPixelTexture)"
                    stroke={colors.cream}
                    strokeOpacity="0.9"
                    strokeWidth="1"
                    pointerEvents="none"
                  />
                ) : null,
              )}

              {!reduceMotion && selectedProvinceId && selectedPath && (
                <motion.path
                  key={`${selectedProvinceId}-spark`}
                  d={selectedPath.d}
                  fill="none"
                  stroke={colors.bloom}
                  strokeWidth="2.5"
                  pointerEvents="none"
                  filter="url(#visitedGlow)"
                  style={{ transformBox: "fill-box", transformOrigin: "center" }}
                  initial={{ opacity: 0.7, scale: 1 }}
                  animate={{ opacity: [0.7, 0], scale: [1, 1.06] }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                />
              )}

              {route.d && (
                <motion.path
                  d={route.d}
                  fill="none"
                  stroke="url(#memoryRouteGradient)"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="8 10"
                  strokeOpacity="0.76"
                  pointerEvents="none"
                  initial={{ pathLength: reduceMotion ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 1.15, ease: "easeInOut" }}
                />
              )}

              {route.points.map((point) => (
                <g key={`${point.memory.id}-china-route-node`}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="14"
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={(event) => {
                      event.stopPropagation();
                      goProvinceCity(point.city.provinceId, point.city.id);
                    }}
                  >
                    <title>{`${point.city.name} · 第 ${point.order} 站`}</title>
                  </circle>
                  <circle cx={point.x} cy={point.y} r="7" fill={colors.cream} fillOpacity="0.92" pointerEvents="none" />
                  <circle cx={point.x} cy={point.y} r="3.6" fill={colors.bloom} fillOpacity="0.88" pointerEvents="none" />
                  {route.points.length <= 12 && (
                    <text
                      x={point.x}
                      y={point.y - 9}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="700"
                      fill={colors.ink}
                      fillOpacity="0.58"
                      pointerEvents="none"
                    >
                      {point.order}
                    </text>
                  )}
                </g>
              ))}
            </g>
          </svg>

          {sameCityCoupleMarker ? (
            <CoupleTogetherMarker
              weather={markerWeather[sameCityCoupleMarker.city.id] ?? {
                cityId: sameCityCoupleMarker.city.id,
                temp: weatherFallbackTemp,
                kind: "partly",
                label: "多云",
              }}
              x={sameCityCoupleMarker.x}
              y={sameCityCoupleMarker.y}
            />
          ) : (
            coupleMarkers.map((marker) => (
              <CoupleMarker
                key={`${marker.key}-${marker.city.id}`}
                profile={marker.profile}
                weather={markerWeather[marker.city.id] ?? {
                  cityId: marker.city.id,
                  temp: weatherFallbackTemp,
                  kind: "partly",
                  label: "多云",
                }}
                x={marker.x}
                y={marker.y}
                index={marker.index}
              />
            ))
          )}
        </div>
      </motion.div>

      <Modal
        open={Boolean(selectedPath?.province)}
        onClose={() => setSelectedProvinceId(null)}
        title={selectedPath?.province?.name}
        description={selectedPath?.province?.nameEn}
        size="md"
      >
        {selectedPath?.province && selectedProvinceId && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              {selectedCover ? (
                <Image
                  src={selectedCover}
                  alt=""
                  width={76}
                  height={76}
                  unoptimized
                  className="pixelated h-[76px] w-[76px] shrink-0 rounded-[8px] border border-dim object-cover"
                />
              ) : (
                <span className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-[8px] border border-dim bg-dim/40 text-xs font-medium text-ink/45">
                  未点亮
                </span>
              )}
              <div className="min-w-0 flex-1">
                {selectedStats ? (
                  <>
                    <p className="text-sm font-semibold text-bloom">
                      {selectedStats.count} 条回忆 · 点亮 {selectedStats.cities.size} 城
                    </p>
                    {selectedStats.latest && (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink/68">
                        {selectedStats.latest.title || selectedStats.latest.text || "最近的回忆"}
                        {selectedStats.latest.date ? ` · ${selectedStats.latest.date}` : ""}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm leading-6 text-ink/62">还没有回忆，可以进入省份后添加第一座城市。</p>
                )}
              </div>
            </div>
            <Link
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-sakura px-4 text-sm font-semibold text-bloom transition hover:bg-bloom hover:text-cream"
              href={`/province/${selectedProvinceId}`}
            >
              进入 {selectedPath.province.name}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </Modal>
    </motion.div>
  );
}
