"use client";

import type { WeatherKind } from "@/lib/weather";

export function WeatherPixelIcon({
  kind,
  className,
}: Readonly<{ kind: WeatherKind; className?: string }>) {
  const isNight = kind === "night-clear" || kind === "night-partly";
  const hasSun = kind === "sunny" || kind === "partly";
  const hasCloud = !["sunny", "night-clear", "fog", "wind"].includes(kind);
  const hasRain = ["rain", "light-rain", "moderate-rain", "heavy-rain", "thunder", "sleet"].includes(kind);
  const hasSnow = ["snow", "moderate-snow", "heavy-snow", "sleet"].includes(kind);
  const isStormCloud = ["cloudy", "thunder", "rain", "moderate-rain", "heavy-rain"].includes(kind);
  const rainDrops = kind === "heavy-rain" ? 6 : kind === "moderate-rain" || kind === "rain" ? 5 : hasRain ? 3 : 0;
  const snowDrops = kind === "heavy-snow" ? 6 : kind === "moderate-snow" ? 5 : hasSnow ? 3 : 0;

  return (
    <svg className={`pixelated ${className ?? ""}`} viewBox="0 0 64 64" aria-hidden="true" shapeRendering="crispEdges">
      <g>
        {hasSun && (
          <>
            <rect x="14" y="7" width="6" height="6" fill="var(--color-amber)" />
            <rect x="6" y="22" width="6" height="6" fill="var(--color-amber)" />
            <rect x="28" y="22" width="6" height="6" fill="var(--color-amber)" />
            <rect x="14" y="36" width="6" height="6" fill="var(--color-amber)" />
            <rect x="12" y="17" width="16" height="16" fill="var(--color-sunshine)" />
            <rect x="16" y="13" width="8" height="24" fill="var(--color-sunlit)" />
            <rect x="16" y="25" width="4" height="4" fill="var(--color-dusk)" />
            <rect x="24" y="25" width="4" height="4" fill="var(--color-dusk)" />
            <rect x="20" y="31" width="4" height="4" fill="var(--color-bloom)" />
          </>
        )}
        {isNight && (
          <>
            <rect x="14" y="11" width="24" height="24" fill="var(--color-lavender)" />
            <rect x="22" y="7" width="18" height="28" fill="var(--color-moon)" />
            <rect x="30" y="7" width="12" height="20" fill="var(--color-lavender)" />
            <rect x="10" y="10" width="4" height="4" fill="var(--color-marigold)" />
            <rect x="42" y="17" width="4" height="4" fill="var(--color-sakura)" />
            <rect x="18" y="32" width="4" height="4" fill="var(--color-bloom)" />
          </>
        )}
        {kind === "fog" && (
          <>
            <rect x="8" y="18" width="34" height="5" fill="var(--color-cloud-mid)" />
            <rect x="20" y="27" width="34" height="5" fill="var(--color-cloud)" />
            <rect x="8" y="36" width="40" height="5" fill="var(--color-cloud-light)" />
            <rect x="16" y="45" width="26" height="5" fill="var(--color-cloud)" />
            <rect x="49" y="13" width="4" height="4" fill="var(--color-petal)" />
            <rect x="53" y="17" width="4" height="4" fill="var(--color-petal)" />
          </>
        )}
        {kind === "wind" && (
          <>
            <rect x="10" y="22" width="31" height="4" fill="var(--color-wind)" />
            <rect x="10" y="34" width="23" height="4" fill="var(--color-wind)" />
            <rect x="18" y="46" width="32" height="4" fill="var(--color-wind)" />
            <rect x="41" y="18" width="9" height="4" fill="var(--color-wind-ink)" />
            <rect x="33" y="30" width="13" height="4" fill="var(--color-wind-ink)" />
            <rect x="50" y="42" width="5" height="4" fill="var(--color-wind-ink)" />
            <rect x="51" y="13" width="4" height="4" fill="var(--color-petal)" />
            <rect x="55" y="17" width="4" height="4" fill="var(--color-petal)" />
          </>
        )}
        {hasCloud && (
          <>
            <rect x="14" y="25" width="38" height="18" fill={isStormCloud ? "var(--color-storm)" : "var(--color-sky-light)"} />
            <rect x="20" y="17" width="24" height="12" fill={isStormCloud ? "var(--color-storm-light)" : "var(--color-sky-pale)"} />
            <rect x="10" y="31" width="46" height="12" fill={isStormCloud ? "var(--color-storm-deep)" : "var(--color-rain-mist)"} />
            <rect x="16" y="29" width="34" height="10" fill={isStormCloud ? "var(--color-storm-pale)" : "white"} />
            <rect x="11" y="41" width="44" height="4" fill={isStormCloud ? "var(--color-storm-deep)" : "var(--color-cloud-light)"} opacity="0.65" />
          </>
        )}
        {Array.from({ length: rainDrops }).map((_, index) => (
          <rect
            key={`rain-${index}`}
            x={18 + (index % 3) * 12 + (index > 2 ? 4 : 0)}
            y={48 + Math.floor(index / 3) * 8}
            width="4"
            height="8"
            fill="var(--color-rain-bright)"
          />
        ))}
        {Array.from({ length: snowDrops }).map((_, index) => (
          <g key={`snow-${index}`} transform={`translate(${16 + (index % 3) * 14 + (index > 2 ? 3 : 0)} ${49 + Math.floor(index / 3) * 7})`}>
            <rect x="3" y="0" width="3" height="9" fill="var(--color-frost)" />
            <rect x="0" y="3" width="9" height="3" fill="var(--color-frost)" />
          </g>
        ))}
        {kind === "thunder" && (
          <>
            <rect x="31" y="43" width="7" height="11" fill="var(--color-amber)" />
            <rect x="25" y="52" width="13" height="5" fill="var(--color-amber)" />
            <rect x="29" y="57" width="5" height="7" fill="var(--color-ember)" />
          </>
        )}
      </g>
    </svg>
  );
}
