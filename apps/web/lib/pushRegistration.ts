"use client";

import { apiJson } from "@/lib/apiClient";

type PermissionResult = {
  receive?: string;
};

type RegistrationResult = {
  registrationId?: string;
};

type JPushPlugin = {
  requestPermissions: () => Promise<PermissionResult>;
  getRegistrationId: () => Promise<RegistrationResult>;
};

type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  Plugins?: {
    JPush?: JPushPlugin;
  };
};

const registrationStorageKey = "mapofus:jpush-registration-id";

function capacitorRuntime() {
  return (window as Window & { Capacitor?: CapacitorRuntime }).Capacitor;
}

function isNativeCapacitor() {
  return typeof window !== "undefined" && capacitorRuntime()?.isNativePlatform?.() === true;
}

function jpushPlugin() {
  return capacitorRuntime()?.Plugins?.JPush;
}

async function waitForRegistrationId() {
  const JPush = jpushPlugin();
  if (!JPush) return "";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { registrationId } = await JPush.getRegistrationId();
    if (registrationId) return registrationId;
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }
  return "";
}

export async function registerCurrentDeviceForPush() {
  if (!isNativeCapacitor()) return;

  const JPush = jpushPlugin();
  if (!JPush) return;

  const permission = await JPush.requestPermissions().catch(() => null);
  if (permission?.receive !== "granted") return;

  const registrationId = await waitForRegistrationId();
  if (!registrationId) return;

  const lastRegistrationId = window.localStorage.getItem(registrationStorageKey);
  if (lastRegistrationId === registrationId) return;

  await apiJson("/api/v1/push/devices", {
    method: "POST",
    body: JSON.stringify({
      platform: "android",
      registrationId,
      deviceModel: window.navigator.userAgent,
    }),
  });

  window.localStorage.setItem(registrationStorageKey, registrationId);
}
