"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Archive,
  BookOpen,
  CalendarDays,
  Heart,
  Map as MapIcon,
  MessageCircle,
  MoreHorizontal,
  Star,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";

const githubUrl = "https://github.com/qq570850096/our-memories";

export type MemoryNavKey = "map" | "memories" | "favorites" | "anniversaries" | "capsule" | "whispers";

const navItems = [
  { key: "map", label: "地图", icon: MapIcon, href: "/map" },
  { key: "memories", label: "回忆记录", icon: BookOpen, href: "/memories" },
  { key: "anniversaries", label: "纪念日", icon: CalendarDays, href: "/anniversaries" },
  { key: "favorites", label: "地点收藏", icon: Heart, href: "/favorites" },
  { key: "whispers", label: "悄悄话", icon: MessageCircle, href: "/whispers" },
  { key: "capsule", label: "时光宝盒", icon: Archive, href: "/time-capsule" },
] satisfies Array<{
  key: MemoryNavKey;
  label: string;
  icon: typeof MapIcon;
  href: string;
}>;

export function MemorySidebar({ active }: Readonly<{ active: MemoryNavKey }>) {
  return (
    <aside className="hidden min-h-screen w-[260px] shrink-0 border-r border-dim/78 bg-cream/78 px-5 py-8 shadow-[12px_0_34px_rgba(90,102,112,0.04)] backdrop-blur lg:block">
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center">
          <Heart className="h-10 w-10 fill-sakura text-bloom" />
        </div>
        <p className="mt-2 text-lg font-semibold text-ink">我们的回忆</p>
        <p className="mt-1 text-xs text-ink/52">只属于两个人的回忆</p>
      </div>

      <nav className="mt-10 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const selected = item.key === active;

          return (
            <Link
              key={item.key}
              className={`flex w-full items-center gap-3 rounded-[8px] border px-4 py-3 text-sm font-medium transition ${
                selected
                  ? "border-sakura bg-sakura/52 text-bloom"
                  : "border-transparent text-ink/72 hover:border-dim hover:bg-cream"
              }`}
              href={item.href}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-10 rounded-[8px] border border-dim/72 bg-cream/72 p-4 text-sm leading-7 text-ink/62 shadow-[0_12px_26px_rgba(90,102,112,0.05)]">
        在线优先版本会把回忆、照片和 AI 草稿保存到你的后端空间。
        <Heart className="ml-1 inline h-3.5 w-3.5 fill-sakura text-bloom" />
      </div>

      <div className="mt-4 rounded-[8px] border border-dim/72 bg-cream/72 p-4 shadow-[0_12px_26px_rgba(90,102,112,0.05)]">
        <div className="flex items-center gap-2">
          <Heart className="h-3.5 w-3.5 fill-sakura text-bloom" />
          <p className="text-xs font-semibold text-ink">关于这份地图</p>
        </div>
        <p className="mt-2 text-xs leading-6 text-ink/60">
          一期为私密双人空间，后续可用开通码扩展给其它情侣。
        </p>

        <div className="mt-3 border-t border-dim/54 pt-3">
          <p className="text-[11px] font-semibold text-ink/48">开源项目</p>
          <a
            className="mt-1.5 flex items-center justify-center gap-1.5 rounded-[7px] border border-sakura bg-sakura/40 px-3 py-2 text-xs font-semibold text-bloom transition hover:bg-sakura/70"
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Star className="h-3.5 w-3.5" />
            GitHub
          </a>
          <p className="mt-1.5 select-text text-[11px] leading-5 text-ink/55">
            github.com/qq570850096/our-memories
          </p>
        </div>
      </div>
    </aside>
  );
}

export function MemoryPageShell({
  active,
  children,
}: Readonly<{
  active: MemoryNavKey;
  children: ReactNode;
}>) {
  const navRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    // 滚动到选中的导航项
    if (navRef.current) {
      const selectedItem = navRef.current.querySelector('[data-selected="true"]');
      if (selectedItem) {
        selectedItem.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [active]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-cream text-ink">
      <div className="map-mist-band" aria-hidden="true" />
      <span className="absolute left-[38%] top-[9%] h-2 w-2 bg-sakura" aria-hidden="true" />
      <span className="absolute right-[17%] top-[15%] h-2 w-2 bg-mist" aria-hidden="true" />
      <div className="relative z-10 flex min-h-screen">
        <MemorySidebar active={active} />
        <section className="memory-page-content min-w-0 flex-1 px-4 pb-20 pt-4 sm:px-10 sm:py-8 lg:pb-8">
          <PageTransition>
            {children}
          </PageTransition>
        </section>
      </div>

      {/* 底部导航固定在底部（仅移动端） */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-dim/78 bg-cream/95 backdrop-blur-lg lg:hidden">
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {navItems
            .filter((item) => ["map", "memories", "anniversaries", "whispers"].includes(item.key))
            .map((item) => {
              const Icon = item.icon;
              const selected = item.key === active;

              return (
                <Link
                  key={item.key}
                  className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 transition ${
                    selected
                      ? "bg-sakura text-rose-ink"
                      : "text-ink/54 hover:bg-white/58"
                  }`}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[11px] font-semibold">{item.label}</span>
                </Link>
              );
            })}

          {/* 更多按钮 */}
          <button
            className="flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-ink/54 transition hover:bg-white/58"
            onClick={() => setMoreOpen(!moreOpen)}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[11px] font-semibold">更多</span>
          </button>
        </div>

        {/* 更多菜单弹出层 */}
        {moreOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMoreOpen(false)}
            />
            <div className="absolute bottom-full left-3 right-3 mb-2 grid grid-cols-3 gap-2 rounded-[8px] border border-dim/85 bg-cream/95 p-2 shadow-[0_18px_44px_rgba(90,102,112,0.14)] backdrop-blur-xl">
              {navItems
                .filter((item) => ["favorites", "capsule"].includes(item.key))
                .map((item) => {
                  const Icon = item.icon;
                  const selected = item.key === active;

                  return (
                    <Link
                      key={item.key}
                      className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 transition ${
                        selected
                          ? "bg-sakura text-rose-ink"
                          : "text-ink/64 hover:bg-white/60"
                      }`}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs font-semibold">{item.label}</span>
                    </Link>
                  );
                })}
            </div>
          </>
        )}
      </nav>
    </main>
  );
}

