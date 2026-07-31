import { useState } from "react";
import { Button, Image, Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import type { Memory } from "@map-of-us/shared";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import { cityById } from "../../data/geo";
import {
  apiBaseUrl,
  readSession,
  resolveAssetUrl,
  searchMemoriesByIntent,
} from "../../lib/api";
import type { MemoryIntentSearchResult, MemorySearchIntent } from "../../lib/api";
import "./index.scss";

const recentSearchKey = "our-memories:memory-searches";
const suggestions = ["杭州的回忆", "雨天的故事", "开心的时候", "海边的那天"];

function displayDate(value: string) {
  const parts = value.slice(0, 10).replace(/\./g, "-").split("-");
  if (parts.length !== 3) return value;
  return `${parts[0]} 年 ${Number(parts[1])} 月 ${Number(parts[2])} 日`;
}

function resultCover(memory: Memory) {
  const url = memory.photos?.[0] || memory.image;
  return url ? resolveAssetUrl(url, apiBaseUrl) : "";
}

function intentLabels(intent: MemorySearchIntent) {
  const labels: string[] = [];
  if (intent.cityId) labels.push(cityById.get(intent.cityId)?.name || intent.cityId);
  if (intent.mood) labels.push(intent.mood);
  intent.tags?.forEach((tag) => labels.push(`#${tag}`));
  if (intent.query?.trim()) labels.push(`文字：${intent.query.trim()}`);
  return labels;
}

function readRecentSearches() {
  const value = Taro.getStorageSync<unknown>(recentSearchKey);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 5);
}

function rememberSearch(query: string, current: string[]) {
  const next = [query, ...current.filter((item) => item !== query)].slice(0, 5);
  Taro.setStorageSync(recentSearchKey, next);
  return next;
}

export default function MemorySearchPage() {
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [result, setResult] = useState<MemoryIntentSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useDidShow(() => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    setRecentSearches(readRecentSearches());
  });

  const runSearch = async (nextQuery = query) => {
    const normalizedQuery = nextQuery.trim().slice(0, 80);
    if (!normalizedQuery) {
      Taro.showToast({ title: "先描述一下想找的回忆", icon: "none" });
      return;
    }

    setQuery(normalizedQuery);
    setLoading(true);
    setStatus("");
    try {
      const data = await searchMemoriesByIntent(normalizedQuery, 30);
      setResult(data);
      setRecentSearches((current) => rememberSearch(normalizedQuery, current));
    } catch {
      setStatus("暂时没有找到回忆，请检查网络后再试。");
    } finally {
      setLoading(false);
    }
  };

  const clearRecentSearches = () => {
    Taro.removeStorageSync(recentSearchKey);
    setRecentSearches([]);
  };

  const openMemory = (memoryId: string) => {
    Taro.navigateTo({ url: `/pages/memory-detail/index?id=${encodeURIComponent(memoryId)}` });
  };

  const labels = result ? intentLabels(result.intent) : [];

  return (
    <View className="page memory-finder-page">
      <AppHeader title="找回那一天" back />

      <View className="screen-intro finder-intro">
        <Text className="screen-title">说一句，你记得的线索</Text>
        <Text className="screen-subtitle">地点、天气、心情或暗号，都可以成为回去的路。</Text>
      </View>

      <View className="finder-panel card">
        <Text className="finder-label">我想找</Text>
        <Input
          className="finder-input"
          value={query}
          maxlength={80}
          confirmType="search"
          focus
          placeholder="例如：杭州开心的回忆"
          onInput={(event) => setQuery(event.detail.value)}
          onConfirm={() => void runSearch()}
        />
        <Button
          className="btn finder-submit"
          disabled={loading || !query.trim()}
          loading={loading}
          onClick={() => void runSearch()}
        >
          找回那一天
        </Button>

        <View className="finder-suggestions">
          <Text className="finder-suggestions-label">可以这样说</Text>
          <View className="finder-suggestion-row">
            {suggestions.map((suggestion) => (
              <Button
                className="finder-suggestion"
                key={suggestion}
                disabled={loading}
                onClick={() => void runSearch(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </View>
        </View>
      </View>

      {recentSearches.length > 0 && !result && (
        <View className="finder-history">
          <View className="finder-section-heading">
            <Text className="finder-section-title">最近找过</Text>
            <Button className="finder-section-action" onClick={clearRecentSearches}>清空</Button>
          </View>
          <View className="finder-history-list">
            {recentSearches.map((item) => (
              <Button
                className="finder-history-item"
                key={item}
                disabled={loading}
                onClick={() => void runSearch(item)}
              >
                <Text className="finder-history-copy">{item}</Text>
                <Text className="finder-history-arrow">›</Text>
              </Button>
            ))}
          </View>
        </View>
      )}

      {status && <ErrorBanner copy={status} onRetry={() => void runSearch()} />}
      {loading ? (
        <View className="finder-loading"><LoadingState /></View>
      ) : result ? (
        <View className="finder-results">
          <View className="finder-result-heading">
            <View className="finder-result-heading-copy">
              <Text className="finder-section-title">找到的回忆</Text>
              <Text className="finder-result-subtitle">根据“{query}”整理</Text>
            </View>
            <Text className="finder-result-count">{result.items.length} 段</Text>
          </View>

          {labels.length > 0 && (
            <View className="finder-intent">
              <Text className="finder-intent-label">识别到</Text>
              <View className="finder-intent-row">
                {labels.map((label) => <Text className="finder-intent-chip" key={label}>{label}</Text>)}
              </View>
            </View>
          )}

          {result.items.length === 0 ? (
            <EmptyState
              title="这条线索还没有找到故事"
              copy="换一种说法，或只保留一个地点、天气、心情再试试。"
            />
          ) : (
            <View className="finder-result-list">
              {result.items.map((memory) => {
                const cover = resultCover(memory);
                return (
                  <Button
                    className="finder-result-card"
                    key={memory.id}
                    onClick={() => openMemory(memory.id)}
                  >
                    {cover ? (
                      <Image className="finder-result-cover" src={cover} mode="aspectFill" lazyLoad />
                    ) : (
                      <View className="finder-result-cover finder-result-placeholder">
                        <Text>{memory.city?.slice(0, 1) || "忆"}</Text>
                      </View>
                    )}
                    <View className="finder-result-body">
                      <Text className="finder-result-date">{displayDate(memory.date)}</Text>
                      <Text className="finder-result-title">
                        {memory.title || memory.city || "未命名回忆"}
                      </Text>
                      <Text className="finder-result-meta">
                        {[memory.city, memory.placeName].filter(Boolean).join(" · ") || "留在那一天的故事"}
                      </Text>
                      {memory.text && <Text className="finder-result-copy">{memory.text}</Text>}
                    </View>
                    <Text className="finder-result-arrow">›</Text>
                  </Button>
                );
              })}
            </View>
          )}
        </View>
      ) : (
        <View className="finder-prompt">
          <Text className="finder-prompt-kicker">不用记得很完整</Text>
          <Text className="finder-prompt-title">一个地方、一场雨，也够了</Text>
          <Text className="finder-prompt-copy">搜索只会读取你们空间里的回忆，不会把内容交给外部 AI。</Text>
        </View>
      )}
    </View>
  );
}
