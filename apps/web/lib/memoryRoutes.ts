import { cities, type City } from "@/data/cities";
import { memoryTime, type Memory } from "@/data/memories";
import type { LocalMemoryStore } from "@/data/progress";

export type MemoryRoutePoint = {
  city: City;
  memory: Memory;
  order: number;
};

const cityById = new Map(cities.map((city) => [city.id, city]));

export function buildMemoryRoutePoints(localMemories: LocalMemoryStore, provinceId?: string): MemoryRoutePoint[] {
  const datedMemories = Object.values(localMemories)
    .flat()
    .map((memory) => ({ memory, city: cityById.get(memory.cityId) }))
    .filter((item): item is { memory: Memory; city: City } =>
      Boolean(item.city && (!provinceId || item.city.provinceId === provinceId)),
    )
    .sort((a, b) => memoryTime(a.memory) - memoryTime(b.memory));

  const points: Array<{ memory: Memory; city: City }> = [];
  datedMemories.forEach((item) => {
    if (points[points.length - 1]?.city.id === item.city.id) return;
    points.push(item);
  });

  return points.map((point, index) => ({
    ...point,
    order: index + 1,
  }));
}

export function curvedRoutePath(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) return "";

  return points
    .map((point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;

      const previous = points[index - 1];
      const midX = (previous.x + point.x) / 2;
      const midY = (previous.y + point.y) / 2;
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const bend = Math.min(44, Math.max(16, length * 0.12)) * (index % 2 === 0 ? -1 : 1);
      const controlX = midX - (dy / length) * bend;
      const controlY = midY + (dx / length) * bend;

      return `Q ${Number(controlX.toFixed(2))} ${Number(controlY.toFixed(2))} ${point.x} ${point.y}`;
    })
    .join(" ");
}
