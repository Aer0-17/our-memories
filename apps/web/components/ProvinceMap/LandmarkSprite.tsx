"use client";

import Image from "next/image";
import { LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { type City } from "@/data/cities";
import { isDataImageUrl } from "./shared";

export function LandmarkSprite({ city, lit }: Readonly<{ city: City; lit: boolean }>) {
  const className = `pixelated h-full w-full object-contain transition duration-500 ${
    lit
      ? "drop-shadow-[0_10px_18px_rgba(90,102,112,0.14)]"
      : "opacity-50 grayscale drop-shadow-[0_8px_14px_rgba(90,102,112,0.08)]"
  }`;

  if (isDataImageUrl(city.sprite)) {
    return (
      <LocalPrivacyImg className={className} src={city.sprite} alt={city.landmark} />
    );
  }

  return (
    <Image
      className={className}
      src={city.sprite}
      alt={city.landmark}
      fill
      loading="eager"
      sizes="112px"
      unoptimized
    />
  );
}
