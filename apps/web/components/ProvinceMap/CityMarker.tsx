"use client";

import { motion } from "framer-motion";
import { cityFallbackSprite, type City } from "@/data/cities";
import { getMarkerLayout } from "./shared";
import { LandmarkSprite } from "./LandmarkSprite";

export function CityMarker({
  city,
  lit,
  selected,
  memoryCount,
}: Readonly<{ city: City; lit: boolean; selected: boolean; memoryCount?: number }>) {
  const isFallbackCity = city.sprite === cityFallbackSprite;
  const layout = getMarkerLayout(city, selected);
  const showBadge = memoryCount != null && memoryCount > 0;

  if (isFallbackCity) {
    return (
      <span className="relative block h-full w-full">
        <motion.span
          className="absolute block rounded-full border-2 border-cream"
          animate={{
            backgroundColor: lit ? "var(--color-bloom)" : "var(--color-dim)",
            boxShadow: lit
              ? "0 0 12px rgba(232,184,194,0.7)"
              : "0 4px 10px rgba(90,102,112,0.08)",
            scale: lit ? 1 : 0.9,
          }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          style={{
            left: `calc(50% + ${layout.iconX}px)`,
            top: `calc(50% + ${layout.iconY}px)`,
            width: layout.iconSize,
            height: layout.iconSize,
          }}
        >
          {showBadge && (
            <span className="absolute -right-1.5 -top-1.5 grid min-h-[16px] min-w-[16px] place-items-center rounded-full border border-cream bg-bloom px-1 text-[9px] font-bold leading-none text-cream shadow-[0_2px_6px_rgba(232,184,194,0.55)]">
              {memoryCount}
            </span>
          )}
        </motion.span>
        <span
          className={`absolute flex items-center gap-1.5 whitespace-nowrap rounded-full bg-cream/92 px-3 py-1.5 text-xs font-semibold shadow-[0_8px_18px_rgba(90,102,112,0.10)] backdrop-blur transition duration-200 ${
            lit
              ? "text-bloom opacity-100"
              : "text-ink/62 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          }`}
          style={{
            left: `calc(50% + ${layout.labelX}px)`,
            top: `calc(50% + ${layout.labelY}px)`,
          }}
        >
          {city.name}
        </span>
      </span>
    );
  }

  const compactLandmark = !selected;

  return (
    <span className="relative block h-full w-full">
      <span
        className="absolute block"
        style={{
          left: `calc(50% + ${layout.iconX}px)`,
          top: `calc(50% + ${layout.iconY}px)`,
          width: layout.iconSize,
          height: layout.iconSize,
        }}
      >
        <LandmarkSprite city={city} lit={lit} />
      </span>
      <span
        className={`absolute flex items-center whitespace-nowrap rounded-full bg-cream/88 font-semibold shadow-[0_8px_18px_rgba(90,102,112,0.10)] backdrop-blur transition duration-200 ${
          compactLandmark ? "gap-1.5 px-3 py-1.5 text-xs" : "gap-2 px-4 py-2 text-sm"
        } ${
          compactLandmark && !lit ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" : "opacity-100"
        } ${lit ? "text-bloom" : "text-ink/58"}
        }`}
        style={{
          left: `calc(50% + ${layout.labelX}px)`,
          top: `calc(50% + ${layout.labelY}px)`,
        }}
      >
        <span
          className={`rounded-full border-2 border-cream ${
            compactLandmark ? "h-2 w-2" : "h-2.5 w-2.5"
          } ${
            lit
              ? "bg-bloom shadow-[0_0_10px_rgba(232,184,194,0.65)]"
              : "bg-dim"
          }`}
        />
        {city.name}
        {city.nameEn !== city.name && (
          <span className={lit ? "font-normal text-bloom/80" : "font-normal text-ink/42"}>
            {city.nameEn}
          </span>
        )}
        {showBadge && (
          <span className="ml-0.5 grid min-h-[16px] min-w-[16px] place-items-center rounded-full border border-cream bg-bloom px-1 text-[9px] font-bold leading-none text-cream shadow-[0_2px_6px_rgba(232,184,194,0.55)]">
            {memoryCount}
          </span>
        )}
      </span>
    </span>
  );
}
