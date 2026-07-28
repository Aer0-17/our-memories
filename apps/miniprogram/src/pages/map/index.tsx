// Footprint map page. Memory progress is rendered on WeChat's native map so
// pinch zoom and panning remain smooth from the nationwide view down to streets.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Image,
  Map as TaroMap,
  Picker,
  ScrollView,
  Switch,
  Text,
  View,
  type MapProps,
} from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { ErrorBanner, LoadingState } from "../../components/PageStates";
import coupleMarkerIcon from "../../assets/illustrations/avatar-us.png";
import futureMarkerIcon from "../../assets/illustrations/icon-hourglass.png";
import {
  createFutureCheckin,
  deleteFutureCheckin,
  forestSpiritVariantCount,
  futureCheckinLabel,
  getMemorySummary,
  listFutureCheckins,
  readSession,
  resolveAssetUrl,
  apiBaseUrl,
  type FutureCheckin,
  type MemorySummary,
} from "../../lib/api";
import {
  cityById,
  getCitiesByProvince,
  provinceById,
  provinces,
} from "../../data/geo";
import { getLitProvinceIds } from "../../lib/mapProgress";
import {
  buildNativeProvincePolygons,
  findProvinceAtNativeCoordinate,
  nativeChinaBounds,
  toNativeMapPoint,
} from "../../lib/nativeMap";
import { fetchCitiesWeather, fallbackWeather, type WeatherInfo } from "../../lib/weather";
import { mapNativeColors, mapNativeMetrics } from "../../styles/mapTokens";
import "./index.scss";

const MAP_ID = "memory-native-map";
const LATEST_MARKER_ID = 1;
const FUTURE_MARKER_ID_START = 1000;
const MAP_CENTER = toNativeMapPoint(104.2, 35.8);

interface FootprintStop extends MapProps.point {
  cityId: string;
  provinceId: string;
  date: string;
  order: number;
}

function displayMapDate(value?: string) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).replace(/\./g, "-").split("-");
  if (!year || !month || !day) return value;
  return `${year}.${month}.${day}`;
}

