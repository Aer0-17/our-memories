import { useCallback, useState } from "react";
import { Button, Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { anniversaryDisplayState } from "@map-of-us/shared";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import { VoicePlayer } from "../../components/VoicePlayer";
import {
  apiBaseUrl,
  deleteAnniversaryCard,
  getAnniversaryCards,
  readSession,
  resolveAssetUrl,
  type AnniversaryCard,
} from "../../lib/api";
import coupleStanding from "../../assets/illustrations/couple-standing.png";
import "./index.scss";

export default function AnniversariesPage() {
  const [cards, setCards] = useState<AnniversaryCard[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const loadCards = useCallback(async () => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const data = await getAnniversaryCards();
      setCards(data.cards);
    } catch {
      setStatus("纪念日暂时没有同步成功，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void loadCards();
  });

  usePullDownRefresh(() => {
    void loadCards().finally(() => Taro.stopPullDownRefresh());
  });

  const currentUserId = readSession()?.user.id || "";

  const openEditor = (cardId?: string) => {
    const query = cardId ? `?id=${encodeURIComponent(cardId)}` : "";
    Taro.navigateTo({ url: `/pages/anniversary-editor/index${query}` });
  };

  const openReplay = (cardId: string) => {
    Taro.navigateTo({ url: `/pages/anniversary-replay/index?id=${encodeURIComponent(cardId)}` });
  };

  const removeCard = async (card: AnniversaryCard) => {
    if (deletingId) return;
    const result = await Taro.showModal({
      title: "删除这个纪念日？",
      content: "删除后，卡片里的照片和内容都无法恢复。",
      confirmText: "删除",
    });
    if (!result.confirm) return;

    setDeletingId(card.id);
    setStatus("");
    try {
      await deleteAnniversaryCard(card.id);
      setCards((current) => current.filter((item) => item.id !== card.id));
      Taro.showToast({ title: "纪念日已删除", icon: "success" });
    } catch {
      setStatus("删除失败。只有创建这个纪念日的人才能删除，请稍后再试。");
    } finally {
      setDeletingId("");
    }
  };

  const previewPhotos = (card: AnniversaryCard, current: string) => {
    const urls = (card.photos || [])
      .filter((photo) => Boolean(photo.url))
      .map((photo) => resolveAssetUrl(photo.url, apiBaseUrl));
    if (urls.length === 0) return;
    Taro.previewImage({ current, urls });
  };

  return (
    <View className="page anniversary-page">
      <AppHeader title="纪念日" />

      <View className="screen-intro">
        <Text className="screen-title">值得反复庆祝</Text>
        <Text className="screen-subtitle">记住重要的日子，也记住一路走来的时间。</Text>
      </View>

      {status && <ErrorBanner copy={status} onRetry={loadCards} />}
      {loading && cards.length === 0 ? (
        <LoadingState />
      ) : cards.length === 0 && !status ? (
        <EmptyState
          title="还没有纪念日"
          copy="记下第一个重要日子，以后每一年都能在这里重温。"
          actionLabel="添加第一个纪念日"
          onAction={() => openEditor()}
        />
      ) : (
        <View className="anniversary-list">
          {cards.map((card) => {
            const state = anniversaryDisplayState(card);
            const coverUrl = card.photos?.[0]?.url
              ? resolveAssetUrl(card.photos[0].url, apiBaseUrl)
              : "";
            const canManage = Boolean(currentUserId && card.createdById === currentUserId);
            return (
              <View className={card.pinned ? "anniversary-card card pinned-card" : "anniversary-card card"} key={card.id}>
                {coverUrl ? (
                  <Image
                    className="anniversary-cover"
                    src={coverUrl}
                    mode="aspectFill"
                    lazyLoad
                    onClick={() => previewPhotos(card, coverUrl)}
                  />
                ) : (
                  <View className="anniversary-cover anniversary-placeholder">
                    <Image className="anniversary-couple" src={coupleStanding} mode="aspectFit" />
                  </View>
                )}
                <View className="anniversary-body">
                  <View className="anniversary-heading">
                    <View className="anniversary-copy">
                      <Text className="anniversary-title">{card.title}</Text>
                      <Text className="anniversary-date">{card.date.replace(/[.-]/g, " / ")}</Text>
                    </View>
                    {card.pinned && <Text className="pin">特别的一天</Text>}
                  </View>

                  {state.valid && (
                    <View className="metric-row">
                      <View className="metric">
                        <Text className="metric-label">一起走过</Text>
                        <View className="metric-number-row">
                          <Text className="metric-value">{Math.abs(state.daysSince)}</Text>
                          <Text className="metric-unit">天</Text>
                        </View>
                      </View>
                      <View className="metric-divider" />
                      <View className="metric">
                        <Text className="metric-label">下一次纪念日</Text>
                        <Text className="metric-next">{state.label}</Text>
                      </View>
                    </View>
                  )}

                  {card.note && <Text className="anniversary-note">{card.note}</Text>}

                  {card.voiceUrl && (
                    <View className="anniversary-voice">
                      <Text className="anniversary-voice-label">纪念日语音</Text>
                      <VoicePlayer
                        src={resolveAssetUrl(card.voiceUrl, apiBaseUrl)}
                        compact
                        onError={setStatus}
                      />
                    </View>
                  )}

                  <Button className="anniversary-replay-action" onClick={() => openReplay(card.id)}>
                    回放这一天
                  </Button>

                  {canManage && (
                    <View className="anniversary-actions">
                      <Button className="anniversary-action" onClick={() => openEditor(card.id)}>
                        编辑
                      </Button>
                      <Button
                        className="anniversary-action danger"
                        disabled={deletingId === card.id}
                        loading={deletingId === card.id}
                        onClick={() => void removeCard(card)}
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

      <Button className="anniversary-create-fab" aria-label="新增纪念日" onClick={() => openEditor()}>
        <Text className="anniversary-create-fab-plus">+</Text>
        <Text className="anniversary-create-fab-label">新增</Text>
      </Button>
    </View>
  );
}
