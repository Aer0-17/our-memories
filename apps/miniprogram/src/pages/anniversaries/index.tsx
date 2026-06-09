import { useEffect, useState } from "react";
import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { anniversaryDisplayState, type AnniversaryCard } from "@map-of-us/shared";
import { getAnniversaryCards, readSession } from "../../lib/api";
import "./index.scss";

export default function AnniversariesPage() {
  const [cards, setCards] = useState<AnniversaryCard[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    void getAnniversaryCards()
      .then((data) => setCards(data.cards))
      .catch(() => setStatus("纪念日墙读取失败，请稍后再试。"));
  }, []);

  return (
    <View className="page anniversary-page">
      <View className="page-head">
        <Text className="title">纪念日墙</Text>
        <Text className="subtitle">每张卡片都在替我们数日子。</Text>
      </View>
      {status && <Text className="status">{status}</Text>}
      {cards.length === 0 ? (
        <View className="empty card">
          <Text className="empty-title">还没有纪念日</Text>
          <Text className="empty-copy">先在 Web 里添加照片纪念卡，小程序会同步展示。</Text>
        </View>
      ) : (
        <View className="anniversary-list">
          {cards.map((card) => {
            const state = anniversaryDisplayState(card);
            return (
              <View className="anniversary-card card" key={card.id}>
                {card.image ? (
                  <Image className="anniversary-cover" src={card.image} mode="aspectFill" />
                ) : (
                  <View className="anniversary-cover placeholder">
                    <Text>纪念日</Text>
                  </View>
                )}
                <View className="anniversary-body">
                  <View className="anniversary-row">
                    <Text className="anniversary-title">{card.title}</Text>
                    {card.pinned && <Text className="pin">置顶</Text>}
                  </View>
                  <Text className="anniversary-date">{card.date}</Text>
                  {state.valid && (
                    <View className="metric-grid">
                      <View className="metric pink">
                        <Text className="metric-label">距今</Text>
                        <Text className="metric-value">{state.sinceLabel}</Text>
                      </View>
                      <View className="metric blue">
                        <Text className="metric-label">下一次</Text>
                        <Text className="metric-value">{state.label}</Text>
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
