import { geoArea, type GeoProjection } from "d3-geo";
import rawCityGeo from "@/data/china-city-geo.json";
import { cities, type City } from "@/data/cities";
import { provinces } from "@/data/provinces";
import { featureOfProvince, makePath, type GeoFeature } from "@/lib/geo";

type Position = [number, number];
type Ring = Position[];
type CityFeature = GeoFeature & {
  properties: GeoFeature["properties"] & {
    level?: string;
    provinceAdcode?: number;
    parent?: { adcode?: number };
  };
};

export type CityRegion = {
  city: City;
  feature: GeoFeature | { type: "FeatureCollection"; features: GeoFeature[] };
  wholeProvince: boolean;
};

const wholeProvinceCityIds = new Set([
  "beijing",
  "tianjin",
  "shanghai",
  "chongqing",
  "hongkong",
  "macau",
]);

const taiwanFallbackCityIds = new Set<string>();
const provinceById = new Map(provinces.map((province) => [province.id, province]));

function reverseFeature(feature: CityFeature): CityFeature {
  if (feature.geometry.type === "Polygon") {
    return {
      ...feature,
      geometry: {
        type: "Polygon",
        coordinates: (feature.geometry.coordinates as Ring[]).map((ring) => ring.slice().reverse()),
      },
    };
  }

  if (feature.geometry.type === "MultiPolygon") {
    return {
      ...feature,
      geometry: {
        type: "MultiPolygon",
        coordinates: (feature.geometry.coordinates as Ring[][]).map((polygon) =>
          polygon.map((ring) => ring.slice().reverse()),
        ),
      },
    };
  }

  return feature;
}

function fixWinding(feature: CityFeature): CityFeature {
  return geoArea(feature as never) > 2 * Math.PI ? reverseFeature(feature) : feature;
}

const cityFeatures = (rawCityGeo.features as CityFeature[])
  .filter((feature) => feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon")
  .map(fixWinding);

const cityFeaturesByAdcode = new Map(cityFeatures.map((feature) => [feature.properties.adcode, feature]));
const featuresByProvinceAdcode = new Map<number, CityFeature[]>();

cityFeatures.forEach((feature) => {
  const provinceAdcode = feature.properties.provinceAdcode ?? feature.properties.parent?.adcode;
  if (!provinceAdcode) return;
  featuresByProvinceAdcode.set(provinceAdcode, [
    ...(featuresByProvinceAdcode.get(provinceAdcode) ?? []),
    feature,
  ]);
});

const normalizeName = (name: string) =>
  name
    .replace(/[·•\s]/g, "")
    .replace(/臺/g, "台")
    .replace(/(特别行政区|回族自治区|维吾尔自治区|壮族自治区|自治区|省|市|地区|盟|自治州|县|区)$/g, "");

const cityFeatureKey = (provinceAdcode: number, name: string) => `${provinceAdcode}:${normalizeName(name)}`;
const cityFeatureByName = new Map<string, CityFeature>();

cityFeatures.forEach((feature) => {
  const provinceAdcode = feature.properties.provinceAdcode ?? feature.properties.parent?.adcode;
  if (!provinceAdcode) return;
  cityFeatureByName.set(cityFeatureKey(provinceAdcode, feature.properties.name), feature);
});

function featureCollectionForProvince(provinceId: string) {
  const province = provinceById.get(provinceId);
  if (!province) return null;

  const provinceFeature = featureOfProvince(provinceId);
  const districtFeatures = featuresByProvinceAdcode.get(province.adcode) ?? [];
  const features = districtFeatures.length > 0 ? districtFeatures : provinceFeature ? [provinceFeature] : [];
  if (features.length === 0) return null;

  return {
    type: "FeatureCollection" as const,
    features,
  };
}

export function cityRegionOf(city: City): CityRegion | null {
  if (wholeProvinceCityIds.has(city.id)) {
    const feature = featureCollectionForProvince(city.provinceId) ?? featureOfProvince(city.provinceId);
    return feature ? { city, feature, wholeProvince: true } : null;
  }

  const adcodeMatch = /^city-(\d+)$/.exec(city.id);
  if (adcodeMatch) {
    const feature = cityFeaturesByAdcode.get(Number(adcodeMatch[1]));
    return feature ? { city, feature, wholeProvince: false } : null;
  }

  const province = provinceById.get(city.provinceId);
  if (!province) return null;

  const feature = cityFeatureByName.get(cityFeatureKey(province.adcode, city.name));
  return feature ? { city, feature, wholeProvince: false } : null;
}

export function cityRegionsOfProvince(provinceId: string): CityRegion[] {
  return cities.filter((city) => city.provinceId === provinceId).map(cityRegionOf).filter(Boolean) as CityRegion[];
}

export function cityRegionPath(region: CityRegion, projection: GeoProjection) {
  return makePath(projection)(region.feature as never) ?? "";
}

export function unmatchedCityRegions() {
  return cities.filter((city) => !cityRegionOf(city));
}

export const explicitWholeRegionCityIds = new Set([...wholeProvinceCityIds, ...taiwanFallbackCityIds]);
