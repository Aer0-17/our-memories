import Taro from "@tarojs/taro";
import type { LocalMemoryStore } from "@map-of-us/shared";
import type { VoiceDraft } from "./voice";
export { resolveAssetUrl } from "./assetUrl";

declare const process: { env: { TARO_APP_API_BASE_URL?: string } };

const sessionKey = "our-memories:session";
export const apiBaseUrl = process.env.TARO_APP_API_BASE_URL || "http://localhost:8080/api/v1";

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

export type LoginMember = {
  username: string;
  displayName: string;
};

type LoginPayload = Session & {
  users?: LoginMember[];
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
  authorDisplayName?: string;
  isMine?: boolean;
  content: string;
  voiceUrl?: string;
  createdAt: string;
};

export type Whisper = {
  id: string;
  title: string;
  createdById: string;
  creatorDisplayName?: string;
  creatorIsMine?: boolean;
  createdAt: string;
  updatedAt: string;
  messages?: WhisperReply[];
};

export type TimeCapsule = {
  id: string;
  title: string;
  openDate: string;
  content: string;
  voiceUrl?: string;
  openMode: "single" | "together";
  openedByUserIds?: string[];
  isOpened: boolean;
  revealedAt?: string;
  createdById: string;
  createdAt: string;
  photos?: Array<{ id: string; url: string; key?: string; mimeType?: string }>;
};

export type MemoryPhotoPayload = {
  url: string;
  key: string;
  mimeType: string;
  mediaType?: "image";
  width?: number;
  height?: number;
};

export type TimeCapsuleInput = {
  title: string;
  openDate: string;
  content: string;
  voiceUrl?: string;
  openMode: "single" | "together";
  photos: MemoryPhotoPayload[];
};

export type AnniversaryPhoto = {
  id: string;
  url: string;
  key?: string;
  mimeType?: string;
  sortOrder?: number;
};

export type AnniversaryCard = {
  id: string;
  title: string;
  date: string;
  note: string;
  voiceUrl?: string;
  bgmUrl?: string;
  bgmPreset?: string;
  repeatYearly: boolean;
  pinned: boolean;
  sortOrder?: number;
  createdById?: string;
  createdAt?: string;
  updatedAt?: string;
  photos?: AnniversaryPhoto[];
};

export type AnniversaryCardInput = {
  title: string;
  date: string;
  note: string;
  voiceUrl?: string;
  bgmUrl?: string;
  bgmPreset?: string;
  repeatYearly: boolean;
  pinned: boolean;
  photos: MemoryPhotoPayload[];
};

export type AnniversaryReplayPhoto = AnniversaryPhoto & {
  mediaType?: string;
  width?: number;
  height?: number;
};

export type AnniversaryReplayMemory = {
  id: string;
  title?: string;
  date: string;
  text: string;
  city: string;
  placeName?: string;
  mood?: string;
  tags?: string[];
  partnerNote?: string;
  voiceTextUrl?: string;
  partnerVoiceUrl?: string;
  photos?: AnniversaryReplayPhoto[];
};

export type AnniversaryReplay = {
  card: AnniversaryCard;
  memories: AnniversaryReplayMemory[];
};

export type MemoryInput = {
  cityId: string;
  city: string;
  cityEn: string;
  title: string;
  date: string;
  text: string;
  mood: string;
  tags: string[];
  visibility: "both" | "me" | "her";
  placeName: string;
  photos: MemoryPhotoPayload[];
};

export type MemoryPatch = Omit<MemoryInput, "cityId" | "city" | "cityEn">;

export type MemoryMutationResponse = {
  id?: string;
  ok?: boolean;
  memories: LocalMemoryStore;
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

function sessionFromLogin(payload: LoginPayload): Session {
  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: payload.user,
    space: payload.space,
  };
}

export async function verifyPassword(input: { spaceCode: string; password: string }) {
  const payload = await request<LoginPayload>("/auth/login", {
    method: "POST",
    data: { ...input, userId: "me" },
  }, false);
  const users = Array.isArray(payload.users)
    ? payload.users.filter(
        (user) =>
          user &&
          typeof user.username === "string" &&
          user.username.trim() &&
          typeof user.displayName === "string" &&
          user.displayName.trim(),
      )
    : [];
  if (users.length === 0) throw new Error("Authenticated member list is unavailable");
  return { users };
}

export async function login(input: { spaceCode: string; userId: string; password: string }) {
  const payload = await request<LoginPayload>("/auth/login", { method: "POST", data: input }, false);
  const session = sessionFromLogin(payload);
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

export function createMemory(input: MemoryInput) {
  return request<MemoryMutationResponse>("/memories", { method: "POST", data: input });
}

export function updateMemory(memoryId: string, input: MemoryPatch) {
  return request<MemoryMutationResponse>(`/memories/${encodeURIComponent(memoryId)}`, {
    method: "PATCH",
    data: input,
  });
}

export function deleteMemory(memoryId: string) {
  return request<MemoryMutationResponse>(`/memories/${encodeURIComponent(memoryId)}`, {
    method: "DELETE",
  });
}

function imageMimeType(filePath: string) {
  const normalized = filePath.toLowerCase().split("?")[0];
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function readFileAsBase64(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success: (result) => {
        if (typeof result.data === "string" && result.data) {
          resolve(result.data);
          return;
        }
        reject(new Error("Unable to read selected image"));
      },
      fail: reject,
    });
  });
}

