// Geographic data for the footprint map, generated offline by
// scripts/build-map-geo.mjs from the web app's china-geo.json + data tables.
// Do not edit the JSON by hand; run `npm run map:geo` at the repo root.

import mapGeo from "../assets/geo/china-map.json";
import mapData from "../assets/geo/china-data.json";

export type Point = [number, number];

export interface ProvinceShape {
  id: string;
  rings: Point[][];
  centroid: Point;
}

export interface ProjectionParams {
  k: number;
  tx: number;
  ty: number;
}

export interface ChinaMapGeo {
  width: number;
  height: number;
  projection: ProjectionParams;
  provinces: ProvinceShape[];
  cityPoints: Record<string, Point>;
  dashLine: Point[][];
}

export interface City {
  id: string;
  name: string;
  provinceId: string;
  lng: number;
  lat: number;
}

export interface Province {
  id: string;
  name: string;
}

const geo = mapGeo as unknown as ChinaMapGeo;
const data = mapData as unknown as { provinces: Province[]; cities: City[] };

export const mapWidth = geo.width;
export const mapHeight = geo.height;
export const mapProjection = geo.projection;
export const provinceShapes = geo.provinces;
export const cityPoints = geo.cityPoints;
export const dashLine = geo.dashLine;

export const provinces = data.provinces;
export const cities = data.cities;

export const provinceById = new Map(provinces.map((province) => [province.id, province]));
export const cityById = new Map(cities.map((city) => [city.id, city]));
export const provinceShapeById = new Map(provinceShapes.map((shape) => [shape.id, shape]));

export const getCitiesByProvince = (provinceId: string): City[] =>
  cities.filter((city) => city.provinceId === provinceId);
