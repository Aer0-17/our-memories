"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronRight,
  Heart,
  MapPin,
  Star,
} from "lucide-react";
import { cities } from "@/data/cities";
import { MemoryPageShell } from "@/components/MemoryNav";
import {
  sortMemoriesByTime,
  type Memory,
} from "@/data/memories";
import type { LocalMemoryStore } from "@/data/progress";
import { apiFetch } from "@/lib/apiClient";
import { memoryPhotosPayload } from "@/lib/photoPayload";
import { useContentEditAccess } from "@/lib/useContentEditAccess";
import { useIsMobile } from "@/lib/useIsMobile";
import { useTransientStatus } from "@/lib/useTransientStatus";
import { publishMemoryStore, useMemoryStore } from "@/lib/memoryStore";
import { AddMemoryPanel } from "@/components/memories/AddMemoryPanel";
import {
  MemoryArchiveCard as MemoryCard,
  type MemoryArchiveItem,
} from "@/components/memories/MemoryArchiveCard";
import { MemoryCitySheet, type MemoryPatchPayload } from "@/components/memories/MemoryCitySheet";

type ArchiveView = "city" | "timeline";
type MemoryItem = MemoryArchiveItem;

const memoryMonthLabel = (memory: Memory) => {
  const match = /^(\d{4})\.(\d{2})\.\d{2}$/.exec(memory.date);
  if (!match) return "未标日期";

  return `${match[1]}年 ${Number(match[2])}月`;
};

