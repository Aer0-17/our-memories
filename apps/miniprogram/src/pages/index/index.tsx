import { useEffect, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import { getPublicConfig, login, type PublicConfig } from "../../lib/api";
import "./index.scss";

export default function IndexPage() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [spaceCode, setSpaceCode] = useState("");
  const [userId, setUserId] = useState("me");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    void getPublicConfig()
      .then((value) => {
        setConfig(value);
        setSpaceCode(value.spaceCode);
      })
      .catch(() => setStatus("暂时无法连接服务，请检查小程序 API 域名配置。"));
  }, []);

  usePullDownRefresh(() => {
    setStatus("");
    Taro.stopPullDownRefresh();
  });

  const submitLogin = async () => {
    if (working) return;
    if (!spaceCode.trim() || !password.trim()) {
      setStatus("请填写空间码和密码。");
      return;
    }
    setWorking(true);
    setStatus("");
    try {
      await login({ spaceCode: spaceCode.trim(), userId, password });
      Taro.switchTab({ url: "/pages/memories/index" });
    } catch {
      setStatus("登录失败，请检查空间码、账号和密码。");
    } finally {
      setWorking(false);
    }
  };

  return (
    <View className="page entry-page">
      <View className="entry-hero">
        <Text className="entry-eyebrow">private couple space</Text>
        <Text className="entry-title">{config?.spaceName || "回忆地图"}</Text>
        <Text className="entry-subtitle">打开你们的回忆、纪念日和私语。</Text>
      </View>

      <View className="account-switch" aria-label="选择账号">
        {(config?.users.length ? config.users : [
          { username: "me", displayName: "我" },
          { username: "ta", displayName: "TA" },
        ]).map((user) => (
          <Button
            className={userId === user.username ? "account active" : "account"}
            key={user.username}
            onClick={() => setUserId(user.username)}
          >
            {user.displayName}
          </Button>
        ))}
      </View>

      <View className="card form-card">
        <View className="field-group">
          <Text className="field-label">空间码</Text>
          <Input className="field" value={spaceCode} onInput={(event) => setSpaceCode(event.detail.value)} placeholder="例如 our-space-2026" />
        </View>
        <View className="field-group">
          <Text className="field-label">密码</Text>
          <Input className="field" password value={password} onInput={(event) => setPassword(event.detail.value)} placeholder="输入空间密码" />
        </View>
        <Button className="btn" loading={working} onClick={submitLogin}>打开回忆</Button>
      </View>

      {status && <Text className="status">{status}</Text>}
    </View>
  );
}
