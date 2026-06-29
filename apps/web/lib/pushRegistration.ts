"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
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

const JPush = registerPlugin<JPushPlugin>("JPush");
const registrationStorageKey = "mapofus:jpush-registration-id";

function isNativeCapacitor() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

async function waitForRegistrationId() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { registrationId } = await JPush.getRegistrationId();
    if (registrationId) return registrationId;
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  return "";
}

export async function registerCurrentDeviceForPush() {
  if (!isNativeCapacitor()) return;

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