export default function MemoryArchive() {
  const { data, mutate } = useMemoryStore();
  const [view, setView] = useState<ArchiveView>("city");
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());
  const canEdit = useContentEditAccess();
  const isMobile = useIsMobile();
  // 移动端原地展开的回忆详情（不跳转到地图页）。
  const [selectedItem, setSelectedItem] = useState<MemoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [archiveStatus, setArchiveStatus] = useTransientStatus();

  const localMemories = useMemo(() => data?.memories ?? {}, [data?.memories]);

  const handleDeleteMemory = async (cityId: string, memoryId: string) => {
    if (!canEdit) return;
    if (deletingId) return;
    setDeletingId(memoryId);
    try {
      const response = await apiFetch(`/memories/${memoryId}`, { method: "DELETE" });

      if (!response.ok) throw new Error("Failed to delete memory");

      const data = (await response.json()) as { memories: LocalMemoryStore };
      mutate({ memories: data.memories }, { revalidate: false });
      publishMemoryStore(data.memories);
      setSelectedItem((current) => (current?.memory.id === memoryId ? null : current));
      setArchiveStatus("回忆已删除。", { autoClear: true });
    } catch {
      setArchiveStatus("删除失败，请稍后再试。", { autoClear: true });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveMemory = async (cityId: string, memory: Memory) => {
    if (!canEdit) return;

    const response = await apiFetch("/api/v1/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...memory,
        photos: memoryPhotosPayload(memory.photos ?? [memory.image]),
      }),
    });

    if (!response.ok) throw new Error("Failed to save memory");

    const data = (await response.json()) as { memory?: Memory; memories: LocalMemoryStore };
    mutate({ memories: data.memories }, { revalidate: false });
    publishMemoryStore(data.memories);
  };

  const handleUpdateMemory = async (cityId: string, memoryId: string, memory: MemoryPatchPayload) => {
    if (!canEdit) return;

    const response = await apiFetch(`/memories/${memoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(memory),
    });

    if (!response.ok) throw new Error("Failed to update memory");

    const data = (await response.json()) as { memory?: Memory; memories: LocalMemoryStore };
    const nextMemories = data.memories;
    mutate({ memories: nextMemories }, { revalidate: false });
    publishMemoryStore(nextMemories);
    setSelectedItem((current) => {
      if (!current || current.memory.id !== memoryId) return current;
      const updatedMemory =
        (Object.values(nextMemories) as Memory[][])
          .flat()
          .find((candidate) => candidate.id === memoryId) ?? data.memory ?? current.memory;

      return { ...current, memory: updatedMemory };
    });
  };

  const handleSetMemoryCover = async (cityId: string, memoryId: string, coverImage: string) => {
    if (!canEdit) return;

    const response = await apiFetch(`/memories/${memoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverImage }),
    });

    if (!response.ok) throw new Error("Failed to update memory cover");

    const data = (await response.json()) as { memory?: Memory; memories: LocalMemoryStore };
    const nextMemories = data.memories;
    mutate({ memories: nextMemories }, { revalidate: false });
    publishMemoryStore(nextMemories);
    setSelectedItem((current) => {
      if (!current || current.memory.id !== memoryId) return current;
      const updatedMemory =
        (Object.values(nextMemories) as Memory[][])
          .flat()
          .find((candidate) => candidate.id === memoryId) ?? data.memory ?? {
          ...current.memory,
          image: coverImage,
        };

      return { ...current, memory: updatedMemory };
    });
  };

  const memoryItems = useMemo<MemoryItem[]>(() => {
    const localItems = Object.values(localMemories).flat();
    const byId = new Map<string, Memory>();

    localItems.forEach((memory) => {
      if (!memory.draft) byId.set(memory.id, memory);
    });

    return sortMemoriesByTime([...byId.values()]).map((memory) => ({
      memory,
      city: cities.find((city) => city.id === memory.cityId),
    }));
  }, [localMemories]);

  const cityGroups = useMemo(() => {
    const groups = new Map<string, MemoryItem[]>();

    memoryItems.forEach((item) => {
      const key = item.memory.cityId;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });

    return [...groups.entries()].map(([cityId, items]) => ({
      cityId,
      cityName: items[0]?.memory.city ?? cityId,
      memories: items,
    }));
  }, [memoryItems]);

  const timelineGroups = useMemo(() => {
    const groups = new Map<string, MemoryItem[]>();

    memoryItems.forEach((item) => {
      const label = memoryMonthLabel(item.memory);
      groups.set(label, [...(groups.get(label) ?? []), item]);
    });

    return [...groups.entries()].map(([label, items]) => ({ label, memories: items }));
  }, [memoryItems]);

  const cityCount = cityGroups.length;

  const toggleCity = (cityId: string) => {
    setExpandedCities((current) => {
      const next = new Set(current);
      if (next.has(cityId)) next.delete(cityId);
      else next.add(cityId);

      return next;
    });
  };

  return (
    <MemoryPageShell active="memories">
          <header className="flex flex-wrap items-start justify-between gap-4 sm:gap-5">
            <div>
              <div className="flex items-center gap-3">
                <Star className="h-6 w-6 fill-sakura text-bloom sm:h-8 sm:w-8" />
                <h1 className="text-2xl font-semibold leading-tight text-ink sm:text-[34px]">回忆记录</h1>
              </div>
              <p className="mt-2 hidden text-sm font-medium text-ink/58 sm:block">
                {view === "city" ? "按城市整理我们的足迹" : "按时间从新到旧排列"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-[8px] border border-dim/80 bg-cream/72 px-4 py-2 text-sm font-semibold text-ink/62 shadow-[0_8px_24px_rgba(90,102,112,0.08)] backdrop-blur">
                {memoryItems.length} 条 · {cityCount} 城
              </div>
              <div className="flex rounded-[8px] border border-dim/80 bg-cream/72 p-1 shadow-[0_8px_24px_rgba(90,102,112,0.08)] backdrop-blur">
                {(["city", "timeline"] as const).map((mode) => (
                  <button
                    key={mode}
                    className={`rounded-[7px] px-4 py-2 text-sm font-semibold transition ${
                      view === mode
                        ? "bg-sakura text-bloom"
                        : "text-ink/58 hover:bg-mist/32"
                    }`}
                    type="button"
                    onClick={() => setView(mode)}
                  >
                    {mode === "city" ? "城市" : "时间线"}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <AddMemoryPanel
            canEdit={canEdit}
            onSaved={(memories) => {
              mutate({ memories }, { revalidate: false });
              publishMemoryStore(memories);
            }}
          />

          {memoryItems.length === 0 ? (
            <div className="mt-6 grid min-h-[420px] place-items-center rounded-[8px] border border-dashed border-dim bg-cream/58 px-6 py-14 text-center shadow-[0_14px_34px_rgba(90,102,112,0.045)] backdrop-blur sm:mt-8">
              <div className="max-w-[430px]">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-[8px] border border-sakura bg-sakura/42">
                  <Heart className="h-8 w-8 fill-sakura text-bloom" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold text-ink">还没有回忆记录</h2>
                <p className="mt-3 text-sm leading-7 text-ink/60">
                  可以直接点上方“新增回忆”添加城市、日期、照片和一句话回忆。保存后这里会自动按城市和时间整理。
                </p>
                <Link
                  className="mt-6 inline-flex items-center gap-2 rounded-[8px] border border-sky bg-cream/78 px-5 py-3 text-sm font-semibold text-sky transition hover:bg-mist/34"
                  href="/map"
                >
                  <MapPin className="h-4 w-4" />
                  回到地图
                </Link>
              </div>
            </div>
          ) : view === "city" ? (
            <div className="mt-6 space-y-6 sm:mt-10 sm:space-y-9">
              {cityGroups.map((group) => {
                const expanded = expandedCities.has(group.cityId);
                const visibleMemories = expanded ? group.memories : group.memories.slice(0, 3);

                return (
                  <section key={group.cityId}>
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div className="flex items-baseline gap-3">
                        <MapPin className="h-5 w-5 fill-bloom text-bloom" />
                        <h2 className="text-2xl font-semibold text-ink">{group.cityName}</h2>
                        <span className="text-sm text-ink/48">
                          共 {group.memories.length} 条回忆
                        </span>
                      </div>
                      {group.memories.length > 3 && (
                        <button
                          className="flex items-center gap-1 text-sm font-semibold text-ink/58 transition hover:text-bloom"
                          type="button"
                          onClick={() => toggleCity(group.cityId)}
                        >
                          {expanded ? "收起" : "查看全部"}
                          <ChevronRight className={`h-4 w-4 transition ${expanded ? "rotate-90" : ""}`} />
                        </button>
                      )}
                    </div>
                    <div className="grid gap-4 xl:grid-cols-3">
                      {visibleMemories.map((item) => (
                        <MemoryCard
                          key={item.memory.id}
                          item={item}
                          compact
                          onDelete={canEdit ? (memoryId) => handleDeleteMemory(item.memory.cityId, memoryId) : undefined}
                          onOpen={isMobile ? setSelectedItem : undefined}
                          deleting={deletingId === item.memory.id}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="relative mt-6 space-y-6 pl-9 sm:mt-10 sm:space-y-8">
              <div className="absolute bottom-0 left-3 top-0 w-px bg-bloom/58" aria-hidden="true" />
              {timelineGroups.map((group) => (
                <section key={group.label} className="relative">
                  <span className="absolute -left-[34px] top-1 grid h-6 w-6 place-items-center rounded-full border border-sakura bg-cream">
                    <span className="h-2.5 w-2.5 rounded-full bg-bloom" />
                  </span>
                  <h2 className="mb-4 text-2xl font-semibold text-ink">{group.label}</h2>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {group.memories.map((item) => (
                      <MemoryCard
                        key={item.memory.id}
                        item={item}
                        onDelete={canEdit ? (memoryId) => handleDeleteMemory(item.memory.cityId, memoryId) : undefined}
                        onOpen={isMobile ? setSelectedItem : undefined}
                        deleting={deletingId === item.memory.id}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

      {selectedItem?.city && (
        <MemoryCitySheet
          open={selectedItem != null}
          onClose={() => setSelectedItem(null)}
          city={selectedItem.city}
          localMemories={localMemories[selectedItem.memory.cityId] ?? []}
          selectedMemoryId={selectedItem.memory.id}
          isLit={Boolean(localMemories[selectedItem.memory.cityId]?.length)}
          isAdmin={canEdit}
          onSave={handleSaveMemory}
          onUpdate={handleUpdateMemory}
          onDelete={handleDeleteMemory}
          onSetCover={handleSetMemoryCover}
        />
      )}

      {archiveStatus && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-[8px] border border-success/70 bg-mint/95 px-4 py-3 text-sm font-semibold text-success-ink shadow-[0_8px_24px_rgba(90,102,112,0.2)] backdrop-blur">
          {archiveStatus}
        </div>
      )}
    </MemoryPageShell>
  );
}
