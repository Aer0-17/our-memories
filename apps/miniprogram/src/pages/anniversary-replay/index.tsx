import { useCallback, useMemo, useState } from "react";
import { Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useRouter } from "@tarojs/taro";
import { anniversaryDisplayState } from "@map-of-us/shared";
import { AppHeader } from "../../components/AppHeader";
import { ErrorBanner, LoadingState } from "../../components/PageStates";
import { VoicePlayer } from "../../components/VoicePlayer";
import {
  apiBaseUrl,
  getAnniversaryReplay,
  readSession,
  resolveAssetUrl,
  type AnniversaryReplay,
  type AnniversaryReplayMemory,
  type AnniversaryReplayPhoto,
} from "../../lib/api";
import calendarIcon from "../../assets/lucide/calendar-days.svg";
import coupleStanding from "../../assets/illustrations/couple-standing.png";
import "./index.scss";

function displayDate(value: string) {
  const parts = value.slice(0, 10).replace(/\./g, "-").split("-");
  if (parts.length !== 3) return value;
  return `${parts[0]} 年 ${Number(parts[1])} 月 ${Number(parts[2])} 日`;
}

function photoUrls(photos?: AnniversaryReplayPhoto[]) {
  return (photos || []).flatMap((photo) => {
    const mediaType = photo.mediaType?.toLowerCase();
    const mimeType = photo.mimeType?.toLowerCase();
    if (!photo.url || mediaType === "audio" || mimeType?.startsWith("audio/")) return [];
    return [resolveAssetUrl(photo.url, apiBaseUrl)];
  });
}

function memoryTitle(memory: AnniversaryReplayMemory) {
  return memory.title || memory.city || "一段回忆";
}

