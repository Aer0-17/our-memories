import { useCallback, useMemo, useState } from "react";
import {
  Button,
  Image,
  Picker,
  ScrollView,
  Text,
  View,
} from "@tarojs/components";
import type { PickerSelectorProps } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import type { Memory } from "@map-of-us/shared";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import { apiBaseUrl, getMemories, readSession, resolveAssetUrl } from "../../lib/api";
import { setPhotoViewerSession, type PhotoViewerItem } from "../../lib/photoViewer";
import "./index.scss";

type CityOption = {
  id: string;
  name: string;
};

function flattenMemories(store: Record<string, Memory[]>) {
  return Object.values(store).flat();
}

function memoryYear(value: string) {
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : 0;
}

function displayDate(value: string) {
  const [year, month, day] = value.slice(0, 10).replace(/\./g, "-").split("-");
  if (!year || !month || !day) return value;
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

function photoUrls(memory: Memory) {
  const urls = memory.photos?.length ? memory.photos : memory.image ? [memory.image] : [];
  return Array.from(new Set(urls.filter(Boolean)));
}

function galleryPhotos(memories: Memory[]): PhotoViewerItem[] {
  return [...memories]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((memory) => photoUrls(memory).map((url, index) => ({
      id: `${memory.id}-${index}`,
      url: resolveAssetUrl(url, apiBaseUrl),
      memoryId: memory.id,
      title: memory.title || memory.city || "未命名回忆",
      date: memory.date,
      year: memoryYear(memory.date),
      cityId: memory.cityId || memory.city,
      city: memory.city || "",
      placeName: memory.placeName || "",
    })))
    .filter((photo) => photo.year > 0);
}

export default function PhotoWallPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [cityFilter, setCityFilter] = useState("");
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
      setMemories(flattenMemories(data.memories));
    } catch {
      setStatus("共同照片墙暂时没有同步成功，请检查网络后再试。");
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

  const photos = useMemo(() => galleryPhotos(memories), [memories]);
  const years = useMemo(
    () => Array.from(new Set(photos.map((photo) => photo.year))).sort((a, b) => b - a),
    [photos],
  );
  const yearPhotos = useMemo(
    () => selectedYear ? photos.filter((photo) => photo.year === selectedYear) : photos,
    [photos, selectedYear],
  );
  const cityOptions = useMemo<CityOption[]>(() => Array.from(
    new Map(yearPhotos
      .filter((photo) => photo.cityId && photo.city)
      .map((photo) => [photo.cityId, { id: photo.cityId, name: photo.city }] as const))
      .values(),
  ).sort((a, b) => a.name.localeCompare(b.name, "zh-CN")), [yearPhotos]);
  const filteredPhotos = useMemo(
    () => cityFilter ? yearPhotos.filter((photo) => photo.cityId === cityFilter) : yearPhotos,
    [cityFilter, yearPhotos],
  );
  const selectedCityIndex = Math.max(
    0,
    cityOptions.findIndex((city) => city.id === cityFilter) + 1,
  );
  const selectYear = (year: number | null) => {
    setSelectedYear(year);
    setCityFilter("");
  };

  const selectCity: NonNullable<PickerSelectorProps["onChange"]> = (event) => {
    const index = Number(event.detail.value);
    setCityFilter(index === 0 ? "" : cityOptions[index - 1]?.id || "");
  };

  const clearFilters = () => {
    setSelectedYear(null);
    setCityFilter("");
  };

  const openViewer = (index: number) => {
    setPhotoViewerSession(filteredPhotos, index);
    Taro.navigateTo({ url: "/pages/photo-viewer/index" });
  };

  const hasFilters = selectedYear !== null || Boolean(cityFilter);
  const selectedCityName = cityOptions.find((city) => city.id === cityFilter)?.name || "";

  return (
    <View className="page photo-wall-page">
      <AppHeader title="共同照片墙" back />

      <View className="photo-wall-intro">
        <View className="photo-wall-intro-copy">
          <Text className="photo-wall-kicker">散落在故事里的画面</Text>
          <Text className="photo-wall-title">把看过的风景放在一起</Text>
          <Text className="photo-wall-subtitle">长按系统预览中的照片，可保存或转发。</Text>
        </View>
        <View className="photo-wall-count">
          <Text className="photo-wall-count-value">{filteredPhotos.length}</Text>
          <Text className="photo-wall-count-label">张</Text>
        </View>
      </View>

      <View className="photo-wall-filters card">
        <View className="photo-wall-filter-heading">
          <View className="photo-wall-filter-copy">
            <Text className="photo-wall-filter-title">旅行相册</Text>
            <Text className="photo-wall-filter-subtitle">按年份和城市找回那段路。</Text>
          </View>
          {hasFilters && (
            <Button className="photo-wall-reset" onClick={clearFilters}>重置</Button>
          )}
        </View>
        <ScrollView className="photo-wall-year-scroll" scrollX enableFlex={false} showScrollbar={false}>
          <View className="photo-wall-year-row">
            <Button
              className={selectedYear === null ? "photo-wall-year active" : "photo-wall-year"}
              onClick={() => selectYear(null)}
            >
              全部年份
            </Button>
            {years.map((year) => (
              <Button
                className={selectedYear === year ? "photo-wall-year active" : "photo-wall-year"}
                key={year}
                onClick={() => selectYear(year)}
              >
                {year}
              </Button>
            ))}
          </View>
        </ScrollView>
        <Picker
          mode="selector"
          range={["全部城市", ...cityOptions.map((city) => city.name)]}
          value={selectedCityIndex}
          onChange={selectCity}
        >
          <View className={cityFilter ? "photo-wall-city active" : "photo-wall-city"}>
            <Text>{selectedCityName || "全部城市"}</Text>
            <Text className="photo-wall-city-arrow">⌄</Text>
          </View>
        </Picker>
      </View>

      {status && <ErrorBanner copy={status} onRetry={() => void loadMemories()} />}
      {loading && photos.length === 0 ? (
        <LoadingState />
      ) : photos.length === 0 && !status ? (
        <EmptyState
          title="照片墙还没有画面"
          copy="在回忆里加入照片后，它们会自动汇到这里，不需要重复上传。"
          actionLabel="去记录回忆"
          onAction={() => Taro.switchTab({ url: "/pages/memories/index" })}
        />
      ) : filteredPhotos.length === 0 && !status ? (
        <EmptyState
          title="没有找到这组照片"
          copy="换一个年份或城市，继续翻翻你们走过的地方。"
          actionLabel="查看全部照片"
          onAction={clearFilters}
        />
      ) : (
        <View className="photo-wall-grid">
          {filteredPhotos.map((photo, index) => {
            const featured = index % 7 === 0;
            const tall = !featured && index % 3 === 1;
            const className = featured
              ? "photo-wall-tile featured"
              : tall
                ? "photo-wall-tile tall"
                : "photo-wall-tile";
            return (
              <Button
                className={className}
                key={photo.id}
                aria-label={`查看${photo.title}`}
                onClick={() => openViewer(index)}
              >
                <Image className="photo-wall-image" src={photo.url} mode="aspectFill" lazyLoad />
                <View className="photo-wall-caption">
                  <Text className="photo-wall-caption-title">{photo.title}</Text>
                  <Text className="photo-wall-caption-meta">
                    {[photo.city, displayDate(photo.date)].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </Button>
            );
          })}
        </View>
      )}
    </View>
  );
}
