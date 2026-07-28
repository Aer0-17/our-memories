import { useCallback, useMemo, useState } from "react";
import { Button, Image, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import type { Memory } from "@map-of-us/shared";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import { apiBaseUrl, getMemories, readSession, resolveAssetUrl } from "../../lib/api";
import "./index.scss";

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type RankItem = {
  label: string;
  count: number;
};

type MonthSummary = {
  month: number;
  memories: Memory[];
  photoCount: number;
  barHeight: number;
};

type Highlight = {
  key: string;
  label: string;
  memory: Memory;
};

function flattenMemories(store: Record<string, Memory[]>) {
  return Object.values(store).flat();
}

function dateParts(value: string): DateParts | null {
  const [year, month, day] = value.slice(0, 10).replace(/\./g, "-").split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;
  return { year, month, day };
}

function displayDate(value: string) {
  const parts = dateParts(value);
  if (!parts) return value;
  return `${parts.month} 月 ${parts.day} 日`;
}

function memoryPhotos(memory: Memory) {
  const photos = memory.photos?.length ? memory.photos : memory.image ? [memory.image] : [];
  return Array.from(new Set(photos.filter(Boolean)));
}

function rankValues(values: string[], limit = 4): RankItem[] {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const label = value.trim();
    if (label) counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"))
    .slice(0, limit);
}

function yearlyHighlights(memories: Memory[]): Highlight[] {
  if (memories.length === 0) return [];
  const chronological = [...memories].sort((a, b) => a.date.localeCompare(b.date));
  const richest = [...memories].sort((a, b) => (
    memoryPhotos(b).length - memoryPhotos(a).length || b.date.localeCompare(a.date)
  ))[0];
  const candidates: Highlight[] = [];
  if (richest && memoryPhotos(richest).length > 0) {
    candidates.push({ key: "photos", label: "照片最多的一页", memory: richest });
  }
  candidates.push({ key: "first", label: "这一年的第一页", memory: chronological[0] });
  if (chronological.length > 1) {
    candidates.push({
      key: "latest",
      label: "这一年最近的一页",
      memory: chronological[chronological.length - 1],
    });
  }

  const seen = new Set<string>();
  return candidates.filter((highlight) => {
    if (seen.has(highlight.memory.id)) return false;
    seen.add(highlight.memory.id);
    return true;
  });
}

export default function YearbookPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const loadMemories = useCallback(async (background = false) => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!background) setLoading(true);
    setStatus("");
    try {
      const data = await getMemories();
      const items = flattenMemories(data.memories);
      const years = Array.from(new Set(items.flatMap((memory) => {
        const parts = dateParts(memory.date);
        return parts ? [parts.year] : [];
      }))).sort((a, b) => b - a);
      setMemories(items);
      setSelectedYear((current) => current && years.includes(current) ? current : years[0] || null);
    } catch {
      setStatus("回忆年鉴暂时没有同步成功，请检查网络后再试。");
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void loadMemories(Boolean(memories.length));
  });

  usePullDownRefresh(() => {
    void loadMemories(true).finally(() => Taro.stopPullDownRefresh());
  });

  const years = useMemo(() => Array.from(new Set(memories.flatMap((memory) => {
    const parts = dateParts(memory.date);
    return parts ? [parts.year] : [];
  }))).sort((a, b) => b - a), [memories]);

  const yearMemories = useMemo(() => memories
    .filter((memory) => dateParts(memory.date)?.year === selectedYear)
    .sort((a, b) => b.date.localeCompare(a.date)), [memories, selectedYear]);

  const monthSummaries = useMemo<MonthSummary[]>(() => {
    const groups = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      memories: [] as Memory[],
      photoCount: 0,
      barHeight: 8,
    }));
    yearMemories.forEach((memory) => {
      const parts = dateParts(memory.date);
      if (!parts) return;
      const group = groups[parts.month - 1];
      group.memories.push(memory);
      group.photoCount += memoryPhotos(memory).length;
    });
    const maxCount = Math.max(1, ...groups.map((group) => group.memories.length));
    return groups.map((group) => ({
      ...group,
      barHeight: group.memories.length === 0
        ? 8
        : 16 + Math.round((group.memories.length / maxCount) * 12) * 4,
    }));
  }, [yearMemories]);

  const photoCount = useMemo(
    () => yearMemories.reduce((total, memory) => total + memoryPhotos(memory).length, 0),
    [yearMemories],
  );
  const cityCount = useMemo(
    () => new Set(yearMemories.map((memory) => memory.cityId || memory.city).filter(Boolean)).size,
    [yearMemories],
  );
  const memoryDayCount = useMemo(
    () => new Set(yearMemories.map((memory) => memory.date.slice(0, 10))).size,
    [yearMemories],
  );
  const activeMonthCount = useMemo(
    () => monthSummaries.filter((month) => month.memories.length > 0).length,
    [monthSummaries],
  );
  const topCities = useMemo(
    () => rankValues(yearMemories.map((memory) => memory.city || "")),
    [yearMemories],
  );
  const topMoods = useMemo(
    () => rankValues(yearMemories.map((memory) => memory.mood || "")),
    [yearMemories],
  );
  const topTags = useMemo(
    () => rankValues(yearMemories.flatMap((memory) => memory.tags || [])),
    [yearMemories],
  );
  const highlights = useMemo(() => yearlyHighlights(yearMemories), [yearMemories]);
  const selectedMonthSummary = selectedMonth
    ? monthSummaries.find((month) => month.month === selectedMonth) || null
    : null;

  const selectYear = (year: number) => {
    setSelectedYear(year);
    setSelectedMonth(null);
  };

  const openMemory = (memoryId: string) => {
    Taro.navigateTo({ url: `/pages/memory-detail/index?id=${encodeURIComponent(memoryId)}` });
  };

  const marks = [
    { key: "cities", title: "常去的城市", empty: "还没有城市", prefix: "", items: topCities },
    { key: "moods", title: "这一年的心情", empty: "还没有心情", prefix: "", items: topMoods },
    { key: "tags", title: "我们的暗号", empty: "还没有暗号", prefix: "#", items: topTags },
  ];

  return (
    <View className="page yearbook-page">
      <AppHeader title="回忆年鉴" back />

      {status && <ErrorBanner copy={status} onRetry={() => void loadMemories()} />}
      {loading && memories.length === 0 ? (
        <LoadingState />
      ) : years.length === 0 && !status ? (
        <EmptyState
          title="年鉴还没有第一页"
          copy="写下一段回忆后，这里会自动整理城市、月份和属于你们的暗号。"
          actionLabel="去记录回忆"
          onAction={() => Taro.switchTab({ url: "/pages/memories/index" })}
        />
      ) : (
        <View className="yearbook-content">
          <View className="yearbook-intro">
            <View className="yearbook-intro-copy">
              <Text className="yearbook-kicker">我们的故事年表</Text>
              <Text className="yearbook-title">{selectedYear} 年，我们这样走过</Text>
              <Text className="yearbook-subtitle">只统计当前账号可以看见的回忆。</Text>
            </View>
          </View>

          <ScrollView className="yearbook-year-scroll" scrollX enableFlex={false} showScrollbar={false}>
            <View className="yearbook-year-row">
              {years.map((year) => (
                <Button
                  className={selectedYear === year ? "yearbook-year active" : "yearbook-year"}
                  key={year}
                  onClick={() => selectYear(year)}
                >
                  {year}
                </Button>
              ))}
            </View>
          </ScrollView>

          <View className="yearbook-overview card">
            <View className="yearbook-overview-lead">
              <Text className="yearbook-overview-value">{yearMemories.length}</Text>
              <View className="yearbook-overview-copy">
                <Text className="yearbook-overview-label">段回忆</Text>
                <Text className="yearbook-overview-note">被认真留在这一年</Text>
              </View>
            </View>
            <View className="yearbook-metrics">
              <View className="yearbook-metric">
                <Text className="yearbook-metric-value">{photoCount}</Text>
                <Text className="yearbook-metric-label">张照片</Text>
              </View>
              <View className="yearbook-metric">
                <Text className="yearbook-metric-value">{cityCount}</Text>
                <Text className="yearbook-metric-label">座城市</Text>
              </View>
              <View className="yearbook-metric">
                <Text className="yearbook-metric-value">{memoryDayCount}</Text>
                <Text className="yearbook-metric-label">个日子</Text>
              </View>
              <View className="yearbook-metric">
                <Text className="yearbook-metric-value">{activeMonthCount}</Text>
                <Text className="yearbook-metric-label">个月份</Text>
              </View>
            </View>
          </View>

          <View className="yearbook-section card">
            <View className="yearbook-section-heading">
              <View className="yearbook-section-copy">
                <Text className="yearbook-section-title">十二个月的轨迹</Text>
                <Text className="yearbook-section-subtitle">点一个月份，翻开当月故事。</Text>
              </View>
              {selectedMonth && (
                <Button className="yearbook-section-action" onClick={() => setSelectedMonth(null)}>
                  回到全年
                </Button>
              )}
            </View>
            <ScrollView className="yearbook-month-scroll" scrollX enableFlex={false} showScrollbar={false}>
              <View className="yearbook-month-row">
                {monthSummaries.map((month) => (
                  <Button
                    className={selectedMonth === month.month ? "yearbook-month active" : "yearbook-month"}
                    key={month.month}
                    onClick={() => setSelectedMonth(month.month)}
                  >
                    <Text className="yearbook-month-count">{month.memories.length || "·"}</Text>
                    <View className="yearbook-month-track">
                      <View
                        className={month.memories.length ? "yearbook-month-bar filled" : "yearbook-month-bar"}
                        style={{ height: `${month.barHeight}px` }}
                      />
                    </View>
                    <Text className="yearbook-month-label">{month.month}月</Text>
                  </Button>
                ))}
              </View>
            </ScrollView>
          </View>

          {selectedMonthSummary && (
            <View className="yearbook-section card">
              <View className="yearbook-section-heading">
                <View className="yearbook-section-copy">
                  <Text className="yearbook-section-title">{selectedMonthSummary.month} 月的故事</Text>
                  <Text className="yearbook-section-subtitle">
                    {selectedMonthSummary.memories.length > 0
                      ? `${selectedMonthSummary.memories.length} 段回忆 · ${selectedMonthSummary.photoCount} 张照片`
                      : "这个月还没有留下回忆。"}
                  </Text>
                </View>
              </View>
              {selectedMonthSummary.memories.length > 0 ? (
                <View className="yearbook-story-list">
                  {selectedMonthSummary.memories.map((memory) => (
                    <Button className="yearbook-story" key={memory.id} onClick={() => openMemory(memory.id)}>
                      {memoryPhotos(memory)[0] ? (
                        <Image
                          className="yearbook-story-cover"
                          src={resolveAssetUrl(memoryPhotos(memory)[0], apiBaseUrl)}
                          mode="aspectFill"
                          lazyLoad
                        />
                      ) : (
                        <View className="yearbook-story-cover yearbook-story-placeholder">
                          {memory.city?.slice(0, 1) || "忆"}
                        </View>
                      )}
                      <View className="yearbook-story-copy">
                        <Text className="yearbook-story-date">{displayDate(memory.date)}</Text>
                        <Text className="yearbook-story-title">{memory.title || memory.city || "未命名回忆"}</Text>
                        <Text className="yearbook-story-place">
                          {[memory.city, memory.placeName].filter(Boolean).join(" · ") || "留在那一天的故事"}
                        </Text>
                      </View>
                      <Text className="yearbook-story-arrow">›</Text>
                    </Button>
                  ))}
                </View>
              ) : (
                <View className="yearbook-month-empty">
                  <Text className="yearbook-month-empty-mark">○</Text>
                  <Text className="yearbook-month-empty-copy">空着也没关系，故事有自己的季节。</Text>
                </View>
              )}
            </View>
          )}

          <View className="yearbook-section card">
            <View className="yearbook-section-copy">
              <Text className="yearbook-section-title">这一年的印记</Text>
              <Text className="yearbook-section-subtitle">城市、心情和只有你们懂的词。</Text>
            </View>
            <View className="yearbook-mark-grid">
              {marks.map((mark) => (
                <View className="yearbook-mark" key={mark.key}>
                  <Text className="yearbook-mark-title">{mark.title}</Text>
                  {mark.items.length > 0 ? (
                    <View className="yearbook-mark-items">
                      {mark.items.map((item) => (
                        <View className="yearbook-mark-item" key={`${mark.key}-${item.label}`}>
                          <Text className="yearbook-mark-label">{mark.prefix}{item.label}</Text>
                          <Text className="yearbook-mark-count">{item.count}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text className="yearbook-mark-empty">{mark.empty}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>

          <View className="yearbook-section card">
            <View className="yearbook-section-copy">
              <Text className="yearbook-section-title">高光页码</Text>
              <Text className="yearbook-section-subtitle">从这一年里，替你们夹好几张书签。</Text>
            </View>
            <View className="yearbook-highlight-list">
              {highlights.map((highlight, index) => (
                <Button
                  className="yearbook-highlight"
                  key={`${highlight.key}-${highlight.memory.id}`}
                  onClick={() => openMemory(highlight.memory.id)}
                >
                  <Text className="yearbook-highlight-index">{String(index + 1).padStart(2, "0")}</Text>
                  <View className="yearbook-highlight-copy">
                    <Text className="yearbook-highlight-label">{highlight.label}</Text>
                    <Text className="yearbook-highlight-title">
                      {highlight.memory.title || highlight.memory.city || "未命名回忆"}
                    </Text>
                    <Text className="yearbook-highlight-meta">
                      {displayDate(highlight.memory.date)}
                      {highlight.memory.city ? ` · ${highlight.memory.city}` : ""}
                    </Text>
                  </View>
                  <Text className="yearbook-highlight-arrow">›</Text>
                </Button>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
