// Ray-casting hit test for native map taps. The map reports a coordinate rather
// than the province polygon that was touched, so any matching ring is a hit.

import type { Point } from "../data/geo";

function pointInRing(x: number, y: number, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInRings(x: number, y: number, rings: Point[][]): boolean {
  for (const ring of rings) {
    if (pointInRing(x, y, ring)) return true;
  }
  return false;
}
