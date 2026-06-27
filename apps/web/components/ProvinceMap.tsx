"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSWRConfig } from "swr";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { chinaFeatures, makePath, makeProjectionForProvince, provinceIdOf } from "@/lib/geo";
import { cityRegionPath, cityRegionsOfProvince } from "@/lib/cityGeo";
import { getCitiesByProvince, type City } from "@/data/cities";
import type { Memory } from "@/data/memories";
import { getLitCityIds, memoryStoreUpdatedEvent, type LocalMemoryStore } from "@/data/progress";
import { buildMemoryRoutePoints, curvedRoutePath } from "@/lib/memoryRoutes";
import type { Province } from "@/data/provinces";
import { MemoryCitySheet, type MemoryPatchPayload } from "@/components/memories/MemoryCitySheet";
import { apiFetch, apiJson } from "@/lib/apiClient";
import { adminModeUpdatedEvent } from "@/data/adminMode";
import { memoryPhotosPayload } from "@/lib/photoPayload";
import { useContentEditAccess } from "@/lib/useContentEditAccess";
import { useIsMobile } from "@/lib/useIsMobile";
import { memoriesApiKey, publishMemoryStore, type MemoriesResponse } from "@/lib/memoryStore";
import { summaryToMemoryStore, useMemorySummary } from "@/lib/memorySummaryStore";
import { useApi } from "@/lib/swr";
import {
  type CardAnchor,
  type CityAssetStore,
  type DragState,
  type MapCamera,
  EMPTY_CITY_ASSETS,
  cityListPanelWidth,
  clampZoom,
  colors,
  getMarkerLayout,
  memoryCardGap,
  memoryCardMaxHeight,
  memoryCardWidth,
  revokeObjectUrl,
  spring,
  stableCoordinate,
} from "./ProvinceMap/shared";
import { CityMarker } from "./ProvinceMap/CityMarker";
import { CityPreviewPopover } from "./ProvinceMap/CityPreviewPopover";
import { MemoryCard } from "./ProvinceMap/MemoryCard";

interface ProvinceMapProps {
  province: Province;
  width?: number;
  height?: number;
}

type BrowserTimeout = ReturnType<Window["setTimeout"]>;

