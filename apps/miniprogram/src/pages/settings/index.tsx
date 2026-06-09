import { useEffect, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { bindWechat, clearSession, readSession, type Session } from "../../lib/api";
import "./index.scss";

export default function SettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setSession(readSession());
  }, []);

  const bind = async () => {
    if (working) return;
    setWorking(true);
    setStatus("");
    try {
      await bindWechat();
      setStatus("微信已绑定，下次可用于快捷进入。");
    } catch {
      setStatus("绑定失败，请确认服务端已配置小程序 appid 和 secret。");
    } finally {
      setWorking(false);
    }
  };

  const logout = () => {
    clearSession();
    setSession(null);
    Taro.switchTab({ url: "/pages/index/index" });
  };

  return (
    <View className="page settings-page">
      <View className="page-head">
        <Text className="title">设置</Text>
        <Text className="subtitle">管理当前小程序会话。</Text>
      </View>

      <View className="card settings-card">
        <Text className="label">当前空间</Text>
        <Text className="value">{session?.space.name || "未登录"}</Text>
        {session?.space.slug && <Text className="muted">slug：{session.space.slug}</Text>}
      </View>

      <View className="card settings-card">
        <Text className="label">当前账号</Text>
        <Text className="value">{session?.user.displayName || "未登录"}</Text>
        {session?.membership.role && <Text className="muted">角色：{session.membership.role}</Text>}
      </View>

      <Button className="btn" loading={working} disabled={!session} onClick={bind}>绑定微信快捷进入</Button>
      <Button className="btn btn-secondary" onClick={logout}>退出登录</Button>
      {status && <Text className="status">{status}</Text>}
    </View>
  );
}
