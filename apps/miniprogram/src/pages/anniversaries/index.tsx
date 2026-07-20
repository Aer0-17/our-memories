import { useCallback, useEffect, useState } from "react";
import { Image, Text, View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import { anniversaryDisplayState, type AnniversaryCard } from "@map-of-us/shared";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import { apiBaseUrl, getAnniversaryCards, readSession, resolveAssetUrl } from "../../lib/api";
import coupleStanding from "../../assets/illustrations/couple-standing.png";
import "./index.scss";

export default function AnniversariesPage() {
  const [cards, setCards] = useState<AnniversaryCard[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  usePullDownRefresh(() => {
    void loadCards().finally(() => Taro.stopPullDownRefresh());
  });

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
        <EmptyState title="还没有纪念日" copy="在网页端添加一张纪念卡，它会和照片一起出现在这里。" />
      ) : (
        <View className="anniversary-list">
          {cards.map((card) => {
            const state = anniversaryDisplayState(card);
            return (
              <View className={card.pinned ? "anniversary-card card pinned-card" : "anniversary-card card"} key={card.id}>
                {card.image ? (
                  <Image
                    className="anniversary-cover"
                    src={resolveAssetUrl(card.image, apiBaseUrl)}
                    mode="aspectFill"
                    lazyLoad
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
                      <Text className="anniversary-date">{card.date.split(".").join(" / ")}</Text>
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
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
