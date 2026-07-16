import Taro from "@tarojs/taro";
import type { AnniversaryCard, LocalMemoryStore } from "@map-of-us/shared";

declare const process: { env: { TARO_APP_API_BASE_URL?: string } };

const sessionKey = "our-memories:session";
const apiBaseUrl = process.env.TARO_APP_API_BASE_URL || "http://localhost:8080/api/v1";

type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  data?: unknown;
  header?: Record<string, string>;
};

class ApiError extends Error {
  constructor(readonly statusCode: number, path: string) {
    super(`API ${path} failed (${statusCode})`);
  }
}

export type Session = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string; displayName: string };
  space: { id: string; name: string; spaceCode: string };
};

export type PublicConfig = {
  spaceCode: string;
  spaceName: string;
  passcodeLength: number;
  users: Array<{ username: string; displayName: string }>;
};

export type WhisperReply = {
  id: string;
  whisperId: string;
  userId: string;
  content: string;
  voiceUrl?: string;
  createdAt: string;
};

export type Whisper = {
  id: string;
  title: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  messages?: WhisperReply[];
};

export type TimeCapsule = {
  id: string;
  title: string;
  openDate: string;
  content: string;
  openMode: string;
  isOpened: boolean;
  revealedAt?: string;
  createdAt: string;
  photos?: Array<{ id: string; url: string; key?: string }>;
};

export function readSession() {
  return Taro.getStorageSync<Session | "">(sessionKey) || null;
}

export function writeSession(session: Session) {
  Taro.setStorageSync(sessionKey, session);
}

export function clearSession() {
  Taro.removeStorageSync(sessionKey);
}

async function rawRequest<T>(path: string, options: ApiOptions = {}, token?: string): Promise<T> {
  const response = await Taro.request<T>({
    url: `${apiBaseUrl.replace(/\/$/, "")}${path}`,
    method: options.method || "GET",
    data: options.data,
    header: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.header,
    },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(response.statusCode, path);
  }
  return response.data;
}

async function refreshAccessToken() {
  const refreshToken = readSession()?.refreshToken;
  if (!refreshToken) return false;
  try {
    const data = await rawRequest<{ accessToken: string }>("/auth/refresh", {
      method: "POST",
      data: { refreshToken },
    });
    const session = readSession();
    if (!session || !data.accessToken) return false;
    writeSession({ ...session, accessToken: data.accessToken });
    return true;
  } catch {
    clearSession();
    return false;
  }
}

async function request<T>(path: string, options: ApiOptions = {}, auth = true, retry = true): Promise<T> {
  const session = auth ? readSession() : null;
  try {
    return await rawRequest<T>(path, options, session?.accessToken);
  } catch (error) {
    if (auth && retry && error instanceof ApiError && error.statusCode === 401 && await refreshAccessToken()) {
      return request<T>(path, options, true, false);
    }
    throw error;
  }
}

export function getPublicConfig() {
  return request<PublicConfig>("/public/config", {}, false);
}

export async function login(input: { spaceCode: string; userId: string; password: string }) {
  const session = await request<Session>("/auth/login", { method: "POST", data: input }, false);
  writeSession(session);
  return session;
}

export async function logout() {
  await request<{ ok: true }>("/auth/logout", { method: "POST" }, true).catch(() => undefined);
  clearSession();
}

export function getMemories() {
  return request<{ memories: LocalMemoryStore }>("/memories");
}

export async function getAnniversaryCards() {
  const data = await request<{ anniversaryCards: AnniversaryCard[] }>("/anniversary-cards");
  return { cards: data.anniversaryCards };
}

export function getWhispers() {
  return request<{ whispers: Whisper[] }>("/whispers");
}

export function getTimeCapsules() {
  return request<{ timeCapsules: TimeCapsule[] }>("/time-capsules");
}
