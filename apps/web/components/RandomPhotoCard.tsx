"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Camera, MapPin, RefreshCw } from "lucide-react";
import { cities } from "@/data/cities";
import type { MemorySummaryStore } from "@/data/memories";
import { LocalPrivacyImage, LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { isBrowserImageUrl } from "@/lib/image";
import { useMemorySummary } from "@/lib/memorySummaryStore";

interface RandomPhoto {
  id: string;
  src: string;
  city: string;
  cityId: string;
  date: string;
  text: string;
}

function collectSummaryPhotos(summary: MemorySummaryStore) {
  return Object.values(summary).flatMap((item) => {
    const src = item.coverImage || item.latest?.image;
    if (!src || !item.latest) return [];
    return [{
      id: item.latest.id,
      src,
      city: item.city,
      cityId: item.cityId,
      date: item.latest.date,
      text: item.latest.text,
    }];
  });
}

function PhotoImage({ photo }: Readonly<{ photo: RandomPhoto }>) {
  const className = "h-full w-full object-cover";

  if (isBrowserImageUrl(photo.src)) {
    return (
      <LocalPrivacyImg className={className} src={photo.src} alt={`${photo.city} 的随机照片`} />
    );
  }

  return (
    <LocalPrivacyImage
      className={className}
      src={photo.src}
      alt={`${photo.city} 的随机照片`}
      fill
      sizes="190px"
    />
  );
}

export default function RandomPhotoCard() {
  const [selectedPhotoId, setSelectedPhotoId] = useState("");
  const { data } = useMemorySummary();

  const photos = useMemo(
    () => collectSummaryPhotos(data?.summary ?? {}),
    [data?.summary],
  );

  const photo = useMemo(() => {
    if (photos.length === 0) return null;
    return photos.find((candidate) => candidate.id === selectedPhotoId) ?? photos[0];
  }, [photos, selectedPhotoId]);

  const href = useMemo(() => {
    if (!photo) return "/memories";
    const city = cities.find((candidate) => candidate.id === photo.cityId);
    return city ? `/province/${city.provinceId}?city=${photo.cityId}` : "/memories";
  }, [photo]);

  const shufflePhoto = () => {
    if (!photo) return;
    if (photos.length === 0) return;
    const candidates = photos.filter((candidate) => candidate.id !== photo.id);
    const source = candidates.length > 0 ? candidates : photos;
    setSelectedPhotoId(source[Math.floor(Math.random() * source.length)].id);
  };

  return (
    <aside className="absolute bottom-[4.75rem] right-[2.5rem] z-30 hidden w-[248px] rotate-[-1.5deg] xl:block">
      <div className="rounded-[8px] border border-dim/80 bg-cream/86 p-3 shadow-[0_22px_58px_rgba(90,102,112,0.15)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:rotate-0 hover:border-sakura">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px] border border-sakura bg-sakura/62 text-bloom shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <Camera className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">随机相框</p>
              <p className="truncate text-xs font-medium text-ink/48">点照片回到那座城</p>
            </div>
          </div>
          <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sky transition hover:bg-mist/48 hover:text-ink"
            type="button"
            onClick={shufflePhoto}
            disabled={!photo}
            aria-label="换一张随机照片"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {photo ? (
          <Link
            className="group block"
            href={href}
            aria-label={`查看${photo.city} ${photo.date} 的随机照片`}
          >
            <div className="relative aspect-[4/3] overflow-hidden rounded-[6px] border border-dim/80 bg-mist/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <PhotoImage photo={photo} />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-soft/42 to-transparent opacity-80 transition group-hover:opacity-55" />
            </div>
            <div className="mt-3 flex items-start gap-2.5">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[6px] border border-mist bg-mist/48 text-sky">
                <MapPin className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold leading-5 text-ink">
                  {photo.city}
                  <span className="ml-1.5 text-xs font-normal text-ink/48">{photo.date}</span>
                </p>
                <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-ink/58">{photo.text}</p>
              </div>
            </div>
          </Link>
        ) : (
          <div className="rounded-[6px] border border-dashed border-dim/90 bg-cream/72 p-3">
            <div className="grid aspect-[4/3] place-items-center rounded-[5px] bg-mist/34 text-center">
              <div>
                <Camera className="mx-auto h-7 w-7 text-bloom" />
                <p className="mt-2 text-sm font-semibold text-ink">相框在等照片</p>
                <p className="mt-1 text-xs leading-5 text-ink/52">点一座城市写回忆后，这里会随机展示。</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
