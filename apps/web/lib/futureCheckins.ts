export const futureCheckinsStorageKey = "mapofus:future-checkins";
export const futureCheckinsUpdatedEvent = "mapofus:future-checkins-updated";

export const forestSpiritVariantCount = 16;

export type FutureCheckin = {
  id: string;
  provinceId: string;
  provinceName: string;
  cityId: string;
  cityName: string;
  regionId: string;
  regionName: string;
  lng: number;
  lat: number;
  mascotVariant: number;
  createdAt: string;
};

export type FutureCheckinInput = Omit<FutureCheckin, "id" | "createdAt">;

const cleanString = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

const cleanCoordinate = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(6));
};

const normalizeMascotVariant = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.abs(Math.round(value)) % forestSpiritVariantCount;
};

const normalizeCheckin = (value: unknown): FutureCheckin | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const item = value as Partial<FutureCheckin>;
  const lng = cleanCoordinate(item.lng);
  const lat = cleanCoordinate(item.lat);
  if (lng === null || lat === null) return null;

  const provinceId = cleanString(item.provinceId, 40);
  const cityId = cleanString(item.cityId, 40);
  const regionId = cleanString(item.regionId, 80);
  if (!provinceId || !cityId || !regionId) return null;

  return {
    id: cleanString(item.id, 80) || `${provinceId}-${cityId}-${regionId}`,
    provinceId,
    provinceName: cleanString(item.provinceName, 40) || provinceId,
    cityId,
    cityName: cleanString(item.cityName, 40) || cityId,
    regionId,
    regionName: cleanString(item.regionName, 60) || "全市",
    lng,
    lat,
    mascotVariant: normalizeMascotVariant(item.mascotVariant),
    createdAt: cleanString(item.createdAt, 40) || new Date().toISOString(),
  };
};

export const readFutureCheckins = (): FutureCheckin[] => {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(futureCheckinsStorageKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCheckin).filter(Boolean) as FutureCheckin[];
  } catch {
    return [];
  }
};

export const writeFutureCheckins = (checkins: FutureCheckin[]) => {
  if (typeof window === "undefined") return;
  const normalized = checkins.map(normalizeCheckin).filter(Boolean) as FutureCheckin[];
  window.localStorage.setItem(futureCheckinsStorageKey, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent<FutureCheckin[]>(futureCheckinsUpdatedEvent, { detail: normalized }));
};

export const createFutureCheckin = (input: FutureCheckinInput): FutureCheckin => ({
  ...input,
  id: `${input.provinceId}-${input.cityId}-${input.regionId}-${Date.now().toString(36)}`,
  mascotVariant: normalizeMascotVariant(input.mascotVariant),
  createdAt: new Date().toISOString(),
});

export const futureCheckinLabel = (checkin: FutureCheckin) =>
  `${checkin.provinceName} ${checkin.cityName} ${checkin.regionName}`;
