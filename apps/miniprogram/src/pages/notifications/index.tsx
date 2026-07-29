import { useCallback, useMemo, useState } from "react";
import { Button, Image, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  readSession,
  type NotificationItem,
} from "../../lib/api";
import {
  notificationCategory,
  notificationCategoryLabel,
  notificationDayLabel,
  notificationTarget,
  notificationTime,
  type NotificationCategory,
} from "../../lib/notifications";
import memoryIcon from "../../assets/lucide/images.svg";
import messageIcon from "../../assets/illustrations/icon-message-circle.png";
import occasionIcon from "../../assets/lucide/calendar-days.svg";
import otherIcon from "../../assets/lucide/shield-check.svg";
import "./index.scss";

type ReadFilter = "all" | "unread";
type CategoryFilter = NotificationCategory | "all";

type NotificationGroup = {
  label: string;
  items: NotificationItem[];
};

const categoryIcons: Record<NotificationCategory, string> = {
  memory: memoryIcon,
  message: messageIcon,
  occasion: occasionIcon,
  other: otherIcon,
};

function groupNotifications(items: NotificationItem[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  items.forEach((item) => {
    const label = notificationDayLabel(item.createdAt);
    const group = groups.get(label);
    if (group) {
      group.items.push(item);
    } else {
      groups.set(label, { label, items: [item] });
    }
  });
  return [...groups.values()];
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  const loadNotifications = useCallback(async (background = false) => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!background) setLoading(true);
    setStatus("");
    try {
      const data = await getNotifications(100);
      setNotifications(data.notifications || []);
    } catch {
      setStatus("全部动态暂时没有同步成功，请检查网络后再试。");
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void loadNotifications(Boolean(notifications.length));
  });

  usePullDownRefresh(() => {
    void loadNotifications(true).finally(() => Taro.stopPullDownRefresh());
  });

  const unreadCount = notifications.filter((item) => !item.isRead).length;
  const categoryCounts = useMemo(() => notifications.reduce<Record<NotificationCategory, number>>(
    (counts, item) => {
      const category = notificationCategory(item);
      counts[category] += 1;
      return counts;
    },
    { memory: 0, message: 0, occasion: 0, other: 0 },
  ), [notifications]);
  const filtered = useMemo(() => notifications.filter((item) => {
    if (readFilter === "unread" && item.isRead) return false;
    if (categoryFilter !== "all" && notificationCategory(item) !== categoryFilter) return false;
    return true;
  }), [categoryFilter, notifications, readFilter]);
  const groups = useMemo(() => groupNotifications(filtered), [filtered]);

  const openNotification = async (item: NotificationItem) => {
    const target = notificationTarget(item);
    if (!item.isRead) {
      setNotifications((current) => current.map((entry) => (
        entry.id === item.id ? { ...entry, isRead: true } : entry
      )));
      try {
        await markNotificationRead(item.id);
      } catch {
        setNotifications((current) => current.map((entry) => (
          entry.id === item.id ? { ...entry, isRead: false } : entry
        )));
        Taro.showToast({ title: "已读状态暂时没有同步", icon: "none" });
      }
    }
    if (!target) {
      Taro.showToast({ title: "这条动态没有可打开的页面", icon: "none" });
      return;
    }
    if (target.tab) {
      Taro.switchTab({ url: target.url });
    } else {
      Taro.navigateTo({ url: target.url });
    }
  };

  const markEveryNotificationRead = async () => {
    if (working || unreadCount === 0) return;
    const previous = notifications;
    setWorking(true);
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    try {
      await markAllNotificationsRead();
      Taro.showToast({ title: "全部动态都看过了", icon: "success" });
    } catch {
      setNotifications(previous);
      Taro.showToast({ title: "已读状态暂时没有同步", icon: "none" });
    } finally {
      setWorking(false);
    }
  };

  const resetFilters = () => {
    setReadFilter("all");
    setCategoryFilter("all");
  };

  const categoryOptions: Array<{ key: CategoryFilter; label: string; count: number }> = [
    { key: "all", label: "全部类型", count: notifications.length },
    { key: "memory", label: notificationCategoryLabel("memory"), count: categoryCounts.memory },
    { key: "message", label: notificationCategoryLabel("message"), count: categoryCounts.message },
    { key: "occasion", label: notificationCategoryLabel("occasion"), count: categoryCounts.occasion },
    { key: "other", label: notificationCategoryLabel("other"), count: categoryCounts.other },
  ];

  return (
    <View className="page notifications-page">
      <AppHeader title="消息中心" back />

      <View className={unreadCount ? "notifications-summary unread" : "notifications-summary"}>
        <View className="notifications-summary-copy">
          <Text className="notifications-kicker">两个人最近留下的动静</Text>
          <Text className="notifications-title">
            {unreadCount ? `还有 ${unreadCount} 条，等你看看` : "最近的动静都看过了"}
          </Text>
          <Text className="notifications-subtitle">点开一条，会直接回到对应的回忆、私语或重要日子。</Text>
        </View>
        <View className="notifications-unread-count">
          <Text className="notifications-unread-value">{unreadCount}</Text>
          <Text className="notifications-unread-label">未读</Text>
        </View>
      </View>

      <View className="notifications-tools">
        <View className="notifications-read-filter">
          <Button
            className={readFilter === "all" ? "notifications-read-option active" : "notifications-read-option"}
            aria-label={`全部动态，${notifications.length} 条`}
            onClick={() => setReadFilter("all")}
          >
            全部 {notifications.length}
          </Button>
          <Button
            className={readFilter === "unread" ? "notifications-read-option active" : "notifications-read-option"}
            aria-label={`未读动态，${unreadCount} 条`}
            onClick={() => setReadFilter("unread")}
          >
            未读 {unreadCount}
          </Button>
        </View>
        {unreadCount > 0 && (
          <Button
            className="notifications-read-all"
            disabled={working}
            onClick={() => void markEveryNotificationRead()}
          >
            全部看过
          </Button>
        )}
      </View>

      <ScrollView className="notifications-category-scroll" scrollX enableFlex={false} showScrollbar={false}>
        <View className="notifications-category-row">
          {categoryOptions.filter((item) => item.key === "all" || item.count > 0).map((item) => (
            <Button
              className={categoryFilter === item.key ? "notifications-category active" : "notifications-category"}
              key={item.key}
              aria-label={`${item.label}，${item.count} 条`}
              onClick={() => setCategoryFilter(item.key)}
            >
              {item.label} · {item.count}
            </Button>
          ))}
        </View>
      </ScrollView>

      {status && <ErrorBanner copy={status} onRetry={() => void loadNotifications()} />}
      {loading && notifications.length === 0 ? (
        <LoadingState compact />
      ) : notifications.length === 0 && !status ? (
        <EmptyState
          title="这里还没有新的动静"
          copy="对方新增回忆、回复私语或打开胶囊后，会在这里留下消息。"
        />
      ) : filtered.length === 0 && !status ? (
        <EmptyState
          title="这个分类已经看完了"
          copy="换个类型，或者回到全部动态继续看看。"
          actionLabel="查看全部动态"
          onAction={resetFilters}
        />
      ) : (
        <View className="notifications-timeline">
          {groups.map((group) => (
            <View className="notifications-day" key={group.label}>
              <Text className="notifications-day-label">{group.label}</Text>
              <View className="notifications-list">
                {group.items.map((item) => {
                  const category = notificationCategory(item);
                  return (
                    <Button
                      className={item.isRead ? "notification-row" : "notification-row unread"}
                      key={item.id}
                      onClick={() => void openNotification(item)}
                    >
                      <View className={`notification-icon ${category}`}>
                        <Image src={categoryIcons[category]} mode="aspectFit" />
                      </View>
                      <View className="notification-copy">
                        <View className="notification-title-row">
                          <Text className="notification-title">{item.title}</Text>
                          {!item.isRead && <View className="notification-new-dot" />}
                        </View>
                        <Text className="notification-body">{item.body || "TA 在这里留下了新的动静。"}</Text>
                        <View className="notification-meta-row">
                          <Text className={`notification-category-label ${category}`}>
                            {notificationCategoryLabel(category)}
                          </Text>
                          <Text className="notification-meta-separator">·</Text>
                          <Text className="notification-time">{notificationTime(item.createdAt)}</Text>
                        </View>
                      </View>
                      <Text className="notification-arrow">›</Text>
                    </Button>
                  );
                })}
              </View>
            </View>
          ))}
          <View className="notifications-retention">
            <Text className="notifications-retention-mark">✓</Text>
            <Text className="notifications-retention-copy">已读动态保留 30 天，最多保留最近 100 条。</Text>
          </View>
        </View>
      )}
    </View>
  );
}
