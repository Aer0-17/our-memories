"use client";

import { useMemo } from "react";
import { readAdminMode } from "@/data/adminMode";
import { readSession, type StoredSession } from "@/lib/authStore";
import { useAuth } from "@/lib/authContext";
import type { Memory } from "@/data/memories";

export const readContentEditAccess = () => Boolean(readSession()) || readAdminMode();

export function useContentEditAccess() {
  return useAuth().canEditContent;
}

export interface MemoryEditAccess {
  canEdit: boolean;
  canEditAll: boolean;
  canAddNote: boolean;
  isCreator: boolean;
}

export function useMemoryEditAccess(memory?: Pick<Memory, "createdById"> | null): MemoryEditAccess {
  const { session, canEditContent } = useAuth();

  return useMemo(
    () => computeMemoryEditAccessForSession(session, memory, canEditContent),
    [canEditContent, memory, session],
  );
}

export function computeMemoryEditAccessForSession(
  session: StoredSession | null,
  memory?: Pick<Memory, "createdById"> | null,
  canEditContent = Boolean(session) || readAdminMode(),
): MemoryEditAccess {
  if (!canEditContent || !memory) {
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

/**
 * 纯函数版编辑权限判定，复用与 useMemoryEditAccess 完全一致的逻辑。
 * 用于无法使用 hook 的场景（如在列表 map 内按每条 record 判断作者）。
 * 与 hook 的差异：无响应式更新，仅在调用时读取一次 session。
 */
export function computeMemoryEditAccess(memory?: Pick<Memory, "createdById"> | null): MemoryEditAccess {
  const session = readSession();
  return computeMemoryEditAccessForSession(session, memory);
}
