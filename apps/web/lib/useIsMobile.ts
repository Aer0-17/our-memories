"use client";

import { useSyncExternalStore } from "react";

// 与 Tailwind lg 断点对齐（< 1024px 视为移动端）。
const QUERY = "(max-width: 1023px)";

const subscribe = (callback: () => void) => {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
};

const getSnapshot = () => window.matchMedia(QUERY).matches;

// SSR / 静态导出快照返回 false（按桌面渲染），水合后立刻校正。
// 仅用于「点击后才出现」的交互分支（卡片 vs sheet）；静态可见性差异一律用 CSS 类 hidden lg:block 实现，
// 从源头规避水合不匹配。
export const useIsMobile = () =>
  useSyncExternalStore(subscribe, getSnapshot, () => false);
