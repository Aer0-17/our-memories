"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { City } from "@/data/cities";

type BrowserTimeout = ReturnType<Window["setTimeout"]>;

type UseCitySelectionOptions = {
  provinceCities: City[];
  litCityIds: Set<string>;
  isAdmin: boolean;
  loadCityMemories: (cityId: string, force?: boolean) => Promise<void>;
  focusCity: (city: Pick<City, "id">) => void;
};

export function useCitySelection({
  provinceCities,
  litCityIds,
  isAdmin,
  loadCityMemories,
  focusCity,
}: UseCitySelectionOptions) {
  const nudgeTimeoutRef = useRef<BrowserTimeout | null>(null);
  const longPressTimeoutRef = useRef<BrowserTimeout | null>(null);
  const previousLitCityIdsRef = useRef<Set<string> | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [nudgedCityId, setNudgedCityId] = useState<string | null>(null);
  const [sparkedCityId, setSparkedCityId] = useState<string | null>(null);
  const [previewCityId, setPreviewCityId] = useState<string | null>(null);
  const [mobileSheetMode, setMobileSheetMode] = useState<"view" | "create">("view");

  const selectedCity = useMemo(
    () => provinceCities.find((city) => city.id === selectedCityId) ?? null,
    [provinceCities, selectedCityId],
  );

  useEffect(() => {
    return () => {
      if (nudgeTimeoutRef.current) window.clearTimeout(nudgeTimeoutRef.current);
      if (longPressTimeoutRef.current) window.clearTimeout(longPressTimeoutRef.current);
    };
  }, []);

  const clearLongPressPreview = useCallback(() => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const beginLongPressPreview = useCallback(
    (cityId: string) => {
      clearLongPressPreview();
      longPressTimeoutRef.current = window.setTimeout(() => setPreviewCityId(cityId), 400);
    },
    [clearLongPressPreview],
  );

  useEffect(() => {
    const previous = previousLitCityIdsRef.current;
    if (!previous) {
      previousLitCityIdsRef.current = new Set(litCityIds);
      return;
    }

    const newlyLitCityId = [...litCityIds].find((cityId) => !previous.has(cityId));
    previousLitCityIdsRef.current = new Set(litCityIds);
    if (!newlyLitCityId) return;

    setSparkedCityId(newlyLitCityId);
    const timer = window.setTimeout(() => setSparkedCityId(null), 900);
    return () => window.clearTimeout(timer);
  }, [litCityIds]);

  const handleSelectCity = useCallback(
    (cityId: string, lit: boolean) => {
      const city = provinceCities.find((candidate) => candidate.id === cityId);
      setSelectedCityId(cityId);
      setMobileSheetMode(!lit && isAdmin ? "create" : "view");
      void loadCityMemories(cityId);
      if (city) focusCity(city);
      if (!lit) {
        setNudgedCityId(cityId);
        if (nudgeTimeoutRef.current) window.clearTimeout(nudgeTimeoutRef.current);
        nudgeTimeoutRef.current = window.setTimeout(() => setNudgedCityId(null), 520);
      }
    },
    [focusCity, isAdmin, loadCityMemories, provinceCities],
  );

  const clearSelection = useCallback(() => {
    setSelectedCityId(null);
  }, []);

  return {
    selectedCity,
    selectedCityId,
    setSelectedCityId,
    nudgedCityId,
    sparkedCityId,
    previewCityId,
    setPreviewCityId,
    mobileSheetMode,
    handleSelectCity,
    clearSelection,
    clearLongPressPreview,
    beginLongPressPreview,
  };
}
