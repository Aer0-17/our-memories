"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LocalMemoryStore } from "@/data/progress";
import type { Memory } from "@/data/memories";
import { apiFetch, apiJson } from "@/lib/apiClient";
import {
  createMemory,
  deleteMemory,
  setMemoryCover,
  updateMemory,
  type MemoryPatchPayload,
  type MemoryPhotoPayload,
} from "@/lib/memoryApi";
import { cityMemoriesApiKey, useMemoryCachePublisher, type MemoriesResponse } from "@/lib/memoryStore";
import { summaryToMemoryStore, useMemorySummary } from "@/lib/memorySummaryStore";
import { useApi } from "@/lib/swr";
import { loadCityRegionsOfProvince, type CityRegion } from "@/lib/cityGeo";
import { EMPTY_CITY_ASSETS, revokeObjectUrl, type CityAssetStore } from "./shared";

type UseProvinceMapDataOptions = {
  provinceId: string;
  isAdmin: boolean;
};

export function useProvinceMapData({ provinceId, isAdmin }: UseProvinceMapDataOptions) {
  const localMemoriesRef = useRef<LocalMemoryStore>({});
  const cityMemoryStoreRef = useRef<LocalMemoryStore>({});
  const { data: summaryData, mutate: mutateSummary } = useMemorySummary();
  const publishMemoryMutation = useMemoryCachePublisher();
  const [cityMemoryStore, setCityMemoryStore] = useState<LocalMemoryStore>({});
  const [cityRegionState, setCityRegionState] = useState<{ provinceId: string; regions: CityRegion[] }>({
    provinceId: "",
    regions: [],
  });
  const { data: cityAssetData, mutate: mutateCityAssets } = useApi<{ assets?: CityAssetStore }>(
    "/api/v1/city-assets",
  );

  const cityAssets = cityAssetData?.assets ?? EMPTY_CITY_ASSETS;
  const summaryMemories = useMemo(
    () => summaryToMemoryStore(summaryData?.summary ?? {}),
    [summaryData?.summary],
  );
  const localMemories = useMemo(
    () => ({ ...summaryMemories, ...cityMemoryStore }),
    [cityMemoryStore, summaryMemories],
  );
  const cityRegions = useMemo(
    () => (cityRegionState.provinceId === provinceId ? cityRegionState.regions : []),
    [cityRegionState.provinceId, cityRegionState.regions, provinceId],
  );

  useEffect(() => {
    localMemoriesRef.current = localMemories;
  }, [localMemories]);

  useEffect(() => {
    const controller = new AbortController();

    void loadCityRegionsOfProvince(provinceId, controller.signal)
      .then((regions) => setCityRegionState({ provinceId, regions }))
      .catch(() => {
        if (!controller.signal.aborted) setCityRegionState({ provinceId, regions: [] });
      });

    return () => controller.abort();
  }, [provinceId]);

  useEffect(() => {
    return () => {
      Object.values(localMemoriesRef.current).forEach((memories) => {
        memories.forEach((memory) => revokeObjectUrl(memory.image));
      });
    };
  }, []);

  const loadCityMemories = useCallback(async (cityId: string, force = false) => {
    if (!force && cityId in localMemoriesRef.current && cityId in cityMemoryStoreRef.current) return;

    const data = await apiJson<MemoriesResponse>(cityMemoriesApiKey(cityId));
    const cityMemories = data.memories[cityId] ?? [];
    cityMemoryStoreRef.current = { ...cityMemoryStoreRef.current, [cityId]: cityMemories };
    setCityMemoryStore(cityMemoryStoreRef.current);
  }, []);

  const applyMemoryUpdate = useCallback((memories: LocalMemoryStore, selectedCityId: string | null) => {
    if (!selectedCityId) return;
    const selectedMemories = memories[selectedCityId];
    if (!selectedMemories) return;

    cityMemoryStoreRef.current = { ...cityMemoryStoreRef.current, [selectedCityId]: selectedMemories };
    setCityMemoryStore(cityMemoryStoreRef.current);
  }, []);

  const refreshRemoteState = useCallback(
    (selectedCityId: string | null) => {
      void mutateCityAssets();
      void mutateSummary();
      if (selectedCityId) void loadCityMemories(selectedCityId, true);
    },
    [loadCityMemories, mutateCityAssets, mutateSummary],
  );

  const commitMemoryStore = useCallback(
    (memories: LocalMemoryStore, cityId: string) => {
      const cityMemories = memories[cityId] ?? [];
      cityMemoryStoreRef.current = { ...cityMemoryStoreRef.current, [cityId]: cityMemories };
      setCityMemoryStore(cityMemoryStoreRef.current);
      localMemoriesRef.current = { ...localMemoriesRef.current, [cityId]: cityMemories };
      publishMemoryMutation(memories, cityId);
    },
    [publishMemoryMutation],
  );

  const saveMemory = useCallback(
    async (cityId: string, memory: Memory, photos?: MemoryPhotoPayload[]) => {
      if (!isAdmin) throw new Error("Admin mode required");

      const data = await createMemory(memory, photos);
      commitMemoryStore(data.memories, cityId);
    },
    [commitMemoryStore, isAdmin],
  );

  const saveMemoryCover = useCallback(
    async (cityId: string, memoryId: string, coverImage: string) => {
      if (!isAdmin) throw new Error("Admin mode required");

      const data = await setMemoryCover(memoryId, coverImage);
      commitMemoryStore(data.memories, cityId);
    },
    [commitMemoryStore, isAdmin],
  );

  const updateMemoryRecord = useCallback(
    async (cityId: string, memoryId: string, memory: MemoryPatchPayload) => {
      if (!isAdmin) throw new Error("Admin mode required");

      const data = await updateMemory(memoryId, memory);
      commitMemoryStore(data.memories, cityId);
    },
    [commitMemoryStore, isAdmin],
  );

  const deleteMemoryRecord = useCallback(
    async (cityId: string, memoryId: string) => {
      if (!isAdmin) throw new Error("Admin mode required");

      const data = await deleteMemory(memoryId);
      commitMemoryStore(data.memories, cityId);
    },
    [commitMemoryStore, isAdmin],
  );

  const saveCityAsset = useCallback(
    async (cityId: string, image: string) => {
      if (!isAdmin) throw new Error("Admin mode required");

      const response = await apiFetch("/api/v1/city-assets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityId, image }),
      });

      if (!response.ok) throw new Error("Failed to save city asset");

      const data = (await response.json()) as { assets: CityAssetStore };
      void mutateCityAssets({ assets: data.assets }, { revalidate: false });
    },
    [isAdmin, mutateCityAssets],
  );

  const deleteCityAsset = useCallback(
    async (cityId: string) => {
      if (!isAdmin) throw new Error("Admin mode required");

      const response = await apiFetch("/api/v1/city-assets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityId }),
      });

      if (!response.ok) throw new Error("Failed to delete city asset");

      const data = (await response.json()) as { assets: CityAssetStore };
      void mutateCityAssets({ assets: data.assets }, { revalidate: false });
    },
    [isAdmin, mutateCityAssets],
  );

  return {
    localMemories,
    cityAssets,
    cityRegions,
    loadCityMemories,
    applyMemoryUpdate,
    refreshRemoteState,
    saveMemory,
    saveMemoryCover,
    updateMemoryRecord,
    deleteMemoryRecord,
    saveCityAsset,
    deleteCityAsset,
  };
}