export default function AnniversaryReplayPage() {
  const router = useRouter();
  const cardId = typeof router.params.id === "string" ? router.params.id : "";
  const [data, setData] = useState<AnniversaryReplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const loadReplay = useCallback(async () => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!cardId) {
      setStatus("没有找到要回放的纪念日。");
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatus("");
    try {
      setData(await getAnniversaryReplay(cardId));
    } catch {
      setStatus("纪念日回放暂时没有加载成功，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useDidShow(() => {
    void loadReplay();
  });

  usePullDownRefresh(() => {
    void loadReplay().finally(() => Taro.stopPullDownRefresh());
  });

  const cardPhotos = useMemo(
    () => photoUrls(data?.card.photos),
    [data?.card.photos],
  );
  const heroPhoto = cardPhotos[0] || "";
  const displayState = data?.card ? anniversaryDisplayState(data.card) : null;

  const preview = (urls: string[], current: string) => {
    if (urls.length === 0) return;
    Taro.previewImage({ current, urls });
  };

  return (
    <View className="page anniversary-replay-page">
      <AppHeader title="纪念日回放" back />

      {status && <ErrorBanner copy={status} onRetry={loadReplay} />}
      {loading && !data ? (
        <LoadingState />
      ) : data?.card ? (
        <View className="replay-content">
          <View className={heroPhoto ? "replay-hero has-photo" : "replay-hero no-photo"}>
            {heroPhoto ? (
              <Image
                className="replay-hero-image"
                src={heroPhoto}
                mode="aspectFill"
                onClick={() => preview(cardPhotos, heroPhoto)}
              />
            ) : (
              <Image className="replay-hero-couple" src={coupleStanding} mode="aspectFit" />
            )}
            {heroPhoto && <View className="replay-hero-shade" />}
            <View className="replay-hero-copy">
              <View className="replay-hero-mark">
                <Image className="replay-hero-mark-icon" src={calendarIcon} mode="aspectFit" />
                <Text className="replay-hero-date">{displayDate(data.card.date)}</Text>
              </View>
              <Text className="replay-hero-title">{data.card.title}</Text>
            </View>
          </View>

          {displayState?.valid && (
            <View className="replay-metrics">
              <View className="replay-metric">
                <Text className="replay-metric-label">
                  {displayState.daysSince >= 0 ? "从这一天起" : "距离这一天"}
                </Text>
                <View className="replay-metric-value-row">
                  <Text className="replay-metric-value">{Math.abs(displayState.daysSince)}</Text>
                  <Text className="replay-metric-unit">天</Text>
                </View>
              </View>
              <View className="replay-metric-divider" />
              <View className="replay-metric">
                <Text className="replay-metric-label">下一次纪念日</Text>
                <Text className="replay-metric-next">{displayState.label}</Text>
              </View>
            </View>
          )}

          {data.card.note && (
            <View className="replay-note">
              <Text className="replay-note-label">写给这一天</Text>
              <Text className="replay-note-copy">{data.card.note}</Text>
            </View>
          )}

          {data.card.voiceUrl && (
            <View className="replay-voice-section">
              <Text className="replay-section-eyebrow">那天留下的声音</Text>
              <VoicePlayer
                src={resolveAssetUrl(data.card.voiceUrl, apiBaseUrl)}
                label="纪念日语音"
                onError={setStatus}
              />
            </View>
          )}

          {cardPhotos.length > 1 && (
            <View className="replay-gallery-section">
              <View className="replay-section-heading">
                <Text className="replay-section-title">这一天的照片</Text>
                <Text className="replay-section-count">{cardPhotos.length} 张</Text>
              </View>
              <View className="replay-gallery">
                {cardPhotos.map((photo, index) => (
                  <Image
                    className="replay-gallery-image"
                    key={`${photo}-${index}`}
                    src={photo}
                    mode="aspectFill"
                    lazyLoad
                    onClick={() => preview(cardPhotos, photo)}
                  />
                ))}
              </View>
            </View>
          )}

          <View className="replay-memories-section">
            <View className="replay-section-heading replay-memories-heading">
              <View className="replay-section-heading-copy">
                <Text className="replay-section-title">那几天的回忆</Text>
                <Text className="replay-section-subtitle">同一日期前后 3 天，被时间重新串在一起。</Text>
              </View>
              <Text className="replay-section-count">{data.memories.length} 段</Text>
            </View>

            {data.memories.length === 0 ? (
              <View className="replay-empty">
                <Image className="replay-empty-icon" src={calendarIcon} mode="aspectFit" />
                <Text className="replay-empty-title">还没有匹配到回忆</Text>
                <Text className="replay-empty-copy">以后记录在这个日期附近的故事，也会出现在这里。</Text>
              </View>
            ) : (
              <View className="replay-memory-list">
                {data.memories.map((memory) => {
                  const photos = photoUrls(memory.photos);
                  const cover = photos[0] || "";
                  return (
                    <View className="replay-memory card" key={memory.id}>
                      {cover ? (
                        <View className="replay-memory-media" onClick={() => preview(photos, cover)}>
                          <Image className="replay-memory-image" src={cover} mode="aspectFill" lazyLoad />
                          {photos.length > 1 && (
                            <Text className="replay-memory-photo-count">+{photos.length - 1}</Text>
                          )}
                        </View>
                      ) : (
                        <View className="replay-memory-media replay-memory-placeholder">
                          <Image className="replay-memory-placeholder-icon" src={calendarIcon} mode="aspectFit" />
                        </View>
                      )}

                      <View className="replay-memory-body">
                        <Text className="replay-memory-title">{memoryTitle(memory)}</Text>
                        <Text className="replay-memory-meta">
                          {[memory.city, memory.placeName, displayDate(memory.date)].filter(Boolean).join(" · ")}
                        </Text>
                        {memory.text && <Text className="replay-memory-text">{memory.text}</Text>}
                        {(memory.mood || memory.tags?.length) && (
                          <View className="replay-memory-tags">
                            {memory.mood && <Text className="replay-memory-tag mood">{memory.mood}</Text>}
                            {memory.tags?.slice(0, 2).map((tag) => (
                              <Text className="replay-memory-tag" key={`${memory.id}-${tag}`}>#{tag}</Text>
                            ))}
                          </View>
                        )}
                        {memory.voiceTextUrl && (
                          <View className="replay-memory-voice">
                            <Text className="replay-memory-voice-label">回忆语音</Text>
                            <VoicePlayer
                              src={resolveAssetUrl(memory.voiceTextUrl, apiBaseUrl)}
                              compact
                              onError={setStatus}
                            />
                          </View>
                        )}
                        {(memory.partnerNote || memory.partnerVoiceUrl) && (
                          <View className="replay-memory-partner-note">
                            {memory.partnerNote && (
                              <Text className="replay-memory-partner-copy">{memory.partnerNote}</Text>
                            )}
                            {memory.partnerVoiceUrl && (
                              <VoicePlayer
                                src={resolveAssetUrl(memory.partnerVoiceUrl, apiBaseUrl)}
                                compact
                                onError={setStatus}
                              />
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}
