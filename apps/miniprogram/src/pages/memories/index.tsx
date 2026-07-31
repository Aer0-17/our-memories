import { useCallback, useMemo, useState } from "react";
import { Button, Image, Input, Picker, ScrollView, Text, View } from "@tarojs/components";
import type { PickerSelectorProps } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import type { Memory } from "@map-of-us/shared";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import {
  apiBaseUrl,
  createMemoryFavorite,
  deleteMemory,
  deleteMemoryFavorites,
  getMemoryFavorites,
  getMemories,
  readSession,
  resolveAssetUrl,
} from "../../lib/api";
import type { MemoryFavorite } from "../../lib/api";
import imagesIcon from "../../assets/lucide/images.svg";
import "./index.scss";

function displayDate(value: string) {
  const parts = value.replace(/\./g, "-").split("-");
  if (parts.length !== 3) return value;
  return `${parts[1]}.${parts[2]} / ${parts[0]}`;
}

function flattenMemories(store: Record<string, Memory[]>) {
  return Object.values(store).flat();
}

function dateParts(value: string) {
  const [year, month, day] = value.slice(0, 10).replace(/\./g, "-").split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;
  return { year, month, day, date };
}

function localDayKey(now: Date) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function dailyReunionMemory(memories: Memory[], spaceId: string, now = new Date()) {
  const shared = memories
    .filter((memory) => memory.visibility === "both")
    .sort((a, b) => a.id.localeCompare(b.id));
  if (shared.length === 0) return null;

  const today = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  const sameDay = shared.filter((memory) => {
    const parts = dateParts(memory.date);
    return Boolean(
      parts &&
      parts.year < today.year &&
      parts.month === today.month &&
      parts.day === today.day,
    );
  });
  const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const olderMemories = shared.filter((memory) => {
    const parts = dateParts(memory.date);
    return Boolean(parts && parts.date.getTime() <= thirtyDaysAgo);
  });
  const candidates = sameDay.length > 0
    ? sameDay
    : olderMemories.length > 0
      ? olderMemories
      : shared;
  const index = stableHash(`${localDayKey(now)}:${spaceId}`) % candidates.length;
  const memory = candidates[index];
  const memoryDate = dateParts(memory.date);
  const daysAgo = memoryDate
    ? Math.max(0, Math.floor((now.getTime() - memoryDate.date.getTime()) / (24 * 60 * 60 * 1000)))
    : 0;
  const sameDayYears = memoryDate && memoryDate.month === today.month && memoryDate.day === today.day
    ? today.year - memoryDate.year
    : 0;
  const ageLabel = sameDayYears > 0
    ? `${sameDayYears} 年前的今天`
    : daysAgo >= 365
      ? `${Math.floor(daysAgo / 365)} 年前`
      : daysAgo >= 30
        ? `${Math.floor(daysAgo / 30)} 个月前`
        : `${Math.max(daysAgo, 1)} 天前`;

  return { memory, ageLabel, sharedCount: shared.length };
}

type MemoryViewMode = "cards" | "timeline";

type MemoryTimelineGroup = {
  key: string;
  label: string;
  memories: Memory[];
};

function groupMemoriesByMonth(memories: Memory[]): MemoryTimelineGroup[] {
  const groups = new Map<string, MemoryTimelineGroup>();
  memories.forEach((memory) => {
    const parts = dateParts(memory.date);
    const key = parts
      ? `${parts.year}-${String(parts.month).padStart(2, "0")}`
      : "unknown";
    const label = parts ? `${parts.year} 年 ${parts.month} 月` : "日期未明";
    const current = groups.get(key);
    if (current) {
      current.memories.push(memory);
    } else {
      groups.set(key, { key, label, memories: [memory] });
    }
  });
  return [...groups.values()];
}