export default function ProvinceMap({ province, width = 1120, height = 760 }: ProvinceMapProps) {
  const isAdmin = useContentEditAccess();
  const isMobile = useIsMobile();
  const frameRef = useRef<HTMLDivElement>(null);
  const nudgeTimeoutRef = useRef<BrowserTimeout | null>(null);
  const longPressTimeoutRef = useRef<BrowserTimeout | null>(null);
  const previousLitCityIdsRef = useRef<Set<string> | null>(null);
  const localMemoriesRef = useRef<LocalMemoryStore>({});
  const { mutate } = useSWRConfig();
  const { data: summaryData, mutate: mutateSummary } = useMemorySummary();
  const cameraRef = useRef<MapCamera>({ scale: 1, x: 0, y: 0 });
  const dragStateRef = useRef<DragState | null>(null);
  const dragMovedRef = useRef(false);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [cityMemoryStore, setCityMemoryStore] = useState<LocalMemoryStore>({});
  const [nudgedCityId, setNudgedCityId] = useState<string | null>(null);
  const [sparkedCityId, setSparkedCityId] = useState<string | null>(null);
  const [previewCityId, setPreviewCityId] = useState<string | null>(null);
  const [mobileSheetMode, setMobileSheetMode] = useState<"view" | "create">("view");
  const [dragging, setDragging] = useState(false);
  const [frameScale, setFrameScale] = useState(1);
  const { data: cityAssetData, mutate: mutateCityAssets } = useApi<{ assets?: CityAssetStore }>(
    "/api/v1/city-assets",
  );
  const cityAssets = cityAssetData?.assets ?? EMPTY_CITY_ASSETS;
  const [camera, setCameraState] = useState<MapCamera>({ scale: 1, x: 0, y: 0 });
  const summaryMemories = useMemo(
    () => summaryToMemoryStore(summaryData?.summary ?? {}),
    [summaryData?.summary],
  );
  const localMemories = useMemo(
    () => ({ ...summaryMemories, ...cityMemoryStore }),
    [cityMemoryStore, summaryMemories],
  );
  const provinceCities = useMemo(() => getCitiesByProvince(province.id), [province.id]);
  const litCityIds = useMemo(() => getLitCityIds(localMemories), [localMemories]);
  const selectedCity = provinceCities.find((city) => city.id === selectedCityId) ?? null;
  const cityList = useMemo(
    () =>
      [...provinceCities].sort((a, b) => {
        const aLit = litCityIds.has(a.id);
        const bLit = litCityIds.has(b.id);
        if (aLit !== bLit) return aLit ? -1 : 1;

        return a.name.localeCompare(b.name, "zh-Hans-CN");
      }),
    [litCityIds, provinceCities],
  );

  const setCamera = (nextCamera: MapCamera | ((current: MapCamera) => MapCamera)) => {
    setCameraState((current) => {
      const resolved = typeof nextCamera === "function" ? nextCamera(current) : nextCamera;
      const clamped = {
        ...resolved,
        scale: clampZoom(resolved.scale),
      };
      cameraRef.current = clamped;

      return clamped;
    });
  };

  const loadCityMemories = useCallback(async (cityId: string, force = false) => {
    if (!force && cityId in localMemoriesRef.current && (cityId in cityMemoryStore)) return;
    const data = await apiJson<MemoriesResponse>(`/api/v1/memories/cities/${encodeURIComponent(cityId)}`);
    const cityMemories = data.memories[cityId] ?? [];
    setCityMemoryStore((current) => ({ ...current, [cityId]: cityMemories }));
  }, [cityMemoryStore]);

  const commitMemoryStore = useCallback((memories: LocalMemoryStore, cityId: string) => {
    const cityMemories = memories[cityId] ?? [];
    setCityMemoryStore((current) => ({ ...current, [cityId]: cityMemories }));
    localMemoriesRef.current = { ...localMemoriesRef.current, [cityId]: cityMemories };
    void mutate(memoriesApiKey, { memories } satisfies MemoriesResponse, { revalidate: false });
    void mutateSummary();
    publishMemoryStore(memories);
  }, [mutate, mutateSummary]);

  useEffect(() => {
    return () => {
      if (nudgeTimeoutRef.current) window.clearTimeout(nudgeTimeoutRef.current);
      if (longPressTimeoutRef.current) window.clearTimeout(longPressTimeoutRef.current);
    };
  }, []);

  const clearLongPressPreview = useCallback(() => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const previous = previousLitCityIdsRef.current;
    if (!previous) {
      previousLitCityIdsRef.current = new Set(litCityIds);
      return;
    }

    const newlyLitCityId = [...litCityIds].find((cityId) => !previous.has(cityId));
    previousLitCityIdsRef.current = new Set(litCityIds);
    if (!newlyLitCityId) return;

    setSparkedCityId(newlyLitCityId);
    const timer = window.setTimeout(() => setSparkedCityId(null), 900);
    return () => window.clearTimeout(timer);
  }, [litCityIds]);

  useEffect(() => {
    localMemoriesRef.current = localMemories;
  }, [localMemories]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    return () => {
      Object.values(localMemoriesRef.current).forEach((memories) => {
        memories.forEach((memory) => revokeObjectUrl(memory.image));
      });
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const applyMemories = (memories: LocalMemoryStore) => {
      if (cancelled) return;
      const selectedMemories = selectedCityId ? memories[selectedCityId] : undefined;
      if (selectedCityId && selectedMemories) {
        setCityMemoryStore((current) => ({ ...current, [selectedCityId]: selectedMemories }));
      }
    };
    const reloadRemoteState = () => {
      void mutateCityAssets();
      void mutateSummary();
      if (selectedCityId) void loadCityMemories(selectedCityId, true);
    };
    const handleMemoryUpdate = (event: Event) => {
      const detail = (event as CustomEvent<LocalMemoryStore>).detail;
      if (detail) applyMemories(detail);
    };

    // 进入页面走缓存（不强制重拉）；仅在管理模式切换 / 跨标签页 storage 变化时刷新，
    // 常规新鲜度由 SWR 的 focus/reconnect 后台刷新负责。
    window.addEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
    window.addEventListener(adminModeUpdatedEvent, reloadRemoteState);
    window.addEventListener("storage", reloadRemoteState);

    return () => {
      cancelled = true;
      window.removeEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
      window.removeEventListener(adminModeUpdatedEvent, reloadRemoteState);
      window.removeEventListener("storage", reloadRemoteState);
    };
  }, [loadCityMemories, mutateCityAssets, mutateSummary, selectedCityId]);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const updateScale = () => {
      const { width: renderedWidth } = frame.getBoundingClientRect();
      setFrameScale(renderedWidth / width);
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(frame);
    window.addEventListener("resize", updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [width]);

  const mapGeometry = useMemo(() => {
    const projection = makeProjectionForProvince(province.id, width, height, 88);
    const path = makePath(projection);
    const cityRegions = cityRegionsOfProvince(province.id);
    const cityPoint = (city: Pick<City, "lng" | "lat">) => {
      const [x, y] = projection([city.lng, city.lat]) ?? [width / 2, height / 2];

      return [stableCoordinate(x), stableCoordinate(y)] as const;
    };

    return {
      paths: chinaFeatures.map((feature) => ({
        id: provinceIdOf(feature),
        d: path(feature as never) ?? "",
        active: provinceIdOf(feature) === province.id,
      })),
      cities: provinceCities.map((city) => {
        const [x, y] = cityPoint(city);

        return {
          city,
          x,
          y,
        };
      }),
      cityRegions: cityRegions.map((region) => ({
        city: region.city,
        wholeProvince: region.wholeProvince,
        d: cityRegionPath(region, projection),
      })),
    };
  }, [height, province.id, provinceCities, width]);

  const mapCities = useMemo(
    () =>
      mapGeometry.cities.map(({ city, x, y }) => {
        const cityMemories = localMemories[city.id] ?? [];
        const localMemory = cityMemories[0];
        const lit = litCityIds.has(city.id);
        const customSprite = cityAssets[city.id];

        return {
          ...city,
          sprite: customSprite ?? city.sprite,
          customSprite,
          x,
          y,
          lit,
          memory: localMemory,
          // 该城回忆数量（用于徽标）与最早回忆日期（用于轨迹连线排序）。
          memoryCount: cityMemories.length,
          earliestDate: cityMemories.reduce<string | undefined>((earliest, memory) => {
            if (!memory.date) return earliest;
            return !earliest || memory.date < earliest ? memory.date : earliest;
          }, undefined),
        };
      }),
    [cityAssets, litCityIds, localMemories, mapGeometry.cities],
  );

  const routePoints = useMemo(() => {
    const pointByCityId = new Map(mapCities.map((city) => [city.id, { x: city.x, y: city.y }]));

    return buildMemoryRoutePoints(localMemories, province.id)
      .map((point) => {
        const projected = pointByCityId.get(point.city.id);
        return projected ? { ...point, ...projected } : null;
      })
      .filter(Boolean) as Array<ReturnType<typeof buildMemoryRoutePoints>[number] & { x: number; y: number }>;
  }, [localMemories, mapCities, province.id]);

  const travelRoute = useMemo(() => curvedRoutePath(routePoints), [routePoints]);

  const selectedPoint = mapCities.find((city) => city.id === selectedCityId);
  const cardAnchor = selectedPoint
    ? (() => {
        const renderedWidth = width * frameScale;
        const renderedHeight = height * frameScale;
        const rightLimit = Math.max(memoryCardWidth + 24, renderedWidth - cityListPanelWidth);
        const anchorX = (selectedPoint.x * camera.scale + camera.x) * frameScale;
        const anchorY = (selectedPoint.y * camera.scale + camera.y) * frameScale;
        const side = anchorX + memoryCardGap + memoryCardWidth > rightLimit ? "left" : "right";
        const x =
          side === "right"
            ? Math.min(anchorX + memoryCardGap, rightLimit - memoryCardWidth - 12)
            : Math.max(anchorX - memoryCardGap - memoryCardWidth, 12);
        const y = Math.min(
          Math.max(anchorY - 170, 82),
          Math.max(82, renderedHeight - memoryCardMaxHeight),
        );

        return { x, y, side } satisfies CardAnchor;
      })()
    : null;

  const handleSaveMemory = async (cityId: string, memory: Memory) => {
    if (!isAdmin) throw new Error("Admin mode required");

    const response = await apiFetch("/api/v1/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...memory,
        photos: memoryPhotosPayload(memory.photos ?? [memory.image]),
      }),
    });

    if (!response.ok) throw new Error("Failed to save memory");

    const data = (await response.json()) as { memories: LocalMemoryStore };
    commitMemoryStore(data.memories, cityId);
  };

  const handleSetMemoryCover = async (cityId: string, memoryId: string, coverImage: string) => {
    if (!isAdmin) throw new Error("Admin mode required");

    const response = await apiFetch(`/memories/${memoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverImage }),
    });

    if (!response.ok) throw new Error("Failed to update memory cover");

    const data = (await response.json()) as { memory: Memory; memories: LocalMemoryStore };
    commitMemoryStore(data.memories, cityId);
  };

  const handleUpdateMemory = async (cityId: string, memoryId: string, memory: MemoryPatchPayload) => {
    if (!isAdmin) throw new Error("Admin mode required");

    const response = await apiFetch(`/memories/${memoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(memory),
    });

    if (!response.ok) throw new Error("Failed to update memory");

    const data = (await response.json()) as { memory: Memory; memories: LocalMemoryStore };
    commitMemoryStore(data.memories, cityId);
  };

  const handleDeleteMemory = async (cityId: string, memoryId: string) => {
    if (!isAdmin) throw new Error("Admin mode required");

    const response = await apiFetch(`/memories/${memoryId}`, {
      method: "DELETE",
    });

    if (!response.ok) throw new Error("Failed to delete memory");

    const data = (await response.json()) as { memories: LocalMemoryStore };
    commitMemoryStore(data.memories, cityId);
  };

  const handleSaveCityAsset = async (cityId: string, image: string) => {
    if (!isAdmin) throw new Error("Admin mode required");

    const response = await apiFetch("/api/v1/city-assets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityId, image }),
    });

    if (!response.ok) throw new Error("Failed to save city asset");

    const data = (await response.json()) as { assets: CityAssetStore };
    void mutateCityAssets({ assets: data.assets }, { revalidate: false });
  };

  const handleDeleteCityAsset = async (cityId: string) => {
    if (!isAdmin) throw new Error("Admin mode required");

    const response = await apiFetch("/api/v1/city-assets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityId }),
    });

    if (!response.ok) throw new Error("Failed to delete city asset");

    const data = (await response.json()) as { assets: CityAssetStore };
    void mutateCityAssets({ assets: data.assets }, { revalidate: false });
  };

  const focusCity = (city: Pick<City, "id">) => {
    const point = mapGeometry.cities.find((candidate) => candidate.city.id === city.id);
    if (!point) return;

    const scale = clampZoom(Math.max(cameraRef.current.scale, 1.62));
    setCamera({
      scale,
      x: width / 2 - point.x * scale - 150,
      y: height / 2 - point.y * scale + 12,
    });
  };

  const handleSelectCity = (cityId: string, lit: boolean) => {
    const city = provinceCities.find((candidate) => candidate.id === cityId);
    setSelectedCityId(cityId);
    setMobileSheetMode(!lit && isAdmin ? "create" : "view");
    void loadCityMemories(cityId);
    if (city) focusCity(city);
    if (!lit) {
      setNudgedCityId(cityId);
      if (nudgeTimeoutRef.current) window.clearTimeout(nudgeTimeoutRef.current);
      nudgeTimeoutRef.current = window.setTimeout(() => setNudgedCityId(null), 520);
    }
  };

  const resetCamera = () => {
    setSelectedCityId(null);
    setCamera({ scale: 1, x: 0, y: 0 });
  };

  useEffect(() => {
    const cityId = new URLSearchParams(window.location.search).get("city");
    const city = provinceCities.find((candidate) => candidate.id === cityId);
    if (!city) return;

    const timer = window.setTimeout(() => {
      setSelectedCityId(city.id);
      void loadCityMemories(city.id);
      focusCity(city);
    }, 0);

    return () => window.clearTimeout(timer);
    // Run after city coordinates are projected so deep links can focus the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCityMemories, mapGeometry.cities, provinceCities]);

  const zoomAt = (clientX: number, clientY: number, delta: number) => {
    const frame = frameRef.current;
    if (!frame) return;

    const rect = frame.getBoundingClientRect();
    const pointerX = (clientX - rect.left) / frameScale;
    const pointerY = (clientY - rect.top) / frameScale;

    setCamera((current) => {
      const nextScale = clampZoom(current.scale * delta);
      const mapX = (pointerX - current.x) / current.scale;
      const mapY = (pointerY - current.y) / current.scale;

      return {
        scale: nextScale,
        x: pointerX - mapX * nextScale,
        y: pointerY - mapY * nextScale,
      };
    });
  };

  const zoomFromCenter = (delta: number) => {
    const frame = frameRef.current;
    const rect = frame?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : 0;
    const centerY = rect ? rect.top + rect.height / 2 : 0;

    zoomAt(centerX, centerY, delta);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 1.12 : 0.88;
    zoomAt(event.clientX, event.clientY, delta);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, article, aside")) return;

    dragMovedRef.current = false;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCamera: cameraRef.current,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const dx = (event.clientX - dragState.startClientX) / frameScale;
    const dy = (event.clientY - dragState.startClientY) / frameScale;

    if (Math.abs(dx) + Math.abs(dy) > 3) dragMovedRef.current = true;

    setCamera({
      ...dragState.startCamera,
      x: dragState.startCamera.x + dx,
      y: dragState.startCamera.y + dy,
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
      setDragging(false);
    }
  };

  return (
    <div
      ref={frameRef}
      className={`relative mx-auto aspect-[1120/760] w-[min(100%,1120px)] touch-none overflow-visible ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={(event) => {
        if (dragMovedRef.current) {
          dragMovedRef.current = false;
          return;
        }
        const target = event.target as HTMLElement;
        if (!target.closest("button, article")) setSelectedCityId(null);
      }}
    >
      <div
        className="absolute left-0 top-0 z-0 origin-top-left"
        style={{
          width,
          height,
          transformOrigin: "0 0",
          transform: `scale(${frameScale})`,
        }}
      >
        <motion.div
          className="absolute left-0 top-0 origin-top-left"
          animate={{ scale: camera.scale, x: camera.x, y: camera.y }}
          transition={spring}
          style={{
            width,
            height,
            transformOrigin: "0 0",
          }}
        >
          <svg
            className="h-full w-full overflow-visible drop-shadow-[0_18px_30px_rgba(168,200,220,0.16)]"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${province.name} province map`}
          >
            <defs>
              <filter id="provinceGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feFlood floodColor={colors.bloom} floodOpacity="0.36" />
                <feComposite in2="blur" operator="in" />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="cityRegionGlow" x="-18%" y="-18%" width="136%" height="136%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feFlood floodColor={colors.sky} floodOpacity="0.34" />
                <feComposite in2="blur" operator="in" />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id={`provinceRouteGradient-${province.id}`} x1="0%" x2="100%" y1="0%" y2="100%">
                <stop offset="0%" stopColor={colors.bloom} stopOpacity="0.74" />
                <stop offset="54%" stopColor={colors.sky} stopOpacity="0.82" />
                <stop offset="100%" stopColor="var(--color-mint)" stopOpacity="0.72" />
              </linearGradient>
            </defs>

            {mapGeometry.paths.map((path) => (
              <path
                key={path.id}
                d={path.d}
                fill={path.active ? colors.sakura : colors.dim}
                fillOpacity={path.active ? 0.44 : 0.12}
                stroke={path.active ? colors.bloom : colors.dim}
                strokeOpacity={path.active ? 0.86 : 0.45}
                strokeWidth={path.active ? 2.4 : 1.2}
                strokeLinejoin="round"
                filter={path.active ? "url(#provinceGlow)" : undefined}
              />
            ))}

            {mapGeometry.cityRegions.map((region) => {
              if (!region.d) return null;
              const lit = litCityIds.has(region.city.id);
              const selected = selectedCityId === region.city.id;
              const hovered = previewCityId === region.city.id;

              return (
                <motion.path
                  key={`${region.city.id}-region`}
                  d={region.d}
                  fill={lit ? colors.sakura : colors.cream}
                  fillOpacity={selected ? 0.74 : lit ? 0.58 : 0.28}
                  stroke={selected ? colors.bloom : lit ? colors.bloom : colors.ink}
                  strokeOpacity={selected ? 0.96 : lit ? 0.64 : 0.16}
                  strokeWidth={selected ? 2.8 : hovered ? 2.2 : 1.05}
                  strokeLinejoin="round"
                  className="cursor-pointer outline-none transition duration-300"
                  filter={selected || hovered ? "url(#cityRegionGlow)" : undefined}
                  whileHover={{ fillOpacity: lit ? 0.7 : 0.42 }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${region.city.name}城市区块，${lit ? "查看回忆" : "添加回忆"}`}
                  onMouseEnter={() => setPreviewCityId(region.city.id)}
                  onMouseLeave={() => setPreviewCityId((current) => (current === region.city.id ? null : current))}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleSelectCity(region.city.id, lit);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    handleSelectCity(region.city.id, lit);
                  }}
                />
              );
            })}

            {travelRoute && (
              <motion.path
                d={travelRoute}
                fill="none"
                stroke={`url(#provinceRouteGradient-${province.id})`}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="8 10"
                strokeOpacity={0.72}
                pointerEvents="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.05, ease: "easeInOut" }}
              />
            )}

            {routePoints.map((point) => (
              <g key={`${point.memory.id}-route-node`} pointerEvents="none">
                <circle cx={point.x} cy={point.y} r={8.5} fill={colors.cream} fillOpacity="0.92" />
                <circle cx={point.x} cy={point.y} r={4.2} fill={colors.bloom} fillOpacity="0.88" />
                {routePoints.length <= 9 && (
                  <text
                    x={point.x}
                    y={point.y - 11}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill={colors.ink}
                    fillOpacity="0.58"
                  >
                    {point.order}
                  </text>
                )}
              </g>
            ))}

          </svg>

          {mapCities.map((city) => {
            const selected = city.id === selectedCityId;
            const faded = selectedCityId && !selected;
            const nudged = nudgedCityId === city.id;
            const sparked = sparkedCityId === city.id;
            const previewOpen = previewCityId === city.id && city.memoryCount > 0;
            const layout = getMarkerLayout(city, selected);

	            return (
	              <motion.button
	                key={city.id}
	                className="group pointer-events-none absolute text-left transition duration-300 lg:pointer-events-auto"
                initial={false}
                animate={{
                  x: nudged ? [0, -3, 3, -2, 0] : 0,
                  scale: sparked ? [1, 1.24, 1] : 1,
                }}
                transition={{ duration: sparked ? 0.72 : nudged ? 0.42 : 0.24 }}
                style={{
                  left: city.x - layout.width / 2,
                  top: city.y - layout.height / 2,
                  width: layout.width,
                  height: layout.height,
                  opacity: faded ? 0.28 : 1,
                }}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleSelectCity(city.id, city.lit);
                }}
                onHoverStart={() => {
                  clearLongPressPreview();
                  setPreviewCityId(city.id);
                }}
                onHoverEnd={() => setPreviewCityId((current) => (current === city.id ? null : current))}
                onPointerDown={(event) => {
                  if (event.pointerType === "mouse") return;
                  clearLongPressPreview();
                  longPressTimeoutRef.current = window.setTimeout(() => setPreviewCityId(city.id), 400);
                }}
                onPointerUp={clearLongPressPreview}
                onPointerCancel={clearLongPressPreview}
                onPointerLeave={clearLongPressPreview}
                aria-label={`${city.lit ? "查看" : "添加"}${city.name}回忆`}
              >
                <CityMarker city={city} lit={city.lit} selected={selected} memoryCount={city.memoryCount} />
                <AnimatePresence>
                  {previewOpen && (
                    <CityPreviewPopover
                      city={city}
                      memory={city.memory}
                      memoryCount={city.memoryCount}
                    />
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      <div
        className="absolute left-3 top-3 z-40 hidden items-center gap-2 rounded-[8px] border border-dim/85 bg-cream/86 p-2 shadow-[0_10px_28px_rgba(90,102,112,0.08)] backdrop-blur lg:flex"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="grid h-9 w-9 place-items-center rounded-[7px] text-ink transition hover:bg-mist/45"
          type="button"
          onClick={() => zoomFromCenter(0.88)}
          aria-label="缩小地图"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-12 text-center text-xs font-semibold text-ink/70">
          {Math.round(camera.scale * 100)}%
        </span>
        <button
          className="grid h-9 w-9 place-items-center rounded-[7px] text-ink transition hover:bg-sakura/55"
          type="button"
          onClick={() => zoomFromCenter(1.12)}
          aria-label="放大地图"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          className="grid h-9 w-9 place-items-center rounded-[7px] text-ink transition hover:bg-mint/55"
          type="button"
          onClick={resetCamera}
          aria-label="重置地图视角"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <aside
        className="absolute right-0 top-3 z-40 hidden w-[230px] rounded-[8px] border border-dim/85 bg-cream/90 p-3 shadow-[0_16px_34px_rgba(90,102,112,0.10)] backdrop-blur lg:block"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        aria-label={`${province.name}城市列表`}
      >
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">城市</h2>
          <span className="text-xs font-medium text-ink/54">{provinceCities.length}</span>
        </div>
        <div className="max-h-[430px] space-y-1 overflow-y-auto pr-1">
          {cityList.map((city) => {
            const lit = litCityIds.has(city.id);
            const selected = city.id === selectedCityId;

            return (
              <button
                key={city.id}
                className={`flex w-full items-center justify-between gap-3 rounded-[7px] px-3 py-2 text-left text-sm transition ${
                  selected
                    ? "bg-sakura text-bloom shadow-[0_8px_18px_rgba(232,184,194,0.16)]"
                    : "text-ink/78 hover:bg-mist/34"
                }`}
                type="button"
                onClick={() => handleSelectCity(city.id, lit)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 border-cream ${
                      lit ? "bg-bloom shadow-[0_0_10px_rgba(232,184,194,0.55)]" : "bg-dim"
                    }`}
                  />
                  <span className="truncate font-semibold">{city.name}</span>
                </span>
                <span className={`shrink-0 text-[11px] ${lit ? "text-bloom/80" : "text-ink/40"}`}>
                  {lit ? "已去过" : "未去过"}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {selectedCity && !isMobile && (
        <MemoryCard
          key={selectedCity.id}
          city={selectedCity}
          localMemories={localMemories[selectedCity.id] ?? []}
          isLit={litCityIds.has(selectedCity.id)}
          anchor={cardAnchor}
          isAdmin={isAdmin}
          onClose={() => setSelectedCityId(null)}
          onSave={handleSaveMemory}
        onSetCover={handleSetMemoryCover}
        onUpdate={handleUpdateMemory}
        onDelete={handleDeleteMemory}
        landmarkImage={cityAssets[selectedCity.id] ?? selectedCity.sprite}
        hasCustomLandmark={Boolean(cityAssets[selectedCity.id])}
        onSaveLandmark={handleSaveCityAsset}
        onDeleteLandmark={handleDeleteCityAsset}
      />
      )}

      {selectedCity && isMobile && (
        <MemoryCitySheet
          key={`${selectedCity.id}-mobile-sheet`}
          open={selectedCity != null}
          onClose={() => setSelectedCityId(null)}
          city={selectedCity}
          localMemories={localMemories[selectedCity.id] ?? []}
          isLit={litCityIds.has(selectedCity.id)}
          isAdmin={isAdmin}
          defaultMode={mobileSheetMode}
          landmarkImage={cityAssets[selectedCity.id] ?? selectedCity.sprite}
          hasCustomLandmark={Boolean(cityAssets[selectedCity.id])}
          onSave={handleSaveMemory}
          onSetCover={handleSetMemoryCover}
          onUpdate={handleUpdateMemory}
          onDelete={handleDeleteMemory}
          onSaveLandmark={handleSaveCityAsset}
          onDeleteLandmark={handleDeleteCityAsset}
        />
      )}
    </div>
  );
}
