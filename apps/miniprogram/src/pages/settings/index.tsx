import { useEffect, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import { logout, readSession, type Session } from "../../lib/api";
import "./index.scss";

export default function SettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setSession(readSession());
  }, []);

  usePullDownRefresh(() => {
    setSession(readSession());
    setStatus("");
    Taro.stopPullDownRefresh();
  });

  const signOut = async () => {
    await logout();
    setSession(null);
    Taro.switchTab({ url: "/pages/index/index" });
  };

  const openPage = (url: string) => Taro.navigateTo({ url });

  return (
    <View className="page settings-page">
      <View className="page-head">
        <Text className="title">设置</Text>
        <Text className="subtitle">管理当前小程序会话。</Text>
      </View>

      <View className="card settings-card">
        <Text className="label">当前空间</Text>
        <Text className="value">{session?.space.name || "未登录"}</Text>
        {session?.space.spaceCode && <Text className="muted">空间码：{session.space.spaceCode}</Text>}
      </View>

      <View className="card settings-card">
        <Text className="label">当前账号</Text>
        <Text className="value">{session?.user.displayName || "未登录"}</Text>
        {session?.user.username && <Text className="muted">账号：{session.user.username}</Text>}
      </View>

      <View className="link-grid">
        <Button className="btn btn-secondary" disabled={!session} onClick={() => openPage("/pages/whispers/index")}>查看私语</Button>
        <Button className="btn btn-secondary" disabled={!session} onClick={() => openPage("/pages/capsules/index")}>查看时光胶囊</Button>
      </View>
      <Button className="btn btn-secondary" onClick={signOut}>退出登录</Button>
      {status && <Text className="status">{status}</Text>}
    </View>
  );
}