function timelineDay(value: string) {
  const parts = dateParts(value);
  return parts ? String(parts.day).padStart(2, "0") : "--";
}

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [favoriteRecords, setFavoriteRecords] = useState<MemoryFavorite[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [favoriteWorkingId, setFavoriteWorkingId] = useState("");
  const [lastWanderId, setLastWanderId] = useState("");
  const [viewMode, setViewMode] = useState<MemoryViewMode>("cards");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [moodFilter, setMoodFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  const loadMemories = useCallback(async () => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const [memoryResult, favoriteResult] = await Promise.allSettled([
        getMemories(),
        getMemoryFavorites(),
      ]);
      if (memoryResult.status === "rejected") throw memoryResult.reason;
      setMemories(flattenMemories(memoryResult.value.memories));
      if (favoriteResult.status === "fulfilled") {
        setFavoriteRecords(favoriteResult.value);
      } else {
        setFavoriteRecords([]);
        setStatus("回忆已同步，但共同收藏暂时没有同步成功。");
      }
    } catch {
      setStatus("暂时没有同步到回忆，请检查网络后再试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void loadMemories();
  });

  usePullDownRefresh(() => {
    void loadMemories().finally(() => Taro.stopPullDownRefresh());
  });

  const sorted = useMemo(
    () => [...memories].sort((a, b) => b.date.localeCompare(a.date)),
    [memories],
  );
  const favoriteMemoryIds = useMemo(
    () => new Set(favoriteRecords.map((favorite) => favorite.memoryId)),
    [favoriteRecords],
  );
  const favoriteCount = useMemo(
    () => sorted.filter((memory) => favoriteMemoryIds.has(memory.id)).length,
    [favoriteMemoryIds, sorted],
  );
  const session = readSession();
  const dailyReunion = useMemo(
    () => dailyReunionMemory(sorted, session?.space.id || "our-space"),
    [session?.space.id, sorted],
  );

  const cityOptions = useMemo(
    () => Array.from(
      new Map(
        sorted
          .filter((memory) => memory.cityId && memory.city)
          .map((memory) => [memory.cityId!, { id: memory.cityId!, name: memory.city! }] as const),
      ).values(),
    ),
    [sorted],
  );
  const moodOptions = useMemo(
    () => Array.from(new Set(sorted.map((memory) => memory.mood).filter((mood): mood is string => Boolean(mood)))).sort(),
    [sorted],
  );
  const secretCodeStats = useMemo(() => {
    const counts = new Map<string, number>();
    sorted.forEach((memory) => {
      memory.tags?.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
    });
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"));
  }, [sorted]);
  const tagOptions = useMemo(() => secretCodeStats.map(({ tag }) => tag), [secretCodeStats]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return sorted.filter((memory) => {
      if (favoritesOnly && !favoriteMemoryIds.has(memory.id)) return false;
      if (cityFilter && memory.cityId !== cityFilter) return false;
      if (moodFilter && memory.mood !== moodFilter) return false;
      if (tagFilter && !memory.tags?.includes(tagFilter)) return false;
      if (!normalizedQuery) return true;
      const searchable = [
        memory.title,
        memory.text,
        memory.city,
        memory.placeName,
        memory.date,
        memory.mood,
        ...(memory.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [cityFilter, favoriteMemoryIds, favoritesOnly, moodFilter, query, sorted, tagFilter]);
  const timelineGroups = useMemo(() => groupMemoriesByMonth(filtered), [filtered]);
  const hasFilters = Boolean(query.trim() || cityFilter || moodFilter || tagFilter || favoritesOnly);
  const selectedCityIndex = Math.max(0, cityOptions.findIndex((city) => city.id === cityFilter) + 1);
  const selectedMoodIndex = Math.max(0, moodOptions.findIndex((mood) => mood === moodFilter) + 1);
  const selectedTagIndex = Math.max(0, tagOptions.findIndex((tag) => tag === tagFilter) + 1);

  const selectCity: NonNullable<PickerSelectorProps["onChange"]> = (event) => {
    const index = Number(event.detail.value);
    setCityFilter(index === 0 ? "" : cityOptions[index - 1]?.id || "");
  };

  const selectMood: NonNullable<PickerSelectorProps["onChange"]> = (event) => {
    const index = Number(event.detail.value);
    setMoodFilter(index === 0 ? "" : moodOptions[index - 1] || "");
  };

  const selectTag: NonNullable<PickerSelectorProps["onChange"]> = (event) => {
    const index = Number(event.detail.value);
    setTagFilter(index === 0 ? "" : tagOptions[index - 1] || "");
  };

  const clearFilters = () => {
    setQuery("");
    setCityFilter("");
    setMoodFilter("");
    setTagFilter("");
    setFavoritesOnly(false);
  };

  const openEditor = (memoryId?: string) => {
    const query = memoryId ? `?id=${encodeURIComponent(memoryId)}` : "";
    Taro.navigateTo({ url: `/pages/memory-editor/index${query}` });
  };

  const openDetail = (memoryId: string) => {
    Taro.navigateTo({ url: `/pages/memory-detail/index?id=${encodeURIComponent(memoryId)}` });
  };

  const openMemoryFinder = () => {
    Taro.navigateTo({ url: "/pages/memory-search/index" });
  };

  const toggleFavorite = async (memory: Memory) => {
    if (favoriteWorkingId) return;
    const records = favoriteRecords.filter((favorite) => favorite.memoryId === memory.id);
    setFavoriteWorkingId(memory.id);
    setStatus("");
    try {
      if (records.length > 0) {
        await deleteMemoryFavorites(records.map((favorite) => favorite.id));
        setFavoriteRecords((current) => current.filter((favorite) => favorite.memoryId !== memory.id));
        Taro.showToast({ title: "已取消共同收藏", icon: "success" });
      } else {
        const favorite = await createMemoryFavorite({
          id: memory.id,
          title: memory.title || memory.city || "共同收藏",
          date: memory.date,
          cityId: memory.cityId,
        });
        setFavoriteRecords((current) => [...current, favorite]);
        Taro.showToast({ title: "已加入共同收藏", icon: "success" });
      }
    } catch {
      setStatus("共同收藏没有保存成功，请检查网络后再试。");
    } finally {
      setFavoriteWorkingId("");
    }
  };

  const wanderMemory = () => {
    if (filtered.length === 0) {
      Taro.showToast({ title: "当前没有可漫游的回忆", icon: "none" });
      return;
    }
    const candidates = filtered.length > 1
      ? filtered.filter((memory) => memory.id !== lastWanderId)
      : filtered;
    const memory = candidates[Math.floor(Math.random() * candidates.length)] || filtered[0];
    setLastWanderId(memory.id);
    openDetail(memory.id);
  };

  const removeMemory = async (memory: Memory) => {
    if (deletingId) return;
    const result = await Taro.showModal({
      title: "删除这段回忆？",
      content: "删除后会进入回收状态，不会立即清理服务器上的照片。",
      confirmText: "删除",
    });
    if (!result.confirm) return;

    setDeletingId(memory.id);
    setStatus("");
    try {
      const data = await deleteMemory(memory.id);
      setMemories(flattenMemories(data.memories));
      Taro.showToast({ title: "已删除", icon: "success" });
    } catch {
      setStatus("删除失败。只有创建这段回忆的人才能删除，请稍后再试。");
    } finally {
      setDeletingId("");
    }
  };

  const currentUserId = session?.user.id;

  return (
    <View className="page memories-page">
      <AppHeader title="回忆" />

      <View className="screen-intro memory-intro">
        <View className="memory-intro-copy">
          <Text className="screen-title">一起走过的路</Text>
          <Text className="screen-subtitle">照片、地点和当时想说的话。</Text>
        </View>
        <View className="memory-count">
          <Text className="memory-count-value">{hasFilters ? filtered.length : sorted.length}</Text>
          <Text className="memory-count-label">{hasFilters ? "个匹配" : "段回忆"}</Text>
        </View>
      </View>

      {dailyReunion && (
        <Button
          className="memory-reunion card"
          onClick={() => openDetail(dailyReunion.memory.id)}
        >
          {dailyReunion.memory.photos?.[0] || dailyReunion.memory.image ? (
            <Image
              className="memory-reunion-cover"
              src={resolveAssetUrl(
                dailyReunion.memory.photos?.[0] || dailyReunion.memory.image,
                apiBaseUrl,
              )}
              mode="aspectFill"
              lazyLoad
            />
          ) : (
            <View className="memory-reunion-cover memory-reunion-placeholder">
              <Text>{dailyReunion.memory.city?.slice(0, 1) || "忆"}</Text>
            </View>
          )}
          <View className="memory-reunion-body">
            <Text className="memory-reunion-label">今天一起重逢</Text>
            <Text className="memory-reunion-title">
              {dailyReunion.memory.title || dailyReunion.memory.city || "未命名回忆"}
            </Text>
            <Text className="memory-reunion-copy">
              {dailyReunion.memory.text ||
                `从 ${dailyReunion.sharedCount} 段共同回忆里，今天翻到了这一页。`}
            </Text>
            <View className="memory-reunion-footer">
              <Text className="memory-reunion-age">{dailyReunion.ageLabel}</Text>
              <Text className="memory-reunion-action">重新看看 ›</Text>
            </View>
          </View>
        </Button>
      )}

      <View className="memory-browse card">
        <View className="memory-browse-heading">
          <View className="memory-browse-copy">
            <Text className="memory-browse-title">换个方式重温</Text>
            <Text className="memory-browse-subtitle">沿时间慢慢看，或让一段故事找到你。</Text>
          </View>
          <Button className="memory-wander" onClick={wanderMemory}>
            <Text className="memory-wander-mark">↝</Text>
            <Text>随机漫游</Text>
          </Button>
        </View>
        <View className="memory-view-controls">
          <Button
            className={viewMode === "cards" ? "memory-view-control active" : "memory-view-control"}
            onClick={() => setViewMode("cards")}
          >
            卡片
          </Button>
          <Button
            className={viewMode === "timeline" ? "memory-view-control active" : "memory-view-control"}
            onClick={() => setViewMode("timeline")}
          >
            时间线
          </Button>
          <Button
            className={favoritesOnly ? "memory-view-control favorite active" : "memory-view-control favorite"}
            onClick={() => setFavoritesOnly((current) => !current)}
          >
            <Text className="memory-view-heart">♥</Text>
            <Text>收藏 {favoriteCount}</Text>
          </Button>
        </View>
      </View>

      <View className="memory-search card">
        <View className="memory-search-heading">
          <View className="memory-search-heading-copy">
            <Text className="memory-search-title">找到一段回忆</Text>
            <Text className="memory-search-subtitle">精确筛选，或用一句话描述线索。</Text>
          </View>
          <Button className="memory-language-search" onClick={openMemoryFinder}>
            说句话找 ›
          </Button>
        </View>
        <View className="memory-search-input-row">
          <Input
            className="memory-search-input"
            value={query}
            confirmType="search"
            onInput={(event) => setQuery(event.detail.value)}
            placeholder="搜索标题、地点、文字或暗号"
          />
          {query && <Button className="memory-search-clear" onClick={() => setQuery("")}>清除</Button>}
        </View>
        <ScrollView className="memory-filter-scroll" scrollX enableFlex={false} showScrollbar={false}>
          <View className="memory-filter-row">
            <Picker mode="selector" range={["全部城市", ...cityOptions.map((city) => city.name)]} value={selectedCityIndex} onChange={selectCity}>
              <View className={cityFilter ? "memory-filter active" : "memory-filter"}>
                {cityFilter ? cityOptions.find((city) => city.id === cityFilter)?.name : "城市"}
              </View>
            </Picker>
            <Picker mode="selector" range={["全部心情", ...moodOptions]} value={selectedMoodIndex} onChange={selectMood}>
              <View className={moodFilter ? "memory-filter active" : "memory-filter"}>
                {moodFilter || "心情"}
              </View>
            </Picker>
            <Picker mode="selector" range={["全部暗号", ...tagOptions]} value={selectedTagIndex} onChange={selectTag}>
              <View className={tagFilter ? "memory-filter active" : "memory-filter"}>
                {tagFilter ? `#${tagFilter}` : "暗号"}
              </View>
            </Picker>
            {hasFilters && <Button className="memory-filter-clear" onClick={clearFilters}>重置</Button>}
          </View>
        </ScrollView>
        {secretCodeStats.length > 0 && (
          <View className="memory-code-vault">
            <View className="memory-code-vault-heading">
              <View className="memory-code-vault-copy">
                <Text className="memory-code-vault-title">我们的暗号</Text>
                <Text className="memory-code-vault-subtitle">点一下，只看属于它的故事</Text>
              </View>
              <Text className="memory-code-vault-count">{secretCodeStats.length} 个</Text>
            </View>
            <ScrollView className="memory-code-scroll" scrollX enableFlex={false} showScrollbar={false}>
              <View className="memory-code-row">
                {secretCodeStats.map(({ tag, count }) => (
                  <Button
                    className={tagFilter === tag ? "memory-code active" : "memory-code"}
                    key={tag}
                    onClick={() => setTagFilter((current) => (current === tag ? "" : tag))}
                  >
                    <Text className="memory-code-mark">#</Text>
                    <Text className="memory-code-name">{tag}</Text>
                    <Text className="memory-code-count">{count}</Text>
                  </Button>
                ))}
              </View>
            </ScrollView>
          </View>
        )}
        {hasFilters && <Text className="memory-search-result">显示 {filtered.length} / {sorted.length} 段回忆</Text>}
      </View>

      {status && <ErrorBanner copy={status} onRetry={loadMemories} />}
      {loading && sorted.length === 0 ? (
        <LoadingState />
      ) : filtered.length === 0 && !status ? (
        <EmptyState
          title={favoritesOnly ? "共同收藏还是空的" : hasFilters ? "没有匹配的回忆" : "第一段回忆还没写下"}
          copy={favoritesOnly ? "点亮回忆卡片上的爱心，两个人都会在这里看到。" : hasFilters ? "换个关键词或清空筛选条件再试试。" : "选几张照片，把那天的地点和故事留在这里。"}
          actionLabel={favoritesOnly ? "查看全部回忆" : hasFilters ? undefined : "记录第一段回忆"}
          onAction={favoritesOnly ? clearFilters : hasFilters ? undefined : () => openEditor()}
        />
      ) : viewMode === "timeline" ? (
        <View className="memory-timeline">
          {timelineGroups.map((group) => (
            <View className="memory-timeline-group" key={group.key}>
              <View className="memory-timeline-heading">
                <Text className="memory-timeline-month">{group.label}</Text>
                <Text className="memory-timeline-count">{group.memories.length} 段</Text>
              </View>
              <View className="memory-timeline-items">
                {group.memories.map((memory) => {
                  const isFavorite = favoriteMemoryIds.has(memory.id);
                  const cover = memory.photos?.[0] || memory.image;
                  return (
                    <View className="memory-timeline-item" key={memory.id}>
                      <View className="memory-timeline-rail" aria-hidden="true">
                        <View className="memory-timeline-dot" />
                      </View>
                      <Button className="memory-timeline-main" onClick={() => openDetail(memory.id)}>
                        {cover ? (
                          <Image
                            className="memory-timeline-cover"
                            src={resolveAssetUrl(cover, apiBaseUrl)}
                            mode="aspectFill"
                            lazyLoad
                          />
                        ) : (
                          <View className="memory-timeline-cover memory-timeline-placeholder">
                            <Text>{memory.city?.slice(0, 1) || "忆"}</Text>
                          </View>
                        )}
                        <View className="memory-timeline-copy">
                          <Text className="memory-timeline-day">{timelineDay(memory.date)} 日</Text>
                          <Text className="memory-timeline-title">
                            {memory.title || memory.city || "未命名回忆"}
                          </Text>
                          <Text className="memory-timeline-place">
                            {[memory.city, memory.placeName].filter(Boolean).join(" · ") || "留在那一天的故事"}
                          </Text>
                        </View>
                      </Button>
                      <Button
                        className={isFavorite ? "memory-timeline-favorite active" : "memory-timeline-favorite"}
                        aria-label={isFavorite ? "取消共同收藏" : "加入共同收藏"}
                        disabled={favoriteWorkingId === memory.id}
                        onClick={() => void toggleFavorite(memory)}
                      >
                        {isFavorite ? "♥" : "♡"}
                      </Button>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View className="memory-list">
          {filtered.map((memory) => {
            const canManage = Boolean(currentUserId && memory.createdById === currentUserId);
            const isFavorite = favoriteMemoryIds.has(memory.id);
            return (
              <View className="memory-card card" key={memory.id}>
                <Button
                  className={isFavorite ? "memory-favorite active" : "memory-favorite"}
                  aria-label={isFavorite ? "取消共同收藏" : "加入共同收藏"}
                  disabled={favoriteWorkingId === memory.id}
                  onClick={() => void toggleFavorite(memory)}
                >
                  {isFavorite ? "♥" : "♡"}
                </Button>
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
                      <Text className="memory-place">
                        {[memory.city, memory.placeName].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                  )}
                  {memory.text && <Text className="memory-text">{memory.text}</Text>}
                  {(memory.mood || memory.tags?.length) && (
                    <View className="tag-row">
                      {memory.mood && <Text className="tag tag-mood">{memory.mood}</Text>}
                      {memory.tags?.slice(0, 3).map((tag) => (
                        <Text className="tag tag-code" key={`${memory.id}-${tag}`}>#{tag}</Text>
                      ))}
                    </View>
                  )}
                  <Button className="memory-detail-action" onClick={() => openDetail(memory.id)}>
                    <Image className="memory-detail-action-icon" src={imagesIcon} mode="aspectFit" />
                    <Text>查看完整回忆</Text>
                  </Button>
                  {canManage && (
                    <View className="memory-actions">
                      <Button className="memory-action" onClick={() => openEditor(memory.id)}>
                        编辑
                      </Button>
                      <Button
                        className="memory-action danger"
                        disabled={deletingId === memory.id}
                        loading={deletingId === memory.id}
                        onClick={() => void removeMemory(memory)}
                      >
                        删除
                      </Button>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {sorted.length > 0 && (
        <Button className="memory-create-fab" aria-label="记录新回忆" onClick={() => openEditor()}>
          <Text className="memory-create-fab-plus">＋</Text>
          <Text className="memory-create-fab-label">记录</Text>
        </Button>
      )}
    </View>
  );
}
