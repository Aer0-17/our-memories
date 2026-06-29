"use client";

import { useEffect } from "react";
import { registerCurrentDeviceForPush } from "@/lib/pushRegistration";
import { useAuth } from "@/lib/authContext";

export function PushRegistration() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.accessToken) return;
    registerCurrentDeviceForPush().catch(() => null);
  }, [session?.accessToken]);

  return null;
}
