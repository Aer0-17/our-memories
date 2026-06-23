"use client";

import type { City } from "@/data/cities";
import { MobileMemoryImage } from "@/components/memories/MobileMemoryImage";

export function MemoryGallery({
  city,
  photos,
}: Readonly<{
  city: City;
  photos: string[];
}>) {
  if (photos.length === 0) {
    return (
      <p className="rounded-[7px] border border-dashed border-dim px-4 py-6 text-center text-sm text-ink/56">
        还没有照片，添加第一段回忆后会出现在这里。
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((photo, index) => (
        <span
          key={`${city.id}-mobile-gallery-photo-${index}`}
          className="relative aspect-square overflow-hidden rounded-[6px] border border-dim bg-mist"
        >
          <MobileMemoryImage src={photo} alt={`${city.name} gallery photo ${index + 1}`} fit="cover" />
        </span>
      ))}
    </div>
  );
}
