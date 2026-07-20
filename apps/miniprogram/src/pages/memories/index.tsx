import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Text, View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import type { Memory } from "@map-of-us/shared";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import { apiBaseUrl, getMemories, readSession, resolveAssetUrl } from "../../lib/api";
import "./index.scss";

function displayDate(value: string) {
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  return `${parts[1]}.${parts[2]} / ${parts[0]}`;
}

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const loadMemories = useCallback(async () => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const data = await getMemories();
      setMemories(Object.values(data.memories).flat());
    } catch {
      setStatus("暂时没有同步到回忆，请检查网络后再试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  usePullDownRefresh(() => {
    void loadMemories().finally(() => Taro.stopPullDownRefresh());
  });

  const sorted = useMemo(
    () => [...memories].sort((a, b) => b.date.localeCompare(a.date)),
    [memories],
  );

  return (
    <View className="page memories-page">
      <AppHeader title="回忆" />

      <View className="screen-intro memory-intro">
        <View className="memory-intro-copy">
          <Text className="screen-title">一起走过的路</Text>
          <Text className="screen-subtitle">照片、地点和当时想说的话。</Text>
        </View>
        <View className="memory-count">
          <Text className="memory-count-value">{sorted.length}</Text>
          <Text className="memory-count-label">段回忆</Text>
        </View>
      </View>

      {status && <ErrorBanner copy={status} onRetry={loadMemories} />}
      {loading && sorted.length === 0 ? (
        <LoadingState />
      ) : sorted.length === 0 && !status ? (
        <EmptyState title="第一段回忆还没写下" copy="先在网页端添加照片和故事，小程序会自动同步到这里。" />
      ) : (
        <View className="memory-list">
          {sorted.map((memory) => (
            <View className="memory-card card" key={memory.id}>
              {memory.image ? (
                <Image
                  className="memory-cover"
                  src={resolveAssetUrl(memory.image, apiBaseUrl)}
                  mode="aspectFill"
                  lazyLoad
                />
              ) : (
                <View className="memory-cover memory-placeholder">
                  <Text className="memory-placeholder-place">{memory.city || "回忆"}</Text>
                  <Text className="memory-placeholder-copy">那天没有留下照片，但留下了故事。</Text>
                </View>
              )}
              <View className="memory-body">
                <Text className="memory-date">{displayDate(memory.date)}</Text>
                <Text className="memory-title">{memory.title || memory.city || "未命名回忆"}</Text>
                {(memory.city || memory.placeName) && (
                  <View className="memory-place-row">
                    <Text className="memory-place-mark">⌖</Text>
                    <Text className="memory-place">{[memory.city, memory.placeName].filter(Boolean).join(" · ")}</Text>
                  </View>
                )}
                {memory.text && <Text className="memory-text">{memory.text}</Text>}
                {(memory.mood || memory.tags?.length) && (
                  <View className="tag-row">
                    {memory.mood && <Text className="tag tag-mood">{memory.mood}</Text>}
                    {memory.tags?.slice(0, 3).map((tag) => (
                      <Text className="tag" key={`${memory.id}-${tag}`}>#{tag}</Text>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