export function MapPageShell({ children }: Readonly<{ children: ReactNode }>) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {children}

      {/* 底部导航固定在底部（仅移动端） */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-dim/78 bg-cream/95 backdrop-blur-lg lg:hidden">
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {navItems
            .filter((item) => ["map", "memories", "anniversaries", "whispers"].includes(item.key))
            .map((item) => {
              const Icon = item.icon;
              const selected = item.key === "map";

              return (
                <Link
                  key={item.key}
                  className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 transition ${
                    selected
                      ? "bg-sakura text-rose-ink"
                      : "text-ink/54 hover:bg-white/58"
                  }`}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[11px] font-semibold">{item.label}</span>
                </Link>
              );
            })}

          {/* 更多按钮 */}
          <button
            className="flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-ink/54 transition hover:bg-white/58"
            onClick={() => setMoreOpen(!moreOpen)}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[11px] font-semibold">更多</span>
          </button>
        </div>

        {/* 更多菜单弹出层 */}
        {moreOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMoreOpen(false)}
            />
            <div className="absolute bottom-full left-3 right-3 mb-2 grid grid-cols-3 gap-2 rounded-[8px] border border-dim/85 bg-cream/95 p-2 shadow-[0_18px_44px_rgba(90,102,112,0.14)] backdrop-blur-xl">
              {navItems
                .filter((item) => ["favorites", "capsule"].includes(item.key))
                .map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.key}
                      className="flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-ink/64 transition hover:bg-white/60"
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs font-semibold">{item.label}</span>
                    </Link>
                  );
                })}
            </div>
          </>
        )}
      </nav>
    </>
  );
}
