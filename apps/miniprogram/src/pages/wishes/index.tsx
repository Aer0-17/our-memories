import { useCallback, useMemo, useState } from "react";
import { Button, Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import {
  deleteWish,
  getWishes,
  readSession,
  updateWish,
  type Wish,
  type WishInput,
  type WishStatus,
} from "../../lib/api";
import wishesIcon from "../../assets/lucide/list-checks.svg";
import imagesIcon from "../../assets/lucide/images.svg";
import trashIcon from "../../assets/lucide/trash-2.svg";
import "./index.scss";

type WishFilter = WishStatus | "all";

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateParts(value: string) {
  const [year, month, day] = value.slice(0, 10).replace(/\./g, "-").split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return { year, month, day, date };
}

function displayDate(value: string) {
  const parts = dateParts(value);
  return parts ? `${parts.year}.${String(parts.month).padStart(2, "0")}.${String(parts.day).padStart(2, "0")}` : value;
}

function targetCopy(wish: Wish) {
  if (wish.status === "completed") {
    const completed = wish.completedAt ? new Date(wish.completedAt) : null;
    if (completed && !Number.isNaN(completed.getTime())) {
      return `${completed.getFullYear()}.${String(completed.getMonth() + 1).padStart(2, "0")}.${String(completed.getDate()).padStart(2, "0")} 完成`;
    }
    return "已经一起完成";
  }
  const parts = dateParts(wish.targetDate);
  if (!parts) return "不赶时间，等合适的那一天";
  const today = dateParts(localDateValue());
  if (!today) return displayDate(wish.targetDate);
  const days = Math.round((parts.date.getTime() - today.date.getTime()) / 86400000);
  if (days === 0) return "就是今天";
  if (days > 0 && days <= 30) return `还有 ${days} 天 · ${displayDate(wish.targetDate)}`;
  if (days < 0) return `仍在等待 · ${displayDate(wish.targetDate)}`;
  return `约在 ${displayDate(wish.targetDate)}`;
}

function sortedWishes(items: Wish[]) {
  return [...items].sort((a, b) => {
    if (a.status !== b.status) return a.status === "planned" ? -1 : 1;
    if (a.status === "completed") {
      return (b.completedAt || b.updatedAt || "").localeCompare(a.completedAt || a.updatedAt || "");
    }
    if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate);
    if (a.targetDate) return -1;
    if (b.targetDate) return 1;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
}

function wishInput(wish: Wish, patch: Partial<WishInput> = {}): WishInput {
  return {
    title: wish.title,
    targetDate: wish.targetDate,
    description: wish.description,
    status: wish.status,
    completedAt: wish.completedAt,
    completedBy: wish.completedBy,
    ...patch,
  };
}

export default function WishesPage() {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [filter, setFilter] = useState<WishFilter>("planned");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [workingId, setWorkingId] = useState("");

  const loadWishes = useCallback(async (background = false) => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!background) setLoading(true);
    setStatus("");
    try {
      setWishes(await getWishes());
    } catch {
      setStatus("共同愿望暂时没有同步成功，请检查网络后再试。");
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void loadWishes(Boolean(wishes.length));
  });

  usePullDownRefresh(() => {
    void loadWishes(true).finally(() => Taro.stopPullDownRefresh());
  });

  const plannedCount = wishes.filter((wish) => wish.status === "planned").length;
  const completedCount = wishes.length - plannedCount;
  const progress = wishes.length ? Math.round((completedCount / wishes.length) * 100) : 0;
  const visibleWishes = useMemo(
    () => sortedWishes(filter === "all" ? wishes : wishes.filter((wish) => wish.status === filter)),
    [filter, wishes],
  );

  const openEditor = (wishId?: string) => {
    const query = wishId ? `?id=${encodeURIComponent(wishId)}` : "";
    Taro.navigateTo({ url: `/pages/wish-editor/index${query}` });
  };

  const completeWish = async (wish: Wish) => {
    if (workingId) return;
    const session = readSession();
    const result = await Taro.showModal({
      title: "这个愿望实现了吗？",
      content: "完成后会收进已完成清单，还可以把它继续写成一段回忆。",
      confirmText: "一起完成了",
    });
    if (!result.confirm) return;

    const completedAt = new Date().toISOString();
    const next = wishInput(wish, {
      status: "completed",
      completedAt,
      completedBy: session?.user.displayName || session?.user.username || "我们",
    });
    setWorkingId(wish.id);
    try {
      await updateWish(wish.id, next);
      setWishes((current) => current.map((item) => (
        item.id === wish.id ? { ...item, ...next, updatedAt: completedAt } : item
      )));
      Taro.showToast({ title: "愿望实现啦", icon: "success" });
    } catch {
      setStatus("愿望状态没有保存成功，请稍后再试。");
    } finally {
      setWorkingId("");
    }
  };

  const restoreWish = async (wish: Wish) => {
    if (workingId) return;
    const next = wishInput(wish, {
      status: "planned",
      completedAt: undefined,
      completedBy: undefined,
    });
    setWorkingId(wish.id);
    try {
      await updateWish(wish.id, next);
      setWishes((current) => current.map((item) => (
        item.id === wish.id ? { ...item, ...next, updatedAt: new Date().toISOString() } : item
      )));
      Taro.showToast({ title: "已放回待实现", icon: "success" });
    } catch {
      setStatus("愿望状态没有保存成功，请稍后再试。");
    } finally {
      setWorkingId("");
    }
  };

  const removeWish = async (wish: Wish) => {
    if (workingId) return;
    const result = await Taro.showModal({
      title: "删除这个愿望？",
      content: "删除后双方都无法再看到它。",
      confirmText: "删除",
    });
    if (!result.confirm) return;
    setWorkingId(wish.id);
    try {
      await deleteWish(wish.id);
      setWishes((current) => current.filter((item) => item.id !== wish.id));
      Taro.showToast({ title: "已删除", icon: "success" });
    } catch {
      setStatus("删除失败，请稍后再试。");
    } finally {
      setWorkingId("");
    }
  };

  const writeMemory = (wish: Wish) => {
    const completedDate = wish.completedAt ? new Date(wish.completedAt) : new Date();
    const date = Number.isNaN(completedDate.getTime()) ? localDateValue() : localDateValue(completedDate);
    const text = [
      `我们一起完成了「${wish.title}」。`,
      wish.description,
    ].filter(Boolean).join("\n");
    const query = [
      ["date", date],
      ["title", `完成愿望 · ${wish.title}`],
      ["text", text],
      ["tags", "共同愿望"],
    ].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
    Taro.navigateTo({ url: `/pages/memory-editor/index?${query}` });
  };

  const filters: Array<{ key: WishFilter; label: string; count: number }> = [
    { key: "planned", label: "待实现", count: plannedCount },
    { key: "completed", label: "已完成", count: completedCount },
    { key: "all", label: "全部", count: wishes.length },
  ];

  return (
    <View className="page wishes-page">
      <AppHeader title="共同愿望" back />

      <View className="wishes-hero">
        <View className="wishes-hero-copy">
          <Text className="wishes-kicker">下一段故事，从期待开始</Text>
          <Text className="wishes-title">还有 {plannedCount} 件事，想和你一起</Text>
          <Text className="wishes-subtitle">双方都可以补充、修改和完成这份清单。</Text>
        </View>
        <View className="wishes-hero-icon">
          <Image src={wishesIcon} mode="aspectFit" />
        </View>
      </View>

      <View className="wishes-progress card">
        <View className="wishes-progress-head">
          <View className="wishes-progress-copy">
            <Text className="wishes-progress-title">我们实现了 {completedCount} 个愿望</Text>
            <Text className="wishes-progress-note">每完成一件，就多一段可以记住的故事。</Text>
          </View>
          <Text className="wishes-progress-value">{progress}%</Text>
        </View>
        <View className="wishes-progress-track">
          <View className="wishes-progress-fill" style={{ width: `${progress}%` }} />
        </View>
      </View>

      <View className="wishes-filters">
        {filters.map((item) => (
          <Button
            className={filter === item.key ? "wishes-filter active" : "wishes-filter"}
            key={item.key}
            onClick={() => setFilter(item.key)}
            aria-label={`${item.label}，${item.count} 个`}
          >
            <Text>{item.label}</Text>
            <Text className="wishes-filter-count">{item.count}</Text>
          </Button>
        ))}
      </View>

      {status && <ErrorBanner copy={status} onRetry={() => void loadWishes()} />}
      {loading && wishes.length === 0 ? (
        <LoadingState compact />
      ) : visibleWishes.length === 0 && !status ? (
        <EmptyState
          title={wishes.length === 0 ? "还没有写下第一个愿望" : filter === "completed" ? "愿望正在路上" : "这里暂时是空的"}
          copy={wishes.length === 0 ? "一场旅行、一顿饭，或者一件想一起完成的小事，都可以从这里开始。" : filter === "completed" ? "完成一件愿望后，它会带着日期留在这里。" : "换一个分类继续看看。"}
          actionLabel={wishes.length === 0 ? "写第一个愿望" : undefined}
          onAction={wishes.length === 0 ? () => openEditor() : undefined}
        />
      ) : (
        <View className="wishes-list">
          {visibleWishes.map((wish, index) => {
            const completed = wish.status === "completed";
            return (
              <View className={completed ? "wish-card card completed" : "wish-card card"} key={wish.id}>
                <View className="wish-card-head">
                  <Button
                    className={completed ? "wish-state completed" : "wish-state"}
                    disabled={workingId === wish.id}
                    aria-label={completed ? "放回待实现愿望" : "标记愿望已完成"}
                    onClick={() => void (completed ? restoreWish(wish) : completeWish(wish))}
                  >
                    {completed ? "✓" : String(index + 1).padStart(2, "0")}
                  </Button>
                  <View className="wish-card-heading">
                    <Text className="wish-card-title">{wish.title}</Text>
                    <Text className={completed ? "wish-card-date completed" : "wish-card-date"}>{targetCopy(wish)}</Text>
                  </View>
                </View>

                {wish.description && <Text className="wish-card-description">{wish.description}</Text>}

                {completed && wish.completedBy && (
                  <Text className="wish-completed-by">由 {wish.completedBy} 收进已完成清单</Text>
                )}

                <View className="wish-card-actions">
                  {completed && (
                    <Button className="wish-action memory" onClick={() => writeMemory(wish)}>
                      <Image className="wish-action-icon" src={imagesIcon} mode="aspectFit" />
                      <Text>写成回忆</Text>
                    </Button>
                  )}
                  <Button className="wish-action" onClick={() => openEditor(wish.id)}>编辑</Button>
                  <Button
                    className="wish-action danger"
                    disabled={workingId === wish.id}
                    aria-label="删除愿望"
                    onClick={() => void removeWish(wish)}
                  >
                    <Image className="wish-action-icon" src={trashIcon} mode="aspectFit" />
                    <Text>删除</Text>
                  </Button>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Button className="wish-create-fab" onClick={() => openEditor()}>
        <Text className="wish-create-plus">＋</Text>
        <Text className="wish-create-label">写愿望</Text>
      </Button>
    </View>
  );
}
