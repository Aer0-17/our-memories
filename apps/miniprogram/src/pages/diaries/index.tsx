import { useCallback, useMemo, useState } from "react";
import { Button, Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import { deleteDiary, getDiaries, readSession, type Diary } from "../../lib/api";
import { cityById } from "../../data/geo";
import calendarIcon from "../../assets/lucide/calendar-days.svg";
import imagesIcon from "../../assets/lucide/images.svg";
import trashIcon from "../../assets/lucide/trash-2.svg";
import "./index.scss";

function displayDate(value: string) {
  const parts = value.replace(/\./g, "-").split("-");
  if (parts.length !== 3) return value || "未设置日期";
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

function diaryCity(diary: Diary) {
  return cityById.get(diary.cityId)?.name || "未设置城市";
}

export default function DiariesPage() {
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const loadDiaries = useCallback(async () => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      setDiaries(await getDiaries());
    } catch {
      setStatus("暂时没有同步到日记，请检查网络后再试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void loadDiaries();
  });

  usePullDownRefresh(() => {
    void loadDiaries().finally(() => Taro.stopPullDownRefresh());
  });

  const sorted = useMemo(
    () => [...diaries].sort((a, b) => b.date.localeCompare(a.date)),
    [diaries],
  );
  const cityCount = new Set(diaries.map((diary) => diary.cityId).filter(Boolean)).size;
  const editCount = diaries.reduce((total, diary) => total + diary.history.length, 0);

  const openEditor = (id?: string) => {
    const query = id ? `?id=${encodeURIComponent(id)}` : "";
    Taro.navigateTo({ url: `/pages/diary-editor/index${query}` });
  };

  const removeDiary = async (diary: Diary) => {
    if (deletingId) return;
    const result = await Taro.showModal({
      title: "删除这篇日记？",
      content: "删除后双方都无法在日记列表中看到它。",
      confirmText: "删除",
      confirmColor: "#B84D52",
    });
    if (!result.confirm) return;

    setDeletingId(diary.id);
    setStatus("");
    try {
      await deleteDiary(diary.id);
      setDiaries((current) => current.filter((item) => item.id !== diary.id));
      Taro.showToast({ title: "已删除", icon: "success" });
    } catch {
      setStatus("删除失败，请稍后再试。");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <View className="page diaries-page">
      <AppHeader title="双人日记" back />

      <View className="screen-intro diary-intro">
        <View className="diary-intro-copy">
          <Text className="screen-title">把今天写给我们</Text>
          <Text className="screen-subtitle">还没整理成正式回忆的片段，也值得被好好保存。</Text>
        </View>
        <View className="diary-intro-mark">日</View>
      </View>

      <View className="diary-stats card">
        <View className="diary-stat">
          <Text className="diary-stat-value">{diaries.length}</Text>
          <Text className="diary-stat-label">篇日记</Text>
        </View>
        <View className="diary-stat-divider" />
        <View className="diary-stat">
          <Text className="diary-stat-value">{cityCount}</Text>
          <Text className="diary-stat-label">座城市</Text>
        </View>
        <View className="diary-stat-divider" />
        <View className="diary-stat">
          <Text className="diary-stat-value">{editCount}</Text>
          <Text className="diary-stat-label">次共同修改</Text>
        </View>
      </View>

      {status && <ErrorBanner copy={status} onRetry={loadDiaries} />}
      {loading && sorted.length === 0 ? (
        <LoadingState compact />
      ) : sorted.length === 0 && !status ? (
        <EmptyState
          title="第一篇日记还没写下"
          copy="把一件小事、一顿饭，或者今天的心情留在这里。"
          actionLabel="写第一篇日记"
          onAction={() => openEditor()}
        />
      ) : (
        <View className="diary-list">
          {sorted.map((diary) => (
            <View className="diary-card card" key={diary.id}>
              <View className="diary-card-head">
                <View className="diary-card-heading">
                  <Text className="diary-card-title">{diary.title}</Text>
                  <View className="diary-meta-row">
                    <Image className="diary-meta-icon" src={calendarIcon} mode="aspectFit" />
                    <Text className="diary-meta">{displayDate(diary.date)}</Text>
                    <Text className="diary-meta-separator">·</Text>
                    <Text className="diary-meta">{diaryCity(diary)}</Text>
                  </View>
                </View>
                <Text className="diary-card-badge">共同记录</Text>
              </View>

              <Text className="diary-card-body">{diary.body || "这篇日记还没有正文。"}</Text>

              {diary.linkedMemoryId && (
                <View className="diary-linked-memory">
                  <Image className="diary-linked-icon" src={imagesIcon} mode="aspectFit" />
                  <Text className="diary-linked-text">
                    关联回忆：{diary.linkedMemoryTitle || "查看这段回忆"}
                  </Text>
                </View>
              )}

              <View className="diary-card-footer">
                <Text className="diary-history-note">
                  {diary.history.length ? `共同修改过 ${diary.history.length} 次` : "还没有编辑历史"}
                </Text>
                <View className="diary-actions">
                  <Button className="diary-action" onClick={() => openEditor(diary.id)}>编辑</Button>
                  <Button
                    className="diary-action diary-action-danger"
                    disabled={deletingId === diary.id}
                    onClick={() => void removeDiary(diary)}
                    aria-label="删除日记"
                  >
                    <Image className="diary-action-icon" src={trashIcon} mode="aspectFit" />
                    <Text>{deletingId === diary.id ? "删除中" : "删除"}</Text>
                  </Button>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      <Button className="diary-create-fab" onClick={() => openEditor()}>
        <Text className="diary-create-plus">＋</Text>
        <Text className="diary-create-label">写日记</Text>
      </Button>
    </View>
  );
}
