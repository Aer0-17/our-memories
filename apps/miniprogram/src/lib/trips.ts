import type { TripDayPlan, TripGuide, TripGuidePayload } from "./api";

export function tripDate(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function tripDisplayDate(value?: string) {
  const date = tripDate(value);
  if (!date) return "日期待定";
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

export function tripDateRange(payload: TripGuidePayload) {
  if (!payload.startDate && !payload.endDate) return "日期待定";
  if (payload.startDate && payload.endDate) {
    return `${tripDisplayDate(payload.startDate)} — ${tripDisplayDate(payload.endDate)}`;
  }
  return tripDisplayDate(payload.startDate || payload.endDate);
}

export function tripInclusiveDays(startDate?: string, endDate?: string) {
  const start = tripDate(startDate);
  const end = tripDate(endDate);
  if (!start || !end || end.getTime() < start.getTime()) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function tripDayDate(startDate: string | undefined, day: number) {
  const start = tripDate(startDate);
  if (!start) return "";
  const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function tripProgress(payload: TripGuidePayload) {
  const checkpoints = (payload.daysPlan || []).flatMap((plan) => plan.checkpoints || []);
  const done = checkpoints.filter((checkpoint) => checkpoint.done).length;
  return {
    total: checkpoints.length,
    done,
    percent: checkpoints.length ? Math.round((done / checkpoints.length) * 100) : 0,
  };
}

export function normalizedTripPlans(payload: TripGuidePayload): TripDayPlan[] {
  const plans = new Map((payload.daysPlan || []).map((plan) => [plan.day, plan]));
  return Array.from({ length: Math.max(1, Math.min(30, payload.days || 1)) }, (_, index) => {
    const day = index + 1;
    const existing = plans.get(day);
    return {
      day,
      date: existing?.date || tripDayDate(payload.startDate, day) || undefined,
      checkpoints: (existing?.checkpoints || []).filter((checkpoint) => checkpoint.name.trim()),
    };
  });
}

export function sortedTripGuides(guides: TripGuide[]) {
  return [...guides].sort((a, b) => {
    const aCompleted = a.payload.status === "completed";
    const bCompleted = b.payload.status === "completed";
    if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
    if (!aCompleted) {
      if (a.payload.startDate && b.payload.startDate) return a.payload.startDate.localeCompare(b.payload.startDate);
      if (a.payload.startDate) return -1;
      if (b.payload.startDate) return 1;
    }
    return (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "");
  });
}
