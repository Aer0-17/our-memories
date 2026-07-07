import { apiJson } from "@/lib/apiClient";

export type PublicUserConfig = {
  username: "me" | "ta";
  displayName: string;
};

export type PublicRuntimeConfig = {
  spaceCode: string;
  spaceName: string;
  anniversaryDate?: string;
  anniversaryLabel?: string;
  users: PublicUserConfig[];
};

export const defaultPublicConfig: PublicRuntimeConfig = {
  spaceCode: "our-space-2026",
  spaceName: "回忆地图",
  users: [
    { username: "me", displayName: "我" },
    { username: "ta", displayName: "TA" },
  ],
};

const cleanString = (value: unknown, fallback: string) => {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
};

export const normalizePublicConfig = (value: unknown): PublicRuntimeConfig => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return defaultPublicConfig;
  const payload = value as Partial<PublicRuntimeConfig>;
  const users = Array.isArray(payload.users) ? payload.users : [];

  return {
    spaceCode: cleanString(payload.spaceCode, defaultPublicConfig.spaceCode),
    spaceName: cleanString(payload.spaceName, defaultPublicConfig.spaceName),
    anniversaryDate: typeof payload.anniversaryDate === "string" ? payload.anniversaryDate : undefined,
    anniversaryLabel: typeof payload.anniversaryLabel === "string" ? payload.anniversaryLabel : undefined,
    users: defaultPublicConfig.users.map((fallbackUser) => {
      const user = users.find((item) => item?.username === fallbackUser.username);
      return {
        username: fallbackUser.username,
        displayName: cleanString(user?.displayName, fallbackUser.displayName),
      };
    }),
  };
};

export const fetchPublicConfig = async () => {
  const data = await apiJson<unknown>("/api/v1/public/config", {
    auth: false,
    cache: "no-store",
  });
  return normalizePublicConfig(data);
};

export const publicUserLabel = (config: PublicRuntimeConfig, username: "me" | "ta") => {
  return config.users.find((user) => user.username === username)?.displayName ?? username;
};
