"use client";

import { useEffect, useState } from "react";
import { adminModeUpdatedEvent, readAdminMode } from "@/data/adminMode";
import { readSession } from "@/lib/authStore";
import type { Memory } from "@/data/memories";

export const readContentEditAccess = () => Boolean(readSession()) || readAdminMode();

export function useContentEditAccess() {
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    const update = () => setCanEdit(readContentEditAccess());
    const timer = window.setTimeout(update, 0);

    window.addEventListener(adminModeUpdatedEvent, update);
    window.addEventListener("storage", update);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(adminModeUpdatedEvent, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return canEdit;
}

export interface MemoryEditAccess {
  canEdit: boolean;
  canEditAll: boolean;
  canAddNote: boolean;
  isCreator: boolean;
}

export function useMemoryEditAccess(memory?: Pick<Memory, "createdById"> | null): MemoryEditAccess {
  const [access, setAccess] = useState<MemoryEditAccess>({
    canEdit: false,
    canEditAll: false,
    canAddNote: false,
    isCreator: false,
  });

  useEffect(() => {
    const update = () => setAccess(computeMemoryEditAccess(memory));

    const timer = window.setTimeout(update, 0);

    window.addEventListener(adminModeUpdatedEvent, update);
    window.addEventListener("storage", update);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(adminModeUpdatedEvent, update);
      window.removeEventListener("storage", update);
    };
  }, [memory]);

  return access;
}

/**
 * 纯函数版编辑权限判定，复用与 useMemoryEditAccess 完全一致的逻辑。
 * 用于无法使用 hook 的场景（如在列表 map 内按每条 record 判断作者）。
 * 与 hook 的差异：无响应式更新，仅在调用时读取一次 session。
 */
export function computeMemoryEditAccess(memory?: Pick<Memory, "createdById"> | null): MemoryEditAccess {
  const session = readSession();
  const isLoggedIn = Boolean(session) || readAdminMode();

  if (!isLoggedIn || !memory) {
    return { canEdit: false, canEditAll: false, canAddNote: false, isCreator: false };
  }

  const currentUserId = session?.user?.id;
  const isCreator = Boolean(currentUserId && memory.createdById && memory.createdById === currentUserId);

  return {
    canEdit: isCreator,
    canEditAll: isCreator,
    canAddNote: Boolean(currentUserId && memory.createdById && !isCreator),
    isCreator,
  };
}
