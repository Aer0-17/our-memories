import { useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import { claimActivation, login } from "../../lib/api";
import "./index.scss";

type Mode = "login" | "claim";

export default function IndexPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [spaceSlug, setSpaceSlug] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [spaceName, setSpaceName] = useState("回忆地图");
  const [firstName, setFirstName] = useState("me");
  const [firstPassword, setFirstPassword] = useState("");
  const [secondName, setSecondName] = useState("her");
  const [secondPassword, setSecondPassword] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  usePullDownRefresh(() => {
    setStatus("");
    Taro.stopPullDownRefresh();
  });

  const submitLogin = async () => {
    if (working) return;
    setWorking(true);
    setStatus("");
    try {
      await login({ username, password, spaceSlug: spaceSlug || undefined });
      Taro.switchTab({ url: "/pages/memories/index" });
    } catch {
      setStatus("登录失败，请检查空间 slug、账号和四位密码。");
    } finally {
      setWorking(false);
    }
  };

  const submitClaim = async () => {
    if (working) return;
    setWorking(true);
    setStatus("");
    try {
      const result = await claimActivation({
        code,
        spaceName,
        accounts: [
          { username: firstName, password: firstPassword },
          { username: secondName, password: secondPassword },
        ],
      });
      setSpaceSlug(result.space.slug);
      setUsername(firstName);
      setPassword(firstPassword);
      setMode("login");
      setStatus(`开通成功，空间 slug：${result.space.slug}`);
    } catch {
      setStatus("开通失败，请确认开通码和两个四位密码。");
    } finally {
      setWorking(false);
    }
  };

  return (
    <View className="page entry-page">
      <View className="entry-hero">
        <Text className="entry-eyebrow">private couple space</Text>
        <Text className="entry-title">回忆地图</Text>
        <Text className="entry-subtitle">用四位密码打开地图、照片和纪念日墙。</Text>
      </View>

      <View className="mode-switch">
        <Button className={mode === "login" ? "mode active" : "mode"} onClick={() => setMode("login")}>登录</Button>
        <Button className={mode === "claim" ? "mode active" : "mode"} onClick={() => setMode("claim")}>开通</Button>
      </View>

      {mode === "login" ? (
        <View className="card form-card">
          <Input className="field" value={spaceSlug} onInput={(event) => setSpaceSlug(event.detail.value)} placeholder="空间 slug，默认空间可留空" />
          <Input className="field" value={username} onInput={(event) => setUsername(event.detail.value)} placeholder="账号名" />
          <Input className="field" password value={password} onInput={(event) => setPassword(event.detail.value.replace(/\D/g, "").slice(0, 4))} placeholder="四位密码" />
          <Button className="btn" loading={working} onClick={submitLogin}>打开回忆</Button>
        </View>
      ) : (
        <View className="card form-card">
          <Input className="field" value={code} onInput={(event) => setCode(event.detail.value)} placeholder="一次性开通码" />
          <Input className="field" value={spaceName} onInput={(event) => setSpaceName(event.detail.value)} placeholder="空间名称" />
          <View className="account-grid">
            <Input className="field" value={firstName} onInput={(event) => setFirstName(event.detail.value)} placeholder="账号 1" />
            <Input className="field" password value={firstPassword} onInput={(event) => setFirstPassword(event.detail.value.replace(/\D/g, "").slice(0, 4))} placeholder="四位密码" />
            <Input className="field" value={secondName} onInput={(event) => setSecondName(event.detail.value)} placeholder="账号 2" />
            <Input className="field" password value={secondPassword} onInput={(event) => setSecondPassword(event.detail.value.replace(/\D/g, "").slice(0, 4))} placeholder="四位密码" />
          </View>
          <Button className="btn" loading={working} onClick={submitClaim}>创建我们的空间</Button>
        </View>
      )}

      {status && <Text className="status">{status}</Text>}
    </View>
  );
}
