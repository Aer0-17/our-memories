"use client";

import { useCallback, useEffect } from "react";
import { useSWRConfig } from "swr";
import { memoryStoreUpdatedEvent, type LocalMemoryStore } from "@/data/progress";
import { memorySummaryApiKey, summaryFromMemoryStore } from "@/lib/memorySummaryStore";
import { useApi } from "@/lib/swr";

export const memoriesApiKey = "/api/v1/memories";
export const cityMemoriesApiKey = (cityId: string) => `/api/v1/memories/cities/${encodeURIComponent(cityId)}`;

export type MemoriesResponse = {
  memories: LocalMemoryStore;
};

export function publishMemoryStore(memories: LocalMemoryStore) {
  window.dispatchEvent(new CustomEvent(memoryStoreUpdatedEvent, { detail: memories }));
}

export function useMemoryCachePublisher() {
  const { mutate } = useSWRConfig();

  return useCallback(
    (memories: LocalMemoryStore, changedCityId?: string) => {
      void mutate(memoriesApiKey, { memories } satisfies MemoriesResponse, { revalidate: false });
      void mutate(
        memorySummaryApiKey,
        { summary: summaryFromMemoryStore(memories) },
        { revalidate: false },
      );

      const cityIds = changedCityId ? [changedCityId] : Object.keys(memories);
      cityIds.forEach((cityId) => {
        void mutate(
          cityMemoriesApiKey(cityId),
          { memories: { [cityId]: memories[cityId] ?? [] } } satisfies MemoriesResponse,
          { revalidate: false },
        );
      });

      publishMemoryStore(memories);
    },
    [mutate],
  );
}

export function useMemoryStore() {
  const swr = useApi<MemoriesResponse>(memoriesApiKey);

  useEffect(() => {
    const handleMemoryUpdate = (event: Event) => {
      const detail = (event as CustomEvent<LocalMemoryStore>).detail;
      if (detail) void swr.mutate({ memories: detail }, { revalidate: false });
    };

    window.addEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
    return () => window.removeEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
  }, [swr]);

  return swr;
}
