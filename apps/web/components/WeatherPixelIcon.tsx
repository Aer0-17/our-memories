"use client";

import type { CSSProperties } from "react";
import type { WeatherKind } from "@/lib/weather";
import { weatherSprite } from "@/lib/generatedAssets";

export function WeatherPixelIcon({
  kind,
  className,
}: Readonly<{ kind: WeatherKind; className?: string }>) {
  const asset = weatherSprite(kind);

  return (
    <span
      className={`generated-sprite pixelated weather-pixel-icon ${className ?? ""}`}
      aria-hidden="true"
      style={{
        "--sprite-url": `url(${asset.src})`,
        "--sprite-frames": asset.frames ?? 4,
        "--sprite-frame-aspect": `${(asset.width / (asset.frames ?? 4)) || 1} / ${asset.height || 1}`,
      } as CSSProperties}
    />
  );
}
