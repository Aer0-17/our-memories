import { useCallback, useMemo, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useRouter } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { ErrorBanner, LoadingState } from "../../components/PageStates";
import {
  deleteTripGuide,
  getTripGuides,
  readSession,
  updateTripGuide,
  type TripGuide,
  type TripGuidePayload,
} from "../../lib/api";
import {
  normalizedTripPlans,
  tripDateRange,
  tripDisplayDate,
  tripProgress,
} from "../../lib/trips";
import "./index.scss";

function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function TripDetailPage() {
  const router = useRouter();
  const tripId = typeof router.params.id === "string" ? router.params.id : "";
  const [guide, setGuide] = useState<TripGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [workingKey, setWorkingKey] = useState("");

  const loadGuide = useCallback(async (background = false) => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!tripId) {
      setStatus("没有找到要查看的旅行计划。");
      setLoading(false);
      return;
    }
    if (!background) setLoading(true);
    setStatus("");
    try {
      const data = await getTripGuides();
      const current = (data.guides || []).find((item) => item.id === tripId);
      if (!current) throw new Error("Trip guide not found");
      setGuide(current);
    } catch {
      setStatus("旅行详情暂时没有同步成功，请稍后再试。");
    } finally {
      if (!background) setLoading(false);
    }
  }, [tripId]);

  useDidShow(() => {
    void loadGuide(Boolean(guide));
  });

  usePullDownRefresh(() => {
    void loadGuide(true).finally(() => Taro.stopPullDownRefresh());
  });

  const plans = useMemo(() => guide ? normalizedTripPlans(guide.payload) : [], [guide]);
  const progress = useMemo(() => guide ? tripProgress(guide.payload) : { total: 0, done: 0, percent: 0 }, [guide]);

  const savePayload = async (payload: TripGuidePayload, key: string, fallback: string) => {
    if (!guide || workingKey) return false;
    const previous = guide;
    const optimistic = { ...guide, payload, updatedAt: new Date().toISOString() };
    setWorkingKey(key);
    setStatus("");
    setGuide(optimistic);
    try {
      const response = await updateTripGuide(guide.id, payload);
      setGuide(response.guide);
      return true;
    } catch {
      setGuide(previous);
      setStatus(fallback);
      return false;
    } finally {
      setWorkingKey("");
    }
  };

  const toggleCheckpoint = async (day: number, checkpointId: string) => {
    if (!guide || workingKey) return;
    const daysPlan = normalizedTripPlans(guide.payload).map((plan) => (
      plan.day === day
        ? {
          ...plan,
          checkpoints: plan.checkpoints.map((checkpoint) => (
            checkpoint.id === checkpointId ? { ...checkpoint, done: !checkpoint.done } : checkpoint
          )),
        }
        : plan
    ));
    const checkpoint = daysPlan
      .flatMap((plan) => plan.checkpoints)
      .find((item) => item.id === checkpointId);
    const saved = await savePayload(
      { ...guide.payload, daysPlan },
      checkpointId,
      "这次打卡没有保存成功，请检查网络后再试。",
    );
    if (saved) Taro.showToast({ title: checkpoint?.done ? "一起打卡啦" : "已取消打卡", icon: "success" });
  };

  const toggleCompleted = async () => {
    if (!guide || workingKey) return;
    const completed = guide.payload.status === "completed";
    if (!completed) {
      const result = await Taro.showModal({
        title: "这段旅程完成了吗？",
        content: progress.total > progress.done
          ? `还有 ${progress.total - progress.done} 个地点没打卡，也可以先把旅程收好。`
          : "完成后可以把整段旅程继续写成一条回忆。",
        confirmText: "已经出发过",
      });
      if (!result.confirm) return;
    }
    const saved = await savePayload(
      { ...guide.payload, status: completed ? "planning" : "completed", daysPlan: plans },
      "trip-status",
      "旅行状态没有保存成功，请稍后再试。",
    );
    if (saved) Taro.showToast({ title: completed ? "已放回计划中" : "旅程完成啦", icon: "success" });
  };

  const removeGuide = async () => {
    if (!guide || workingKey) return;
    const result = await Taro.showModal({
      title: "删除这份旅行计划？",
      content: "删除后双方都无法再看到行程和打卡记录。",
      confirmText: "删除",
    });
    if (!result.confirm) return;
    setWorkingKey("delete");
    try {
      await deleteTripGuide(guide.id);
      Taro.showToast({ title: "已删除", icon: "success" });
      setTimeout(() => Taro.navigateBack(), 300);
    } catch {
      setStatus("旅行计划没有删除成功，请稍后再试。");
      setWorkingKey("");
    }
  };

  const writeMemory = () => {
    if (!guide) return;
    const payload = guide.payload;
    const stops = plans.flatMap((plan) => plan.checkpoints.map((checkpoint) => checkpoint.name));
    const text = [
      `我们一起完成了「${payload.title}」。`,
      [payload.origin, payload.destination].filter(Boolean).join(" → "),
      stops.length ? `沿途去了：${stops.join("、")}` : "",
      payload.notes || "",
    ].filter(Boolean).join("\n");
    const query = [
      ["date", payload.endDate || payload.startDate || localDateValue()],
      ["title", `共同旅行 · ${payload.title}`],
      ["text", text],
      ["tags", "共同旅行"],
    ].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
    Taro.navigateTo({ url: `/pages/memory-editor/index?${query}` });
  };

  return (
    <View className="page trip-detail-page">
      <AppHeader title="旅行详情" back />

      {status && <ErrorBanner copy={status} onRetry={() => void loadGuide()} />}
      {loading && !guide ? (
        <LoadingState />
      ) : guide ? (
        <View className="trip-detail-content">
          <View className={guide.payload.status === "completed" ? "trip-detail-hero completed" : "trip-detail-hero"}>
            <Text className="trip-detail-kicker">
              {guide.payload.status === "completed" ? "这段路已经走进回忆" : "两个人的下一站"}
            </Text>
            <Text className="trip-detail-title">{guide.payload.title}</Text>
            <Text className="trip-detail-route">
              {[guide.payload.origin, guide.payload.destination].filter(Boolean).join(" → ") || guide.payload.destination}
            </Text>
            <Text className="trip-detail-date">{tripDateRange(guide.payload)}</Text>
            <View className="trip-detail-progress-row">
              <View className="trip-detail-progress-track">
                <View className="trip-detail-progress-fill" style={{ width: `${progress.percent}%` }} />
              </View>
              <Text className="trip-detail-progress-value">{progress.percent}%</Text>
            </View>
            <Text className="trip-detail-progress-copy">
              {progress.total ? `${progress.done} / ${progress.total} 个沿途安排已完成` : "沿途安排还可以慢慢补充"}
            </Text>
          </View>

          {guide.payload.notes && (
            <View className="trip-detail-note card">
              <Text className="trip-detail-section-label">写在出发前</Text>
              <Text className="trip-detail-note-copy">{guide.payload.notes}</Text>
            </View>
          )}

          <View className="trip-itinerary">
            <View className="trip-detail-section-heading">
              <View>
                <Text className="trip-detail-section-title">每日行程</Text>
                <Text className="trip-detail-section-subtitle">点一下沿途安排，两个人看到的进度会一起更新。</Text>
              </View>
              <Text className="trip-detail-section-count">{plans.length} 天</Text>
            </View>

            {plans.map((plan) => (
              <View className="trip-day-card" key={plan.day}>
                <View className="trip-day-heading">
                  <View className="trip-day-number"><Text>{plan.day}</Text></View>
                  <View className="trip-day-heading-copy">
                    <Text className="trip-day-title">第 {plan.day} 天</Text>
                    <Text className="trip-day-date">{plan.date ? tripDisplayDate(plan.date) : "日期待定"}</Text>
                  </View>
                  <Text className="trip-day-progress">
                    {plan.checkpoints.filter((checkpoint) => checkpoint.done).length}/{plan.checkpoints.length}
                  </Text>
                </View>

                {plan.checkpoints.length ? (
                  <View className="trip-checkpoint-list">
                    {plan.checkpoints.map((checkpoint) => (
                      <Button
                        className={checkpoint.done ? "trip-checkpoint done" : "trip-checkpoint"}
                        key={checkpoint.id}
                        disabled={Boolean(workingKey && workingKey !== checkpoint.id)}
                        onClick={() => void toggleCheckpoint(plan.day, checkpoint.id)}
                      >
                        <View className="trip-checkpoint-mark"><Text>{checkpoint.done ? "✓" : ""}</Text></View>
                        <Text className="trip-checkpoint-name">{checkpoint.name}</Text>
                        <Text className="trip-checkpoint-state">
                          {workingKey === checkpoint.id ? "同步中" : checkpoint.done ? "已到达" : "待打卡"}
                        </Text>
                      </Button>
                    ))}
                  </View>
                ) : (
                  <Text className="trip-day-empty">这一天还没有安排，双方都可以去编辑页补充。</Text>
                )}
              </View>
            ))}
          </View>

          <View className="trip-detail-actions">
            <Button
              className="btn trip-detail-primary"
              disabled={Boolean(workingKey)}
              loading={workingKey === "trip-status"}
              onClick={() => void toggleCompleted()}
            >
              {guide.payload.status === "completed" ? "重新放回计划中" : "我们已经完成这段旅行"}
            </Button>
            {guide.payload.status === "completed" && (
              <Button className="btn btn-secondary trip-detail-secondary" onClick={writeMemory}>
                把这段旅行写成回忆
              </Button>
            )}
            <Button
              className="btn btn-secondary trip-detail-secondary"
              disabled={Boolean(workingKey)}
              onClick={() => Taro.navigateTo({ url: `/pages/trip-editor/index?id=${encodeURIComponent(guide.id)}` })}
            >
              共同编辑行程
            </Button>
            <Button className="trip-detail-delete" disabled={Boolean(workingKey)} onClick={() => void removeGuide()}>
              {workingKey === "delete" ? "正在删除…" : "删除这份旅行计划"}
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}
