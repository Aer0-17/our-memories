import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Text, View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import type { Memory } from "@map-of-us/shared";
import { getMemories, readSession } from "../../lib/api";
import "./index.scss";

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
      setStatus("回忆读取失败，请重新登录后再试。");
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
      <View className="page-head">
        <Text className="title">回忆记录</Text>
        <Text className="subtitle">{loading ? "同步中..." : `${sorted.length} 条 · 按时间排列`}</Text>
      </View>
      {status && <Text className="status">{status}</Text>}
      {sorted.length === 0 ? (
        <View className="empty card">
          <Text className="empty-title">还没有回忆</Text>
          <Text className="empty-copy">先在 Web 或 App 的地图里添加第一段回忆。</Text>
        </View>
      ) : (
        <View className="memory-list">
          {sorted.map((memory) => (
            <View className="memory-card card" key={memory.id}>
              {memory.image && <Image className="memory-cover" src={memory.image} mode="aspectFill" />}
              <View className="memory-body">
                <View className="memory-row">
                  <Text className="memory-title">{memory.title || memory.city}</Text>
                  <Text className="memory-date">{memory.date}</Text>
                </View>
                {(memory.title || memory.placeName) && (
                  <Text className="memory-place">{[memory.city, memory.placeName].filter(Boolean).join(" · ")}</Text>
                )}
                <Text className="memory-text">{memory.text}</Text>
                {(memory.mood || memory.tags?.length) && (
                  <View className="tag-row">
                    {memory.mood && <Text className="tag mood">{memory.mood}</Text>}
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
