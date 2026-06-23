"use client";

import { motion } from "framer-motion";
import type { City } from "@/data/cities";
import type { Memory } from "@/data/memories";
import { MemoryThumb, photosOfMemory } from "@/components/memories/MemoryContentView";

export function CityPreviewPopover({
  city,
  memory,
  memoryCount,
}: Readonly<{
  city: City;
  memory?: Memory;
  memoryCount: number;
}>) {
  const photos = photosOfMemory(memory);
  const cover = photos[0] ?? city.sprite;

  return (
    <motion.span
      className="pointer-events-none absolute left-1/2 top-0 z-40 w-[184px] -translate-x-1/2 -translate-y-[calc(100%+10px)] overflow-hidden rounded-[8px] border border-dim/85 bg-cream/96 text-ink shadow-[0_14px_32px_rgba(90,102,112,0.14)] backdrop-blur"
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={{ duration: 0.16 }}
    >
      <span className="grid grid-cols-[58px_1fr] gap-2 p-2">
        <span className="relative aspect-square overflow-hidden rounded-[6px] border border-dim bg-mist">
          <MemoryThumb
            className={`pixelated h-full w-full object-cover ${memory ? "" : "opacity-50 grayscale"}`}
            src={cover}
            alt={`${city.name} preview`}
          />
        </span>
        <span className="min-w-0 py-0.5">
          <span className="block truncate text-sm font-semibold text-ink">{city.name}</span>
          <span className="mt-1 block text-[11px] font-medium text-bloom">
            {memoryCount} 条回忆
          </span>
          <span className="mt-1 block truncate text-[11px] text-ink/52">
            {memory?.date ?? "还没有本地回忆"}
          </span>
        </span>
      </span>
    </motion.span>
  );
}
