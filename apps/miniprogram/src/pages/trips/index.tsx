import { useCallback, useMemo, useState } from "react";
import { Button, Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import { getTripGuides, readSession, type TripGuide } from "../../lib/api";
import { sortedTripGuides, tripDateRange, tripProgress } from "../../lib/trips";
import tripIcon from "../../assets/lucide/calendar-days.svg";
import "./index.scss";

type TripFilter = "planning" | "completed" | "all";

export default function TripsPage() {
  const [guides, setGuides] = useState<TripGuide[]>([]);
  const [filter, setFilter] = useState<TripFilter>("planning");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const loadGuides = useCallback(async (background = false) => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!background) setLoading(true);
    setStatus("");
    try {
      const data = await getTripGuides();
      setGuides((data.guides || []).filter((guide) => Boolean(guide?.id && guide.payload?.title)));
    } catch {
      setStatus("旅行计划暂时没有同步成功，请检查网络后再试。");
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void loadGuides(Boolean(guides.length));
  });

  usePullDownRefresh(() => {
    void loadGuides(true).finally(() => Taro.stopPullDownRefresh());
  });

  const planningCount = guides.filter((guide) => guide.payload.status !== "completed").length;
  const completedCount = guides.length - planningCount;
  const visibleGuides = useMemo(() => sortedTripGuides(
    filter === "all"
      ? guides
      : guides.filter((guide) => filter === "completed"
        ? guide.payload.status === "completed"
        : guide.payload.status !== "completed"),
  ), [filter, guides]);
  const totalStops = guides.reduce((count, guide) => count + tripProgress(guide.payload).total, 0);
  const completedStops = guides.reduce((count, guide) => count + tripProgress(guide.payload).done, 0);

  const filters: Array<{ key: TripFilter; label: string; count: number }> = [
    { key: "planning", label: "计划中", count: planningCount },
    { key: "completed", label: "已完成", count: completedCount },
    { key: "all", label: "全部", count: guides.length },
  ];

  return (
    <View className="page trips-page">
      <AppHeader title="共同旅行" back />

      <View className="trips-hero">
        <View className="trips-hero-copy">
          <Text className="trips-kicker">下一站，也由两个人一起写</Text>
          <Text className="trips-title">
            {planningCount ? `还有 ${planningCount} 段旅程，正在靠近` : "下一次出发，等你们来计划"}
          </Text>
          <Text className="trips-subtitle">双方都能改行程、补地点，也能一起完成沿途打卡。</Text>
        </View>
        <View className="trips-hero-icon">
          <Image src={tripIcon} mode="aspectFit" />
        </View>
      </View>

      <View className="trips-stats card">
        <View className="trips-stat">
          <Text className="trips-stat-value">{planningCount}</Text>
          <Text className="trips-stat-label">计划中</Text>
        </View>
        <View className="trips-stat-divider" />
        <View className="trips-stat">
          <Text className="trips-stat-value">{completedCount}</Text>
          <Text className="trips-stat-label">已完成</Text>
        </View>
        <View className="trips-stat-divider" />
        <View className="trips-stat">
          <Text className="trips-stat-value">{completedStops}/{totalStops}</Text>
          <Text className="trips-stat-label">沿途打卡</Text>
        </View>
      </View>

      <Button className="btn trips-create" onClick={() => Taro.navigateTo({ url: "/pages/trip-editor/index" })}>
        计划一段新旅程
      </Button>

      <View className="trips-filters">
        {filters.map((item) => (
          <Button
            className={filter === item.key ? "trips-filter active" : "trips-filter"}
            key={item.key}
            aria-label={`${item.label}，${item.count} 个`}
            onClick={() => setFilter(item.key)}
          >
            {item.label} {item.count}
          </Button>
        ))}
      </View>

      {status && <ErrorBanner copy={status} onRetry={() => void loadGuides()} />}
      {loading && guides.length === 0 ? (
        <LoadingState compact />
      ) : visibleGuides.length === 0 && !status ? (
        <EmptyState
          title={guides.length === 0 ? "还没有共同旅行计划" : "这个分类还没有旅程"}
          copy={guides.length === 0 ? "先写下目的地和大致日期，沿途安排可以两个人慢慢补齐。" : "换个分类，看看已经走过或仍在计划的路。"}
          actionLabel={guides.length === 0 ? "计划第一次旅行" : "查看全部旅程"}
          onAction={() => guides.length === 0
            ? Taro.navigateTo({ url: "/pages/trip-editor/index" })
            : setFilter("all")}
        />
      ) : (
        <View className="trip-card-list">
          {visibleGuides.map((guide) => {
            const progress = tripProgress(guide.payload);
            const completed = guide.payload.status === "completed";
            return (
              <Button
                className={completed ? "trip-card completed" : "trip-card"}
                key={guide.id}
                onClick={() => Taro.navigateTo({ url: `/pages/trip-detail/index?id=${encodeURIComponent(guide.id)}` })}
              >
                <View className="trip-card-topline">
                  <Text className="trip-card-status">{completed ? "已经抵达" : "正在计划"}</Text>
                  <Text className="trip-card-days">{Math.max(1, guide.payload.days || 1)} 天</Text>
                </View>
                <Text className="trip-card-title">{guide.payload.title}</Text>
                <Text className="trip-card-route">
                  {[guide.payload.origin, guide.payload.destination].filter(Boolean).join(" → ") || "目的地待补充"}
                </Text>
                <Text className="trip-card-date">{tripDateRange(guide.payload)}</Text>
                <View className="trip-card-progress-row">
                  <View className="trip-card-progress-track">
                    <View className="trip-card-progress-fill" style={{ width: `${progress.percent}%` }} />
                  </View>
                  <Text className="trip-card-progress-copy">
                    {progress.total ? `${progress.done}/${progress.total} 已打卡` : "沿途安排待补充"}
                  </Text>
                </View>
                <Text className="trip-card-arrow">›</Text>
              </Button>
            );
          })}
        </View>
      )}
    </View>
  );
}
