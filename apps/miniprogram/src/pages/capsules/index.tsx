import { useCallback, useEffect, useState } from "react";
import { Image, Text, View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import { apiBaseUrl, getTimeCapsules, readSession, resolveAssetUrl, type TimeCapsule } from "../../lib/api";
import hourglassIcon from "../../assets/illustrations/icon-hourglass.png";
import "./index.scss";

function daysUntil(value: string) {
  const target = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

export default function CapsulesPage() {
  const [items, setItems] = useState<TimeCapsule[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const data = await getTimeCapsules();
      setItems(data.timeCapsules);
    } catch {
      setStatus("时光胶囊暂时没有同步成功，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  usePullDownRefresh(() => {
    void load().finally(() => Taro.stopPullDownRefresh());
  });

  return (
    <View className="page capsules-page">
      <AppHeader title="时光胶囊" back />

      <View className="screen-intro capsule-intro">
        <Text className="screen-title">写给未来的我们</Text>
        <Text className="screen-subtitle">有些话，交给时间替我们好好保存。</Text>
      </View>

      {status && <ErrorBanner copy={status} onRetry={load} />}
      {loading && items.length === 0 ? (
        <LoadingState />
      ) : items.length === 0 && !status ? (
        <EmptyState title="还没有时光胶囊" copy="在网页端写下一封信，等约定的那一天一起打开。" />
      ) : (
        <View className="capsule-list">
          {items.map((item) => {
            const days = daysUntil(item.openDate);
            const hasOpenedPhoto = item.isOpened && Boolean(item.photos?.[0]?.url);
            const waitingDays = days !== null && days > 0 ? days : null;
            return (
              <View className="capsule-card card" key={item.id}>
                {hasOpenedPhoto ? (
                  <Image
                    className="capsule-cover"
                    src={resolveAssetUrl(item.photos?.[0]?.url, apiBaseUrl)}
                    mode="aspectFill"
                    lazyLoad
                  />
                ) : (
                  <View className={item.isOpened ? "capsule-cover capsule-placeholder opened" : "capsule-cover capsule-placeholder"}>
                    <Image className="capsule-icon" src={hourglassIcon} mode="aspectFit" />
                    {item.isOpened ? (
                      <Text className="capsule-placeholder-title">已经来到约定的这一天</Text>
                    ) : waitingDays ? (
                      <View className="countdown">
                        <Text className="countdown-value">{waitingDays}</Text>
                        <Text className="countdown-label">天后开启</Text>
                      </View>
                    ) : (
                      <Text className="capsule-placeholder-title">已经到开启日期</Text>
                    )}
                  </View>
                )}

                <View className="capsule-body">
                  <View className="capsule-heading">
                    <View className="capsule-title-copy">
                      <Text className="capsule-date">约定于 {item.openDate}</Text>
                      <Text className="capsule-title">{item.title || "未命名胶囊"}</Text>
                    </View>
                    <Text className={item.isOpened ? "capsule-state opened" : "capsule-state locked"}>
                      {item.isOpened ? "已开启" : "封存中"}
                    </Text>
                  </View>

                  <Text className="capsule-mode">{item.openMode === "together" ? "两个人一起开启" : "到期后即可开启"}</Text>
                  <Text className={item.isOpened ? "capsule-content" : "capsule-content locked-copy"}>
                    {item.isOpened ? item.content || "这枚胶囊已经开启。" : "内容会在约定的日期到来后显示。"}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
