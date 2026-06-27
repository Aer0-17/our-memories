"use client";

import { useEffect } from "react";
import { memoryStoreUpdatedEvent, type LocalMemoryStore } from "@/data/progress";
import { memoryTime, sortMemoriesByTime, type Memory, type MemorySummaryStore } from "@/data/memories";
import { useApi } from "@/lib/swr";

export const memorySummaryApiKey = "/api/v1/memories/summary";

export type MemorySummaryResponse = {
  summary: MemorySummaryStore;
};

export function summaryFromMemoryStore(memories: LocalMemoryStore): MemorySummaryStore {
  const summary: MemorySummaryStore = {};

  Object.entries(memories).forEach(([cityId, items]) => {
    const visibleItems = items.filter((memory) => !memory.draft);
    if (visibleItems.length === 0) return;
    const sorted = sortMemoriesByTime(visibleItems);
    const latest = sorted[0];
    summary[cityId] = {
      cityId,
      city: latest.city,
      cityEn: latest.cityEn,
      count: visibleItems.length,
      coverImage: latest.image,
      latest,
      updatedAt: latest.updatedAt ?? latest.createdAt,
    };
  });

  return summary;
}

export function summaryToMemoryStore(summary: MemorySummaryStore): LocalMemoryStore {
  return Object.fromEntries(
    Object.values(summary).flatMap((item) => {
      if (!item.latest) return [];
      const latest: Memory = {
        ...item.latest,
        image: item.latest.image || item.coverImage || "",
        photos: item.latest.photos ?? (item.latest.image || item.coverImage ? [item.latest.image || item.coverImage || ""] : []),
      };
      return [[item.cityId, [latest]]];
    }),
  );
}

export function useMemorySummary() {
  const swr = useApi<MemorySummaryResponse>(memorySummaryApiKey);

  useEffect(() => {
    const handleMemoryUpdate = (event: Event) => {
      const detail = (event as CustomEvent<LocalMemoryStore>).detail;
      if (detail) void swr.mutate({ summary: summaryFromMemoryStore(detail) }, { revalidate: false });
    };

    window.addEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
    return () => window.removeEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
  }, [swr]);

  return swr;
}

export const latestMemoryFromSummary = (summary: MemorySummaryStore) =>
  Object.values(summary)
    .flatMap((item) => (item.latest ? [item.latest] : []))
    .sort((a, b) => memoryTime(b) - memoryTime(a));
