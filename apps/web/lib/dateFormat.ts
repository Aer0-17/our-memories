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
