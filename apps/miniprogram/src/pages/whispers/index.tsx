import { useCallback, useEffect, useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import { getWhispers, readSession, type Whisper } from "../../lib/api";
import "./index.scss";

function displayTime(value: string) {
  if (!value) return "";
  return value.slice(0, 16).replace("T", " ");
}

export default function WhispersPage() {
  const [items, setItems] = useState<Whisper[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const session = readSession();

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
      setStatus("私语暂时没有同步成功，请稍后再试。");
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
      <AppHeader title="私语" back />

      <View className="screen-intro whisper-intro">
        <Text className="screen-title">只说给你听</Text>
        <Text className="screen-subtitle">一些不需要被世界听见的话。</Text>
      </View>

      {status && <ErrorBanner copy={status} onRetry={load} />}
      {loading && items.length === 0 ? (
        <LoadingState compact />
      ) : items.length === 0 && !status ? (
        <EmptyState title="这里还很安静" copy="在网页端写下第一句悄悄话，它会只出现在你们的空间里。" />
      ) : (
        <View className="whisper-list">
          {items.map((item) => (
            <View className="whisper-thread" key={item.id}>
              <View className="whisper-heading">
                <View className="whisper-title-row">
                  <View className="whisper-dot" />
                  <Text className="whisper-title">{item.title || "未命名私语"}</Text>
                </View>
                <Text className="whisper-date">{displayTime(item.createdAt).slice(0, 10)}</Text>
              </View>

              <View className="message-list">
                {(item.messages || []).map((message) => {
                  const mine = message.userId === session?.user.id;
                  return (
                    <View className={mine ? "message-row mine" : "message-row"} key={message.id}>
                      <Text className="message-author">{mine ? session?.user.displayName || "我" : "对方"}</Text>
                      <View className="message-bubble">
                        <Text className="message-copy">{message.content || "一段语音留言"}</Text>
                        <Text className="message-meta">{displayTime(message.createdAt)}</Text>
                      </View>
                    </View>
                  );
                })}
                {item.messages?.length === 0 && <Text className="thread-empty">还没有留下回复。</Text>}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
