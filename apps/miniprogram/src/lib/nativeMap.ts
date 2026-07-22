import type { MapProps } from "@tarojs/components";
import { provinceShapes, type Point } from "../data/geo";
import { mapPointToGcj02, wgs84ToGcj02 } from "./mapProjection";
import { pointInRings } from "./pointInPolygon";
import { mapNativeColors, mapNativeMetrics } from "../styles/mapTokens";

export interface NativeProvinceGeometry {
  id: string;
  rings: Point[][];
  centroid: Point;
}

const ringArea = (ring: Point[]) =>
  Math.abs(
    ring.reduce((sum, point, index) => {
      const next = ring[(index + 1) % ring.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2,
  );

// Tiny offshore polygons add hundreds of native overlays without changing the
// nationwide view. Keep each province's main body and meaningful secondary land.
const selectDisplayRings = (rings: Point[][]) => {
  if (rings.length <= 1) return rings;
  const ranked = rings.map((ring) => ({ ring, area: ringArea(ring) }));
  const largest = Math.max(...ranked.map((item) => item.area));
  const threshold = Math.max(4, largest * 0.025);
  const selected = ranked.filter((item) => item.area >= threshold).map((item) => item.ring);
  return selected.length > 0 ? selected : [ranked[0].ring];
};

export const toNativeMapPoint = (lng: number, lat: number): MapProps.point => {
  const [longitude, latitude] = wgs84ToGcj02(lng, lat);
  return { longitude, latitude };
};

export const nativeProvinceGeometries: NativeProvinceGeometry[] = provinceShapes.map((shape) => ({
  id: shape.id,
  rings: selectDisplayRings(shape.rings).map((ring) =>
    ring.map(([x, y]) => mapPointToGcj02(x, y)),
  ),
  centroid: mapPointToGcj02(shape.centroid[0], shape.centroid[1]),
}));

export const buildNativeProvincePolygons = (litProvinceIds: Set<string>): MapProps.polygon[] =>
  nativeProvinceGeometries.flatMap((province) => {
    const lit = litProvinceIds.has(province.id);
    return province.rings.map((ring) => ({
      points: ring.map(([longitude, latitude]) => ({ longitude, latitude })),
      fillColor: lit ? mapNativeColors.litFill : mapNativeColors.unlitFill,
      strokeColor: lit ? mapNativeColors.litStroke : mapNativeColors.unlitStroke,
      strokeWidth: mapNativeMetrics.provinceStrokeWidth,
      zIndex: lit ? 2 : 1,
    }));
  });

const EASY_TAP_RADIUS = 0.6;
const EASY_TAP_PROVINCES = new Set(["hongkong", "macau"]);

export const findProvinceAtNativeCoordinate = (longitude: number, latitude: number) => {
  for (const province of nativeProvinceGeometries) {
    if (pointInRings(longitude, latitude, province.rings)) return province.id;
  }
  for (const province of nativeProvinceGeometries) {
    if (!EASY_TAP_PROVINCES.has(province.id)) continue;
    const [centroidLng, centroidLat] = province.centroid;
    if (Math.hypot(longitude - centroidLng, latitude - centroidLat) <= EASY_TAP_RADIUS) {
      return province.id;
    }
  }
  return null;
};

export const nativeChinaBounds: MapProps.point[] = [
  toNativeMapPoint(73.5, 18),
  toNativeMapPoint(134.8, 53.6),
];
