import { apiJson } from "@/lib/apiClient";
import { readSession } from "@/lib/authStore";
import { normalizeDottedDate } from "@/lib/dateFormat";

export const appSettingsStorageKey = "mapofus:settings";
export const appSettingsUpdatedEvent = "mapofus:settings-updated";

export type AppSettings = {
  spaceSlug?: string;
  loginPhotos?: Record<string, string>;
  loginPhotoTexts?: Record<string, LoginPhotoText>;
  anniversaryDate?: string;
  anniversaryLabel?: string;
  weatherCityIds?: string[];
  coupleLogo?: string;
};

export type LoginPhotoText = {
  city?: string;
  label?: string;
};

export const defaultAnniversaryDate = "2026.03.20";
export const defaultAnniversaryLabel = "我们在一起";
export const defaultWeatherCityIds = ["beijing", "shanghai", "guangzhou"];
export const maxWeatherCities = 3;
export const defaultCoupleLogo = "/logo/couple-logo-placeholder.svg";

const isValidLogo = (value: unknown): value is string =>
  typeof value === "string" && (value.startsWith("data:image/") || value.startsWith("/") || value.startsWith("https://"));

const cleanString = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
};

export const normalizeAnniversaryDate = (value: unknown): string | undefined => {
  return normalizeDottedDate(value);
};

export const normalizeAppSettings = (value: unknown): AppSettings => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

  const settings = value as AppSettings;
  const loginPhotos =
    settings.loginPhotos && typeof settings.loginPhotos === "object" && !Array.isArray(settings.loginPhotos)
      ? Object.fromEntries(
          Object.entries(settings.loginPhotos).filter(([, photo]) => typeof photo === "string" && photo.length > 0),
        )
      : undefined;
  const loginPhotoTexts =
    settings.loginPhotoTexts && typeof settings.loginPhotoTexts === "object" && !Array.isArray(settings.loginPhotoTexts)
      ? Object.fromEntries(
          Object.entries(settings.loginPhotoTexts).map(([key, value]) => {
            if (typeof value !== "object" || value === null || Array.isArray(value)) return [key, {}];
            const item = value as LoginPhotoText;
            return [
              key,
              {
                city: cleanString(item.city, 40),
                label: cleanString(item.label, 60),
              },
            ];
          }),
        )
      : undefined;
  const anniversaryDate = normalizeAnniversaryDate(settings.anniversaryDate);
  const weatherCityIds = Array.isArray(settings.weatherCityIds)
    ? settings.weatherCityIds.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, maxWeatherCities)
    : undefined;

  return {
    spaceSlug: cleanString(settings.spaceSlug, 100),
    loginPhotos,
    loginPhotoTexts,
    anniversaryDate,
    anniversaryLabel: cleanString(settings.anniversaryLabel, 40),
    weatherCityIds: weatherCityIds && weatherCityIds.length > 0 ? weatherCityIds : undefined,
    coupleLogo: isValidLogo(settings.coupleLogo) ? settings.coupleLogo : undefined,
  };
};

export const readAppSettings = (): AppSettings => {
  if (typeof window === "undefined") return {};
  try {
    return normalizeAppSettings(JSON.parse(window.localStorage.getItem(appSettingsStorageKey) ?? "{}"));
  } catch {
    return {};
  }
};

const serverSettingKeys = [
  "spaceSlug",
  "loginPhotoTexts",
  "anniversaryDate",
  "anniversaryLabel",
  "weatherCityIds",
  "coupleLogo",
] as const satisfies ReadonlyArray<keyof AppSettings>;

const serverSettingEntries = (settings: AppSettings) =>
  serverSettingKeys.map((key) => [key, settings[key] ?? null] as const);

export const writeAppSettings = async (settings: AppSettings) => {
  const normalized = normalizeAppSettings(settings);
  window.localStorage.setItem(appSettingsStorageKey, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent<AppSettings>(appSettingsUpdatedEvent, { detail: normalized }));
  if (!readSession()) return;

  await Promise.all(
    serverSettingEntries(normalized).map(([key, value]) =>
      apiJson<{ ok: true }>(`/settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      }),
    ),
  );
};

const unwrapSettings = (value: unknown): AppSettings => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  if ("settings" in value) return normalizeAppSettings((value as { settings?: unknown }).settings);
  return normalizeAppSettings(value);
};

let syncSettingsPromise: Promise<AppSettings> | null = null;
let lastSyncAt = 0;
const settingsSyncDedupeMs = 30_000;

export const syncAppSettings = async () => {
  if (!readSession()) return readAppSettings();
  const now = Date.now();
  if (syncSettingsPromise) return syncSettingsPromise;
  if (now - lastSyncAt < settingsSyncDedupeMs) return readAppSettings();

  syncSettingsPromise = apiJson<unknown>("/api/v1/settings")
    .then((data) => {
      const normalized = unwrapSettings(data);
      window.localStorage.setItem(appSettingsStorageKey, JSON.stringify(normalized));
      window.dispatchEvent(new CustomEvent<AppSettings>(appSettingsUpdatedEvent, { detail: normalized }));
      lastSyncAt = Date.now();
      return normalized;
    })
    .finally(() => {
      syncSettingsPromise = null;
    });

  return syncSettingsPromise;
};
