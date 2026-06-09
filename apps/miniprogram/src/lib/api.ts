import Taro from "@tarojs/taro";
import type { AnniversaryCard, LocalMemoryStore } from "@map-of-us/shared";

declare const process: { env: { TARO_APP_API_BASE_URL?: string } };

const sessionKey = "our-memories:session";
const apiBaseUrl = process.env.TARO_APP_API_BASE_URL || "http://localhost:4002";

type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  data?: unknown;
  header?: Record<string, string>;
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string; displayName: string };
  space: { id: string; name: string; slug: string; plan: string; status: string };
  membership: { role: string };
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

async function request<T>(path: string, options: ApiOptions = {}, auth = true): Promise<T> {
  const token = auth ? readSession()?.accessToken : undefined;
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
    throw new Error(`API ${path} failed (${response.statusCode})`);
  }
  return response.data;
}

export async function login(input: { username: string; password: string; spaceSlug?: string }) {
  const session = await request<Session>("/auth/login", { method: "POST", data: input }, false);
  writeSession(session);
  return session;
}

export async function claimActivation(input: {
  code: string;
  spaceName: string;
  accounts: [
    { username: string; displayName?: string; password: string },
    { username: string; displayName?: string; password: string },
  ];
}) {
  return request<{ ok: true; space: { slug: string; name: string }; accounts: Array<{ username: string; role: string }> }>(
    "/activation-codes/claim",
    { method: "POST", data: input },
    false,
  );
}

export function getMemories() {
  return request<{ memories: LocalMemoryStore }>("/memories");
}

export function getAnniversaryCards() {
  return request<{ cards: AnniversaryCard[] }>("/anniversary-cards");
}

export async function bindWechat() {
  const loginResult = await Taro.login();
  if (!loginResult.code) throw new Error("Wechat login code unavailable");
  return request<{ ok: true }>("/auth/wechat/bind", { method: "POST", data: { code: loginResult.code } });
}
