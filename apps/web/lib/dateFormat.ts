const flexibleDatePattern = /^(\d{4})\s*(?:[./-]|年)\s*(\d{1,2})\s*(?:[./-]|月)\s*(\d{1,2})\s*日?$/;
const dateInputPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export const normalizeDottedDate = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const match = flexibleDatePattern.exec(value.trim());
  if (!match) return undefined;

  const [, rawYear, rawMonth, rawDay] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!valid) return undefined;

  return `${rawYear}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
};

export const dottedDateToInputDate = (value: unknown): string => {
  const normalized = normalizeDottedDate(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split(".");
  return `${year}-${month}-${day}`;
};

export const inputDateToDottedDate = (value: string): string => {
  const match = dateInputPattern.exec(value);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}.${month}.${day}`;
};

/** 距离某个 YYYY-MM-DD 日期的天数（正数为未来，负数为过去，今天为 0）。 */
export function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** 返回今天的 YYYY-MM-DD 字符串（本地时区），用于 input[date] 的 min 属性等。 */
export function getTodayString(): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
