import { useCallback, useMemo, useState } from "react";
import { Button, Image, Input, Picker, ScrollView, Text, View } from "@tarojs/components";
import type { PickerSelectorProps } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import type { Memory } from "@map-of-us/shared";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import {
  apiBaseUrl,
  deleteMemory,
  getMemories,
  readSession,
  resolveAssetUrl,
} from "../../lib/api";
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

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState("");
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
      const data = await getMemories();
      setMemories(flattenMemories(data.memories));
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
  const tagOptions = useMemo(
    () => Array.from(new Set(sorted.flatMap((memory) => memory.tags || []).filter((tag): tag is string => Boolean(tag)))).sort(),
    [sorted],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return sorted.filter((memory) => {
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
  }, [cityFilter, moodFilter, query, sorted, tagFilter]);
  const hasFilters = Boolean(query.trim() || cityFilter || moodFilter || tagFilter);
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
  };

  const openEditor = (memoryId?: string) => {
    const query = memoryId ? `?id=${encodeURIComponent(memoryId)}` : "";
    Taro.navigateTo({ url: `/pages/memory-editor/index${query}` });
  };

  const openDetail = (memoryId: string) => {
    Taro.navigateTo({ url: `/pages/memory-detail/index?id=${encodeURIComponent(memoryId)}` });
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

  const currentUserId = readSession()?.user.id;

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

      <View className="memory-search card">
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
        {hasFilters && <Text className="memory-search-result">显示 {filtered.length} / {sorted.length} 段回忆</Text>}
      </View>

      {status && <ErrorBanner copy={status} onRetry={loadMemories} />}
      {loading && sorted.length === 0 ? (
        <LoadingState />
      ) : filtered.length === 0 && !status ? (
        <EmptyState
          title={hasFilters ? "没有匹配的回忆" : "第一段回忆还没写下"}
          copy={hasFilters ? "换个关键词或清空筛选条件再试试。" : "选几张照片，把那天的地点和故事留在这里。"}
          actionLabel={hasFilters ? undefined : "记录第一段回忆"}
          onAction={hasFilters ? undefined : () => openEditor()}
        />
      ) : (
        <View className="memory-list">
          {filtered.map((memory) => {
            const canManage = Boolean(currentUserId && memory.createdById === currentUserId);
            return (
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
                        <Text className="tag" key={`${memory.id}-${tag}`}>#{tag}</Text>
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
