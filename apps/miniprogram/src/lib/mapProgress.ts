// Which cities/provinces are "lit" (have at least one memory). Ported from the
// web app's data/progress.ts, minus the static `visited` seed cities the web
// build ships (the miniprogram lights up purely from real memories).

import { cities } from "../data/geo";

const cityProvinceById = new Map(cities.map((city) => [city.id, city.provinceId]));

export function getLitCityIds(cityIds: Iterable<string>): Set<string> {
  return new Set(cityIds);
}

export function getLitProvinceIds(litCityIds: Set<string>): Set<string> {
  const provinceIds = new Set<string>();
  litCityIds.forEach((cityId) => {
    const provinceId = cityProvinceById.get(cityId);
    if (provinceId) provinceIds.add(provinceId);
  });
  return provinceIds;
}
