import type { NotificationItem } from "./api";

export type NotificationCategory = "memory" | "message" | "occasion" | "other";

export type NotificationTarget = {
  url: string;
  tab: boolean;
};

export function notificationTarget(item: NotificationItem): NotificationTarget | null {
  if (item.targetType === "memory") {
    if (item.type === "memory.deleted") {
      return { url: "/pages/memory-trash/index", tab: false };
    }
    if (!item.targetId) return { url: "/pages/memories/index", tab: true };
    return {
      url: `/pages/memory-detail/index?id=${encodeURIComponent(item.targetId)}`,
      tab: false,
    };
  }
  if (item.targetType === "time_capsule") return { url: "/pages/capsules/index", tab: false };
  if (item.targetType === "anniversary") return { url: "/pages/anniversaries/index", tab: true };
  if (item.targetType === "whisper") {
    return { url: "/pages/whispers/index", tab: false };
  }
  if (item.targetType === "signal") {
    return {
      url: item.targetId
        ? `/pages/map/index?signal=${encodeURIComponent(item.targetId)}`
        : "/pages/map/index",
      tab: false,
    };
  }
  if (item.targetType === "future_checkin") return { url: "/pages/map/index", tab: false };
  if (item.targetType === "trip_guide") {
    if (!item.targetId) return { url: "/pages/trips/index", tab: false };
    return {
      url: `/pages/trip-detail/index?id=${encodeURIComponent(item.targetId)}`,
      tab: false,
    };
  }
  if (item.targetType === "couple_question") {
    if (!item.targetId) return { url: "/pages/questions/index", tab: false };
    return {
      url: `/pages/question-detail/index?id=${encodeURIComponent(item.targetId)}`,
      tab: false,
    };
  }
  if (item.targetType === "settings") return { url: "/pages/settings/index", tab: true };
  return null;
}

export function notificationCategory(item: NotificationItem): NotificationCategory {
  if (item.targetType === "memory") return "memory";
  if (
    item.targetType === "whisper" ||
    item.targetType === "signal" ||
    item.targetType === "couple_question"
  ) return "message";
  if (
    item.targetType === "time_capsule" ||
    item.targetType === "anniversary" ||
    item.targetType === "trip_guide"
  ) return "occasion";
  return "other";
}

export function notificationCategoryLabel(category: NotificationCategory) {
  if (category === "memory") return "回忆";
  if (category === "message") return "私语与想你";
  if (category === "occasion") return "重要日子";
  return "其他";
}

export function notificationTime(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function notificationDayLabel(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "较早之前";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}