export async function uploadMemoryImage(input: {
  filePath: string;
  width?: number;
  height?: number;
  folder?: "memories" | "time-capsules" | "anniversaries";
}): Promise<MemoryPhotoPayload> {
  let compressedPath = input.filePath;
  let width = input.width;
  let height = input.height;
  try {
    const maxEdge = 1600;
    const scale = width && height ? Math.min(1, maxEdge / Math.max(width, height)) : 1;
    const compressedWidth = width ? Math.max(1, Math.round(width * scale)) : undefined;
    const compressedHeight = height ? Math.max(1, Math.round(height * scale)) : undefined;
    const compressed = await Taro.compressImage({
      src: input.filePath,
      quality: 76,
      compressedWidth,
      compressedHeight,
    });
    if (compressed.tempFilePath) compressedPath = compressed.tempFilePath;
    width = compressedWidth || width;
    height = compressedHeight || height;
  } catch {
    // Some formats and already-compressed files cannot be compressed again.
  }

  const mimeType = imageMimeType(compressedPath);
  const data = await readFileAsBase64(compressedPath);
  const uploaded = await request<{ url: string; key: string }>("/upload", {
    method: "POST",
    data: {
      folder: input.folder || "memories",
      dataUrl: `data:${mimeType};base64,${data}`,
    },
  });

  return {
    url: uploaded.url,
    key: uploaded.key,
    mimeType,
    mediaType: "image",
    width,
    height,
  };
}

export async function deleteUploadedImages(keys: string[]) {
  return deleteUploadedMedia(keys);
}

export async function deleteUploadedMedia(keys: string[]) {
  await Promise.all(
    keys
      .filter(Boolean)
      .map((key) =>
        request<{ ok: true }>(`/upload?key=${encodeURIComponent(key)}`, { method: "DELETE" })
          .catch(() => undefined),
      ),
  );
}

export async function uploadVoiceAudio(
  draft: VoiceDraft,
  folder: "whispers" | "time-capsules" | "anniversaries",
) {
  if (draft.fileSize > 12 * 1024 * 1024) {
    throw new Error("语音太大，请控制在 60 秒内。");
  }
  const data = await readFileAsBase64(draft.filePath);
  const uploaded = await request<{ url: string; key: string }>("/upload", {
    method: "POST",
    data: {
      folder,
      dataUrl: `data:audio/mpeg;base64,${data}`,
    },
  });
  return { ...uploaded, durationMs: draft.durationMs, mimeType: "audio/mpeg" };
}

export async function getAnniversaryCards() {
  const data = await request<{ anniversaryCards: AnniversaryCard[] }>("/anniversary-cards");
  return { cards: data.anniversaryCards };
}

export function createAnniversaryCard(input: AnniversaryCardInput) {
  return request<{ id: string }>("/anniversary-cards", { method: "POST", data: input });
}

export function updateAnniversaryCard(cardId: string, input: AnniversaryCardInput) {
  return request<{ ok: true }>(`/anniversary-cards/${encodeURIComponent(cardId)}`, {
    method: "PATCH",
    data: input,
  });
}

export function deleteAnniversaryCard(cardId: string) {
  return request<{ ok: true }>(`/anniversary-cards/${encodeURIComponent(cardId)}`, {
    method: "DELETE",
  });
}

export function getAnniversaryReplay(cardId: string) {
  return request<AnniversaryReplay>(
    `/anniversary-cards/${encodeURIComponent(cardId)}/replay`,
  );
}

export function getWhispers() {
  return request<{ whispers: Whisper[] }>("/whispers");
}

export function createWhisper(input: { title: string; content?: string; voiceUrl?: string }) {
  return request<{ id: string }>("/whispers", {
    method: "POST",
    data: input,
  });
}

export function replyWhisper(whisperId: string, input: { content: string; voiceUrl?: string }) {
  return request<{ id: string }>(`/whispers/${encodeURIComponent(whisperId)}/reply`, {
    method: "POST",
    data: input,
  });
}

export function getTimeCapsules() {
  return request<{ timeCapsules: TimeCapsule[] }>("/time-capsules");
}

export function createTimeCapsule(input: TimeCapsuleInput) {
  return request<{ id: string }>("/time-capsules", { method: "POST", data: input });
}

export function updateTimeCapsule(capsuleId: string, input: TimeCapsuleInput) {
  return request<{ ok: true }>(`/time-capsules/${encodeURIComponent(capsuleId)}`, {
    method: "PATCH",
    data: input,
  });
}

export function openTimeCapsule(capsuleId: string) {
  return request<{ ok: true }>(`/time-capsules/${encodeURIComponent(capsuleId)}/open`, {
    method: "POST",
  });
}

export function deleteTimeCapsule(capsuleId: string) {
  return request<{ ok: true }>(`/time-capsules/${encodeURIComponent(capsuleId)}`, {
    method: "DELETE",
  });
}