export default function MapPage() {
  const [summary, setSummary] = useState<MemorySummary>({});
  const [futureCheckins, setFutureCheckins] = useState<FutureCheckin[]>([]);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(null);
  const [showCharacters, setShowCharacters] = useState(true);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  // Future check-in editor modal.
  const [checkinModalOpen, setCheckinModalOpen] = useState(false);
  const [pickProvinceIndex, setPickProvinceIndex] = useState(0);
  const [pickCityIndex, setPickCityIndex] = useState(0);
  const [checkinBusy, setCheckinBusy] = useState(false);

  const loadData = useCallback(async () => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const [summaryRes, checkins] = await Promise.all([getMemorySummary(), listFutureCheckins()]);
      setSummary(summaryRes.summary || {});
      setFutureCheckins(checkins);
    } catch {
      setStatus("暂时没有同步到足迹，请检查网络后再试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void loadData();
  });

  // Lit provinces: any city with at least one memory lights its province.
  const litProvinceIds = useMemo(() => {
    const cityIds = Object.keys(summary).filter((cityId) => (summary[cityId]?.count ?? 0) > 0);
    return getLitProvinceIds(new Set(cityIds));
  }, [summary]);

  // Footprint route: one node per city, ordered by that city's latest memory date.
  const routePoints = useMemo<FootprintStop[]>(() => {
    const entries = Object.values(summary)
      .map((entry) => ({ entry, city: cityById.get(entry.cityId) }))
      .filter(({ entry, city }) => (entry.count ?? 0) > 0 && Boolean(city))
      .map(({ entry, city }) => ({ entry, city: city! }))
      .sort((a, b) =>
        (a.entry.latest?.date || a.entry.updatedAt || "").localeCompare(
          b.entry.latest?.date || b.entry.updatedAt || "",
        ),
      );

    return entries.map(({ entry, city }, index) => ({
      cityId: city.id,
      provinceId: city.provinceId,
      date: entry.latest?.date || entry.updatedAt || "",
      order: index + 1,
      ...toNativeMapPoint(city.lng, city.lat),
    }));
  }, [summary]);

  // Latest visited city becomes the "us here" marker with live weather.
  const latestCity = useMemo(() => {
    const last = routePoints[routePoints.length - 1];
    return last ? cityById.get(last.cityId) ?? null : null;
  }, [routePoints]);

  useEffect(() => {
    if (!latestCity) return;
    let active = true;
    void fetchCitiesWeather([latestCity]).then((map) => {
      if (active) setWeather(map[latestCity.id] ?? fallbackWeather(latestCity.id));
    });
    return () => {
      active = false;
    };
  }, [latestCity, summary]);

  const latestWeather = latestCity && weather?.cityId === latestCity.id ? weather : null;

  const futureMarkers = useMemo(() => {
    const byCity = new Map<string, FutureCheckin>();
    futureCheckins.forEach((checkin) => {
      if (!byCity.has(checkin.cityId)) byCity.set(checkin.cityId, checkin);
    });
    return [...byCity.values()];
  }, [futureCheckins]);

  const provincePolygons = useMemo(
    () => buildNativeProvincePolygons(litProvinceIds),
    [litProvinceIds],
  );

  const routeLines = useMemo<MapProps.polyline[]>(() => {
    if (routePoints.length < 2) return [];
    return [
      {
        points: routePoints.map(({ longitude, latitude }) => ({ longitude, latitude })),
        color: mapNativeColors.route,
        width: mapNativeMetrics.routeWidth,
        dottedLine: true,
        borderColor: mapNativeColors.routeBorder,
        borderWidth: mapNativeMetrics.routeBorderWidth,
      },
    ];
  }, [routePoints]);

  const nativeMarkers = useMemo<MapProps.marker[]>(() => {
    const markers: MapProps.marker[] = [];
    const latestStop = routePoints[routePoints.length - 1];
    if (showCharacters && latestCity && latestStop) {
      const weatherCopy = latestWeather
        ? ` · ${latestWeather.label} ${latestWeather.temp}°`
        : "";
      markers.push({
        id: LATEST_MARKER_ID,
        longitude: latestStop.longitude,
        latitude: latestStop.latitude,
        iconPath: coupleMarkerIcon,
        width: mapNativeMetrics.coupleMarkerWidth,
        height: mapNativeMetrics.coupleMarkerHeight,
        zIndex: 8,
        anchor: { x: 0.5, y: 1 },
        callout: {
          content: `${latestCity.name}${weatherCopy}`,
          color: mapNativeColors.calloutText,
          fontSize: mapNativeMetrics.calloutFontSize,
          anchorX: 0,
          anchorY: -4,
          borderRadius: mapNativeMetrics.calloutRadius,
          borderWidth: 1,
          borderColor: mapNativeColors.calloutBorder,
          bgColor: mapNativeColors.calloutBackground,
          padding: mapNativeMetrics.calloutPadding,
          display: "ALWAYS",
          textAlign: "center",
        },
      });
    }

    futureMarkers.forEach((checkin, index) => {
      const point = toNativeMapPoint(checkin.lng, checkin.lat);
      markers.push({
        id: FUTURE_MARKER_ID_START + index,
        ...point,
        iconPath: futureMarkerIcon,
        width: mapNativeMetrics.futureMarkerWidth,
        height: mapNativeMetrics.futureMarkerHeight,
        zIndex: 6,
        anchor: { x: 0.5, y: 0.5 },
        label: {
          content: "想去",
          color: mapNativeColors.futureText,
          fontSize: mapNativeMetrics.calloutFontSize,
          anchorX: 16,
          anchorY: -10,
          borderWidth: 1,
          borderColor: mapNativeColors.futureBorder,
          borderRadius: mapNativeMetrics.calloutRadius,
          bgColor: mapNativeColors.futureBackground,
          padding: 4,
          textAlign: "center",
        },
      });
    });
    return markers;
  }, [futureMarkers, latestCity, latestWeather, routePoints, showCharacters]);

  const selectedProvince = selectedProvinceId ? provinceById.get(selectedProvinceId) : undefined;
  const selectedCities = useMemo(() => {
    if (!selectedProvinceId) return [];
    return getCitiesByProvince(selectedProvinceId)
      .map((city) => summary[city.id])
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry && entry.count > 0));
  }, [selectedProvinceId, summary]);
  const selectedStats = useMemo(() => {
    const count = selectedCities.reduce((sum, entry) => sum + entry.count, 0);
    const latestEntry = [...selectedCities]
      .filter((entry) => entry.latest)
      .sort((a, b) => (b.latest?.date || "").localeCompare(a.latest?.date || ""))[0];
    const latest = latestEntry?.latest;
    const cover = latestEntry?.coverImage || latest?.image;
    return { count, cities: selectedCities.length, latest, latestEntry, cover };
  }, [selectedCities]);
  const selectedCityLetters = useMemo(
    () => [...selectedCities]
      .filter((entry) => entry.latest)
      .sort((a, b) => (b.latest?.date || "").localeCompare(a.latest?.date || "")),
    [selectedCities],
  );

  const handleMapTap = useCallback(
    (event: { detail?: { longitude?: number; latitude?: number } }) => {
      const longitude = event.detail?.longitude;
      const latitude = event.detail?.latitude;
      if (typeof longitude !== "number" || typeof latitude !== "number") return;
      const hit = findProvinceAtNativeCoordinate(longitude, latitude);
      if (hit) setSelectedProvinceId(hit);
    },
    [],
  );

  const handleMarkerTap = useCallback(
    (event: { detail: { markerId: number | string } }) => {
      const markerId = Number(event.detail.markerId);
      if (markerId === LATEST_MARKER_ID) {
        const latestStop = routePoints[routePoints.length - 1];
        if (latestStop) setSelectedProvinceId(latestStop.provinceId);
        return;
      }
      const checkin = futureMarkers[markerId - FUTURE_MARKER_ID_START];
      if (checkin) {
        Taro.showToast({ title: futureCheckinLabel(checkin), icon: "none" });
      }
    },
    [futureMarkers, routePoints],
  );

  const fitChina = useCallback(() => {
    void Taro.createMapContext(MAP_ID)
      .includePoints({ points: nativeChinaBounds, padding: [32] })
      .catch(() => Taro.showToast({ title: "地图视野重置失败", icon: "none" }));
  }, []);

  const openMemoryDetail = (memoryId: string) => {
    setSelectedProvinceId(null);
    Taro.navigateTo({ url: `/pages/memory-detail/index?id=${encodeURIComponent(memoryId)}` });
  };

  const recordFirstMemory = () => {
    setSelectedProvinceId(null);
    Taro.navigateTo({ url: "/pages/memory-editor/index" });
  };

  // --- Future check-in editor ---
  const checkinCityOptions = useMemo(
    () => getCitiesByProvince(provinces[pickProvinceIndex]?.id ?? ""),
    [pickProvinceIndex],
  );

  const addCheckin = async () => {
    const province = provinces[pickProvinceIndex];
    const city = checkinCityOptions[pickCityIndex];
    if (!province || !city || checkinBusy) return;
    setCheckinBusy(true);
    try {
      const created = await createFutureCheckin({
        provinceId: province.id,
        provinceName: province.name,
        cityId: city.id,
        cityName: city.name,
        regionId: `${city.id}-center`,
        regionName: "全市",
        lng: city.lng,
        lat: city.lat,
        mascotVariant: Math.floor(Math.random() * forestSpiritVariantCount),
      });
      setFutureCheckins((current) => [
        created,
        ...current.filter((item) => item.cityId !== created.cityId),
      ]);
      setCheckinModalOpen(false);
    } catch {
      Taro.showToast({ title: "添加失败，请重试", icon: "none" });
    } finally {
      setCheckinBusy(false);
    }
  };

  const removeCheckin = async (id: string) => {
    const previous = futureCheckins;
    setFutureCheckins((current) => current.filter((item) => item.id !== id));
    try {
      await deleteFutureCheckin(id);
    } catch {
      setFutureCheckins(previous);
      Taro.showToast({ title: "删除失败，请重试", icon: "none" });
    }
  };

  const litCount = litProvinceIds.size;

  return (
    <View className="map-page">
      <AppHeader title="回忆地图" back />

      <View className="map-intro">
        <View className="map-intro__copy">
          <Text className="map-intro__title">一起走过的地方</Text>
          <Text className="map-intro__sub">
            已点亮 {litCount} / {provinces.length} 个省份 · {routePoints.length} 座城市
          </Text>
        </View>
        <Button className="btn-secondary map-checkin-open" onClick={() => setCheckinModalOpen(true)}>
          想去的地方{futureCheckins.length > 0 ? ` · ${futureCheckins.length}` : ""}
        </Button>
      </View>

      {status ? <ErrorBanner copy={status} onRetry={() => void loadData()} /> : null}
      {loading && Object.keys(summary).length === 0 ? <LoadingState /> : null}

      <View className="map-native-wrap">
        <TaroMap
          id={MAP_ID}
          className="memory-native-map"
          longitude={MAP_CENTER.longitude}
          latitude={MAP_CENTER.latitude}
          scale={4}
          minScale={3}
          maxScale={18}
          includePoints={nativeChinaBounds}
          polygons={provincePolygons}
          polyline={routeLines}
          markers={nativeMarkers}
          showScale
          showCompass
          enableZoom
          enableScroll
          enablePoi
          enableBuilding={false}
          enableRotate={false}
          enableOverlooking={false}
          onTap={handleMapTap}
          onMarkerTap={handleMarkerTap}
          onError={() => Taro.showToast({ title: "地图暂时加载失败", icon: "none" })}
        />
      </View>

      <View className="map-controls">
        <Text className="map-controls__label">最近城市</Text>
        <Switch
          color={mapNativeColors.route}
          checked={showCharacters}
          onChange={(event) => setShowCharacters(event.detail.value)}
        />
        <Button className="map-fit-button" onClick={fitChina}>
          全图
        </Button>
      </View>

      <View className="map-legend">
        <View className="map-legend__item">
          <View className="map-legend__dot map-legend__dot--lit" />
          <Text>已点亮</Text>
        </View>
        <View className="map-legend__item">
          <View className="map-legend__dot map-legend__dot--unlit" />
          <Text>未点亮</Text>
        </View>
      </View>

      {/* Province popup */}
      {selectedProvince ? (
        <View className="map-modal" onClick={() => setSelectedProvinceId(null)}>
          <View className="map-modal__card map-letter" onClick={(e) => e.stopPropagation()}>
            <View className="map-modal__heading">
              <View className="map-letter__heading-copy">
                <Text className="map-letter__eyebrow">城市情书</Text>
                <Text className="map-modal__title">写给{selectedProvince.name}</Text>
              </View>
              <Button
                className="map-modal__close"
                aria-label="关闭省份详情"
                onClick={() => setSelectedProvinceId(null)}
              >
                ×
              </Button>
            </View>
            <View className="map-letter__hero">
              {selectedStats.cover ? (
                <Image
                  className="map-letter__cover"
                  src={resolveAssetUrl(selectedStats.cover, apiBaseUrl)}
                  mode="aspectFill"
                />
              ) : (
                <View className="map-letter__cover map-letter__cover--empty">
                  <Text className="map-letter__empty-mark">{selectedProvince.name.slice(0, 1)}</Text>
                  <Text className="muted">故事还没写到这里</Text>
                </View>
              )}
              {selectedStats.count > 0 ? (
                <View className="map-letter__stamp">
                  <Text className="map-letter__stamp-value">{selectedStats.count}</Text>
                  <Text className="map-letter__stamp-label">段故事</Text>
                </View>
              ) : null}
            </View>

            {selectedStats.count > 0 ? (
              <>
                <View className="map-letter__summary">
                  <Text className="map-letter__summary-title">
                    你们在这里走过 {selectedStats.cities} 座城市
                  </Text>
                  <Text className="map-letter__summary-copy">
                    {selectedStats.latest?.text || selectedStats.latest?.title ||
                      `最近一封，留在${selectedStats.latestEntry?.city || selectedProvince.name}。`}
                  </Text>
                  {selectedStats.latest?.date ? (
                    <Text className="map-letter__summary-date">
                      最近写于 {displayMapDate(selectedStats.latest.date)}
                    </Text>
                  ) : null}
                </View>

                <ScrollView scrollY className="map-letter__list">
                  <View className="map-letter__list-inner">
                    {selectedCityLetters.map((entry) => {
                      const latest = entry.latest;
                      if (!latest) return null;
                      const cityCover = entry.coverImage || latest.image;
                      return (
                        <Button
                          className="map-letter__city"
                          key={entry.cityId}
                          onClick={() => openMemoryDetail(latest.id)}
                        >
                          {cityCover ? (
                            <Image
                              className="map-letter__city-cover"
                              src={resolveAssetUrl(cityCover, apiBaseUrl)}
                              mode="aspectFill"
                              lazyLoad
                            />
                          ) : (
                            <View className="map-letter__city-cover map-letter__city-cover--empty">
                              <Text>{entry.city.slice(0, 1)}</Text>
                            </View>
                          )}
                          <View className="map-letter__city-copy">
                            <View className="map-letter__city-line">
                              <Text className="map-letter__city-name">{entry.city}</Text>
                              <Text className="map-letter__city-count">{entry.count} 段</Text>
                            </View>
                            <Text className="map-letter__city-title">
                              {latest.title || latest.placeName || latest.text || "最近的回忆"}
                            </Text>
                            {latest.date ? (
                              <Text className="map-letter__city-date">{displayMapDate(latest.date)}</Text>
                            ) : null}
                          </View>
                          <Text className="map-letter__city-arrow">›</Text>
                        </Button>
                      );
                    })}
                  </View>
                </ScrollView>
              </>
            ) : (
              <View className="map-letter__empty-copy">
                <Text className="map-letter__summary-title">把第一段故事留在这里</Text>
                <Text className="map-letter__summary-copy">以后再点开，它就会成为你们写给这里的第一封信。</Text>
              </View>
            )}

            <Button
              className="btn map-modal__enter"
              onClick={() => selectedStats.latest
                ? openMemoryDetail(selectedStats.latest.id)
                : recordFirstMemory()}
            >
              {selectedStats.latest ? "读最近的一封" : "记录第一段回忆"}
            </Button>
          </View>
        </View>
      ) : null}

      {/* Future check-in editor */}
      {checkinModalOpen ? (
        <View className="map-modal" onClick={() => setCheckinModalOpen(false)}>
          <View className="map-modal__card" onClick={(e) => e.stopPropagation()}>
            <View className="map-modal__heading">
              <Text className="map-modal__title">想去的地方</Text>
              <Button
                className="map-modal__close"
                aria-label="关闭想去的地方"
                onClick={() => setCheckinModalOpen(false)}
              >
                ×
              </Button>
            </View>
            <View className="map-checkin__row">
              <Picker
                className="map-checkin__picker"
                mode="selector"
                range={provinces.map((province) => province.name)}
                value={pickProvinceIndex}
                onChange={(event) => {
                  setPickProvinceIndex(Number(event.detail.value));
                  setPickCityIndex(0);
                }}
              >
                <View className="field">{provinces[pickProvinceIndex]?.name || "选择省份"}</View>
              </Picker>
              <Picker
                className="map-checkin__picker"
                mode="selector"
                range={checkinCityOptions.map((city) => city.name)}
                value={pickCityIndex}
                onChange={(event) => setPickCityIndex(Number(event.detail.value))}
              >
                <View className="field">{checkinCityOptions[pickCityIndex]?.name || "选择城市"}</View>
              </Picker>
            </View>
            <Button className="btn" disabled={checkinBusy} onClick={() => void addCheckin()}>
              {checkinBusy ? "正在添加" : "添加到想去"}
            </Button>

            <ScrollView scrollY className="map-checkin__list">
              {futureCheckins.length > 0 ? (
                futureCheckins.map((checkin) => (
                  <View key={checkin.id} className="map-checkin__item">
                    <Text className="map-checkin__label">{futureCheckinLabel(checkin)}</Text>
                    <Button
                      className="map-checkin__remove"
                      onClick={() => void removeCheckin(checkin.id)}
                    >
                      删除
                    </Button>
                  </View>
                ))
              ) : (
                <Text className="muted map-checkin__empty">还没有未来打卡</Text>
              )}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}
