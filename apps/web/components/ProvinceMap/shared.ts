import { cityFallbackSprite, type City } from "@/data/cities";
import type { Memory } from "@/data/memories";
import type { MemoryRoutePoint } from "@/lib/memoryRoutes";

export type PhotoDraft = {
  previewUrl: string;
  name: string;
  file: File;
};

export type CardAnchor = {
  x: number;
  y: number;
  side: "left" | "right";
};

export type MapCamera = {
  scale: number;
  x: number;
  y: number;
};

export type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCamera: MapCamera;
};

export type MemoryPanelTab = "memory" | "gallery" | "history";

export type CityAssetStore = Record<string, string>;

export const EMPTY_CITY_ASSETS: CityAssetStore = {};

export type ProvinceMapPath = {
  id: string;
  d: string;
  active: boolean;
};

export type ProvinceMapCityRegion = {
  city: City;
  wholeProvince: boolean;
  d: string;
};

export type ProvinceMapGeometry = {
  paths: ProvinceMapPath[];
  cities: Array<{ city: City; x: number; y: number }>;
  cityRegions: ProvinceMapCityRegion[];
};

export type ProvinceMapCity = City & {
  x: number;
  y: number;
  sprite: string;
  customSprite?: string;
  lit: boolean;
  memory?: Memory;
  memoryCount: number;
  earliestDate?: string;
};

export type ProvinceRoutePoint = MemoryRoutePoint & {
  x: number;
  y: number;
};

export const colors = {
  cream: "var(--color-cream)",
  dim: "var(--color-dim)",
  ink: "var(--color-ink)",
  sakura: "var(--color-sakura)",
  bloom: "var(--color-bloom)",
  mist: "var(--color-mist)",
  sky: "var(--color-sky)",
};

export const spring = { type: "spring" as const, stiffness: 100, damping: 20 };
export const memoryTextMaxLength = 80;
export const maxPhotosPerMemory = 24;
export const memoryCardWidth = 292;
export const memoryCardGap = 26;
export const memoryCardMaxHeight = 620;
export const cityListPanelWidth = 250;

export const isObjectUrl = (url?: string | null): url is string =>
  typeof url === "string" && url.startsWith("blob:");

export const revokeObjectUrl = (url?: string | null) => {
  if (isObjectUrl(url)) URL.revokeObjectURL(url);
};

export const isDataImageUrl = (url?: string | null): url is string =>
  typeof url === "string" && url.startsWith("data:image/");

export type MarkerLayout = {
  width: number;
  height: number;
  iconSize: number;
  iconX: number;
  iconY: number;
  labelX: number;
  labelY: number;
};

export const markerLayoutByCity: Record<string, MarkerLayout> = {
  zhengzhou: { width: 214, height: 156, iconSize: 112, iconX: -56, iconY: -116, labelX: -34, labelY: -22 },
  jinan: { width: 208, height: 142, iconSize: 102, iconX: -52, iconY: -106, labelX: -28, labelY: -18 },
  qingdao: { width: 208, height: 142, iconSize: 102, iconX: -52, iconY: -106, labelX: -28, labelY: -18 },
  shanghai: { width: 214, height: 156, iconSize: 114, iconX: -57, iconY: -116, labelX: -34, labelY: -22 },
  hangzhou: { width: 208, height: 144, iconSize: 104, iconX: -52, iconY: -108, labelX: -30, labelY: -18 },
  guangzhou: { width: 214, height: 150, iconSize: 106, iconX: -42, iconY: -104, labelX: -16, labelY: -34 },
  zhuhai: { width: 214, height: 142, iconSize: 110, iconX: -48, iconY: -76, labelX: -6, labelY: 4 },
  hongkong: { width: 236, height: 142, iconSize: 124, iconX: -62, iconY: -94, labelX: -28, labelY: -10 },
  macau: { width: 214, height: 146, iconSize: 102, iconX: -51, iconY: -98, labelX: -26, labelY: -10 },
};

export const defaultMarkerLayout: MarkerLayout = {
  width: 192, height: 140, iconSize: 96, iconX: -48, iconY: -104, labelX: -50, labelY: -18,
};

export const compactMarkerLayout: MarkerLayout = {
  width: 86, height: 54, iconSize: 18, iconX: -9, iconY: -9, labelX: 8, labelY: -15,
};

export const previewMarkerLayout: MarkerLayout = {
  width: 92, height: 86, iconSize: 46, iconX: -23, iconY: -43, labelX: -30, labelY: 12,
};

export const getMarkerLayout = (city: City, selected: boolean): MarkerLayout => {
  if (city.sprite === cityFallbackSprite) return compactMarkerLayout;
  if (!selected) return previewMarkerLayout;
  return markerLayoutByCity[city.id] ?? defaultMarkerLayout;
};

export const stableCoordinate = (value: number) => Number(value.toFixed(3));
export const clampZoom = (value: number) => Math.min(Math.max(value, 1), 2.4);

export const revokePhotoDrafts = (photos: PhotoDraft[]) => {
  photos.forEach((photo) => revokeObjectUrl(photo.previewUrl));
};
