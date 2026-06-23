"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Heart } from "lucide-react";
import { cities } from "@/data/cities";
import {
  type LocalMemoryStore,
} from "@/data/progress";
import type { Memory } from "@/data/memories";
import { LocalPrivacyImage, LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { isBrowserImageUrl } from "@/lib/image";
import { useMemoryStore } from "@/lib/memoryStore";

const randomMemoryCount = 3;

function pickRandomMemories(items: Memory[]) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, randomMemoryCount);
}

function collectMemories(localMemories: LocalMemoryStore) {
  const byId = new Map<string, Memory>();

  Object.values(localMemories).flat().forEach((memory) => {
    if (!memory.draft) byId.set(memory.id, memory);
  });

  return [...byId.values()];
}

function MemoryThumb({ memory }: Readonly<{ memory: Memory }>) {
  const className = "pixelated h-full w-full object-cover transition duration-300 group-hover:scale-105";

  if (isBrowserImageUrl(memory.image)) {
    return (
      <LocalPrivacyImg className={className} src={memory.image} alt={`${memory.city} memory`} />
    );
  }

  return (
    <LocalPrivacyImage
      className="pixelated object-cover transition duration-300 group-hover:scale-105"
      src={memory.image}
      alt={`${memory.city} memory`}
      fill
      sizes="70px"
    />
  );
}

export default function RecentMemories() {
  const { data } = useMemoryStore();
  const randomMemories = useMemo(
    () => pickRandomMemories(collectMemories(data?.memories ?? {})),
    [data?.memories],
  );

  const memoryItems = useMemo(
    () =>
      randomMemories.map((memory) => ({
        memory,
        city: cities.find((city) => city.id === memory.cityId),
      })),
    [randomMemories],
  );

  return (
    <div className="mt-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">随机记忆</p>
          <p className="mt-0.5 text-xs text-ink/50">随机推荐三段，点一下回到那座城</p>
        </div>
        <Heart className="h-4 w-4 fill-sakura text-bloom" />
      </div>
      <div className="mt-3 space-y-2">
        {memoryItems.length > 0 ? (
          memoryItems.map(({ memory, city }) => (
            <Link
              key={memory.id}
              className="group block rounded-[8px] border border-transparent p-1.5 transition hover:border-sakura hover:bg-cream/72 hover:shadow-[0_10px_24px_rgba(90,102,112,0.07)]"
              href={city ? `/province/${city.provinceId}?city=${memory.cityId}` : "/map"}
            >
              <article className="flex items-center gap-2.5">
                <div className="relative h-[46px] w-[56px] shrink-0 overflow-hidden rounded-[5px] border border-dim bg-mist">
                  <MemoryThumb memory={memory} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {memory.city}
                    <span className="ml-1.5 text-xs font-normal text-ink/48">
                      {memory.date}
                    </span>
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-ink/62">
                    {memory.text}
                  </p>
                </div>
              </article>
            </Link>
          ))
        ) : (
          <div className="rounded-[8px] border border-dashed border-dim bg-cream/52 px-4 py-5 text-sm leading-6 text-ink/58">
            还没有回忆。先在地图上点一座城市，写下第一段，它就会出现在随机推荐里。
          </div>
        )}
      </div>
      <Link
        className="mt-4 flex w-full items-center justify-between rounded-[8px] border border-dim/70 bg-cream/62 px-4 py-2.5 text-sm font-semibold text-ink/72 transition hover:border-sakura hover:text-bloom hover:shadow-[0_10px_24px_rgba(90,102,112,0.07)]"
        href="/memories"
      >
        查看全部
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
