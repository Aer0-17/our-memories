import { useCallback, useEffect, useState } from "react";
import { Image, Text, View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import { getTimeCapsules, readSession, type TimeCapsule } from "../../lib/api";
import "./index.scss";

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
      setStatus("时光胶囊读取失败，请重新登录后再试。");
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
      <View className="page-head">
        <Text className="title">时光胶囊</Text>
        <Text className="subtitle">{loading ? "同步中..." : "把今天留给未来的你们。"}</Text>
      </View>
      {status && <Text className="status">{status}</Text>}
      {items.length === 0 ? (
        <View className="empty card">
          <Text className="empty-title">还没有时光胶囊</Text>
          <Text className="empty-copy">在 Web 端写下一封信，等它在未来打开。</Text>
        </View>
      ) : (
        <View className="capsule-list">
          {items.map((item) => (
            <View className="card capsule-card" key={item.id}>
              {item.photos?.[0]?.url && <Image className="capsule-cover" src={item.photos[0].url} mode="aspectFill" />}
              <View className="capsule-body">
                <View className="capsule-head">
                  <Text className="capsule-title">{item.title}</Text>
                  <Text className={item.isOpened ? "state opened" : "state locked"}>{item.isOpened ? "已开启" : "待开启"}</Text>
                </View>
                <Text className="capsule-date">开启日期：{item.openDate}</Text>
                <Text className="capsule-copy">{item.content || "内容将在开启日期到来后显示。"}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
