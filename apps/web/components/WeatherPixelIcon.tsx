"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { WeatherKind } from "@/lib/weather";
import { weatherSprite } from "@/lib/generatedAssets";

const spriteFrameDurationMs = 240;

export function WeatherPixelIcon({
  kind,
  className,
}: Readonly<{ kind: WeatherKind; className?: string }>) {
  const asset = weatherSprite(kind);
  const frames = asset.frames ?? 4;
  const [frameIndex, setFrameIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const effectiveFrameIndex = reduceMotion || frames <= 1 ? 0 : frameIndex % frames;
  const framePosition = frames <= 1 ? 50 : (effectiveFrameIndex / (frames - 1)) * 100;

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (frames <= 1 || reduceMotion) return;

    const interval = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames);
    }, spriteFrameDurationMs);

    return () => window.clearInterval(interval);
  }, [frames, reduceMotion, asset.src]);

  return (
    <span
      className={`generated-sprite pixelated weather-pixel-icon ${className ?? ""}`}
      aria-hidden="true"
      style={{
        "--sprite-url": `url(${asset.src})`,
        "--sprite-frames": frames,
        "--sprite-frame-aspect": `${(asset.width / frames) || 1} / ${asset.height || 1}`,
        animation: "none",
        backgroundPosition: `${framePosition}% 0`,
      } as CSSProperties}
    />
  );
}
