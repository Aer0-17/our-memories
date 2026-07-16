import { useCallback, useEffect, useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import { getWhispers, readSession, type Whisper } from "../../lib/api";
import "./index.scss";

export default function WhispersPage() {
  const [items, setItems] = useState<Whisper[]>([]);
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
      const data = await getWhispers();
      setItems(data.whispers);
    } catch {
      setStatus("私语读取失败，请重新登录后再试。");
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
    <View className="page whispers-page">
      <View className="page-head">
        <Text className="title">私语</Text>
        <Text className="subtitle">{loading ? "同步中..." : "只留给你们两个人的对话。"}</Text>
      </View>
      {status && <Text className="status">{status}</Text>}
      {items.length === 0 ? (
        <View className="empty card">
          <Text className="empty-title">还没有私语</Text>
          <Text className="empty-copy">在 Web 端写下第一句悄悄话，它会同步到这里。</Text>
        </View>
      ) : (
        <View className="whisper-list">
          {items.map((item) => (
            <View className="card whisper-card" key={item.id}>
              <View className="whisper-head">
                <Text className="whisper-title">{item.title}</Text>
                <Text className="whisper-date">{item.createdAt.slice(0, 10)}</Text>
              </View>
              <View className="message-list">
                {(item.messages || []).map((message) => (
                  <View className="message" key={message.id}>
                    <Text className="message-copy">{message.content || "语音留言"}</Text>
                    <Text className="message-meta">{message.createdAt.slice(0, 16).replace("T", " ")}</Text>
                  </View>
                ))}
                {item.messages?.length === 0 && <Text className="muted">还没有留言</Text>}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
