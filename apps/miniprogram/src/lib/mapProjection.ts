// Coordinate conversions shared by the footprint map. The generated province
// rings are stored in the web map's Mercator pixel space, while WeChat's native
// map renders GCJ-02 coordinates. Keeping both directions here ensures province
// fills, city routes, future check-ins and tap hit-testing stay aligned.

import { mapProjection, type Point } from "../data/geo";

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS = 6378245;
const ECCENTRICITY_SQUARED = 0.006693421622965943;

export function projectLngLat(lng: number, lat: number): Point {
  const { k, tx, ty } = mapProjection;
  const x = lng * DEG2RAD;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * DEG2RAD) / 2));
  return [k * x + tx, ty - k * y];
}

export function unprojectMapPoint(x: number, y: number): Point {
  const { k, tx, ty } = mapProjection;
  const lng = ((x - tx) / k) * RAD2DEG;
  const mercatorY = (ty - y) / k;
  const lat = (2 * Math.atan(Math.exp(mercatorY)) - Math.PI / 2) * RAD2DEG;
  return [lng, lat];
}

const outsideChina = (lng: number, lat: number) =>
  lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;

const transformLatitude = (lng: number, lat: number) => {
  let result = -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lat;
  result += 0.2 * Math.sqrt(Math.abs(lng));
  result += ((20 * Math.sin(6 * lng * Math.PI) + 20 * Math.sin(2 * lng * Math.PI)) * 2) / 3;
  result += ((20 * Math.sin(lat * Math.PI) + 40 * Math.sin((lat / 3) * Math.PI)) * 2) / 3;
  result +=
    ((160 * Math.sin((lat / 12) * Math.PI) + 320 * Math.sin((lat * Math.PI) / 30)) * 2) /
    3;
  return result;
};

const transformLongitude = (lng: number, lat: number) => {
  let result = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat;
  result += 0.1 * Math.sqrt(Math.abs(lng));
  result += ((20 * Math.sin(6 * lng * Math.PI) + 20 * Math.sin(2 * lng * Math.PI)) * 2) / 3;
  result += ((20 * Math.sin(lng * Math.PI) + 40 * Math.sin((lng / 3) * Math.PI)) * 2) / 3;
  result +=
    ((150 * Math.sin((lng / 12) * Math.PI) + 300 * Math.sin((lng / 30) * Math.PI)) * 2) /
    3;
  return result;
};

export function wgs84ToGcj02(lng: number, lat: number): Point {
  if (outsideChina(lng, lat)) return [lng, lat];

  let deltaLat = transformLatitude(lng - 105, lat - 35);
  let deltaLng = transformLongitude(lng - 105, lat - 35);
  const latitudeRadians = lat * DEG2RAD;
  const magic = 1 - ECCENTRICITY_SQUARED * Math.sin(latitudeRadians) ** 2;
  const rootMagic = Math.sqrt(magic);
  deltaLat =
    (deltaLat * 180) /
    (((EARTH_RADIUS * (1 - ECCENTRICITY_SQUARED)) / (magic * rootMagic)) * Math.PI);
  deltaLng =
    (deltaLng * 180) /
    ((EARTH_RADIUS / rootMagic) * Math.cos(latitudeRadians) * Math.PI);
  return [lng + deltaLng, lat + deltaLat];
}

export function mapPointToGcj02(x: number, y: number): Point {
  const [lng, lat] = unprojectMapPoint(x, y);
  return wgs84ToGcj02(lng, lat);
}
