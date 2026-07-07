import { apiFetch, apiJson } from "@/lib/apiClient";

export const futureCheckinsStorageKey = "mapofus:future-checkins";
export const futureCheckinsApiKey = "/api/v1/auxiliary-items?kind=future-checkin";
export const futureCheckinsMigrationKey = "mapofus:future-checkins:migrated-to-server-v1";
export const futureCheckinKind = "future-checkin";

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

export type FutureCheckinPayload = {
  items?: ServerFutureCheckinItem[];
};

type ServerFutureCheckinItem = {
  id: string;
  title?: string;
  date?: string;
  note?: string;
  cityId?: string;
  createdAt?: string;
};

type ServerFutureCheckinNote = {
  provinceId?: string;
  provinceName?: string;
  cityName?: string;
  regionId?: string;
  regionName?: string;
  lng?: number;
  lat?: number;
  mascotVariant?: number;
};

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

const parseServerNote = (note: unknown): ServerFutureCheckinNote | null => {
  if (typeof note !== "string" || !note.trim()) return null;

  try {
    const parsed = JSON.parse(note) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as ServerFutureCheckinNote;
  } catch {
    return null;
  }
};

const labelParts = (title: string | undefined) =>
  cleanString(title, 140)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

export const serverFutureCheckinToCheckin = (item: ServerFutureCheckinItem): FutureCheckin | null => {
  const note = parseServerNote(item.note);
  const lng = cleanCoordinate(note?.lng);
  const lat = cleanCoordinate(note?.lat);
  if (!note || lng === null || lat === null) return null;

  const cityId = cleanString(item.cityId, 40);
  const labels = labelParts(item.title);
  const provinceId = cleanString(note.provinceId, 40);
  const regionId = cleanString(note.regionId, 80);
  if (!provinceId || !cityId || !regionId) return null;

  return normalizeCheckin({
    id: item.id,
    provinceId,
    provinceName: cleanString(note.provinceName, 40) || labels[0] || provinceId,
    cityId,
    cityName: cleanString(note.cityName, 40) || labels[1] || cityId,
    regionId,
    regionName: cleanString(note.regionName, 60) || labels.slice(2).join(" ") || "全市",
    lng,
    lat,
    mascotVariant: normalizeMascotVariant(note.mascotVariant),
    createdAt: cleanString(item.createdAt, 40) || new Date().toISOString(),
  });
};

export const serverFutureCheckinsToCheckins = (items: ServerFutureCheckinItem[] = []) =>
  items.map(serverFutureCheckinToCheckin).filter(Boolean) as FutureCheckin[];

export const writeFutureCheckins = (checkins: FutureCheckin[]) => {
  if (typeof window === "undefined") return;
  const normalized = checkins.map(normalizeCheckin).filter(Boolean) as FutureCheckin[];
  window.localStorage.setItem(futureCheckinsStorageKey, JSON.stringify(normalized));
};

const futureCheckinRequestBody = (checkin: FutureCheckin) => ({
  kind: futureCheckinKind,
  title: futureCheckinLabel(checkin),
  cityId: checkin.cityId,
  note: JSON.stringify({
    provinceId: checkin.provinceId,
    provinceName: checkin.provinceName,
    cityName: checkin.cityName,
    regionId: checkin.regionId,
    regionName: checkin.regionName,
    lng: checkin.lng,
    lat: checkin.lat,
    mascotVariant: checkin.mascotVariant,
  } satisfies ServerFutureCheckinNote),
});

export const createServerFutureCheckin = async (checkin: FutureCheckin) => {
  const response = await apiJson<{ id: string }>("/api/v1/auxiliary-items", {
    method: "POST",
    body: JSON.stringify(futureCheckinRequestBody(checkin)),
  });

  return {
    ...checkin,
    id: response.id || checkin.id,
  };
};

export const deleteServerFutureCheckin = async (id: string) => {
  const response = await apiFetch(`/api/v1/auxiliary-items/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Delete future check-in failed");
};

const futureCheckinFingerprint = (checkin: FutureCheckin) =>
  `${checkin.provinceId}|${checkin.cityId}|${checkin.regionId}`;

export const uniqueFutureCheckins = (checkins: FutureCheckin[]) => {
  const seen = new Set<string>();
  const unique: FutureCheckin[] = [];
  for (const checkin of checkins) {
    const fingerprint = futureCheckinFingerprint(checkin);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    unique.push(checkin);
  }
  return unique;
};

export const localFutureCheckinsToMigrate = (serverCheckins: FutureCheckin[]) => {
  if (typeof window === "undefined") return [];
  if (window.localStorage.getItem(futureCheckinsMigrationKey) === "1") return [];

  const localCheckins = readFutureCheckins();
  if (localCheckins.length === 0) {
    window.localStorage.setItem(futureCheckinsMigrationKey, "1");
    return [];
  }

  const existing = new Set(serverCheckins.map(futureCheckinFingerprint));
  return localCheckins.filter((checkin) => !existing.has(futureCheckinFingerprint(checkin)));
};

export const migrateLocalFutureCheckins = async (checkins: FutureCheckin[]) => {
  if (typeof window === "undefined" || checkins.length === 0) return [];
  const results = await Promise.all(checkins.map((checkin) => createServerFutureCheckin(checkin).catch(() => null)));
  const migrated = results.filter(Boolean) as FutureCheckin[];
  if (migrated.length === checkins.length) {
    window.localStorage.setItem(futureCheckinsMigrationKey, "1");
  }
  return migrated;
};

export const createFutureCheckin = (input: FutureCheckinInput): FutureCheckin => ({
  ...input,
  id: `${input.provinceId}-${input.cityId}-${input.regionId}-${Date.now().toString(36)}`,
  mascotVariant: normalizeMascotVariant(input.mascotVariant),
  createdAt: new Date().toISOString(),
});

export const futureCheckinLabel = (checkin: FutureCheckin) =>
  `${checkin.provinceName} ${checkin.cityName} ${checkin.regionName}`;
