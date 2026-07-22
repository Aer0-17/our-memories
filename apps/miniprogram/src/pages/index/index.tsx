import { useEffect, useState } from "react";
import { Button, Image, Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { ErrorBanner } from "../../components/PageStates";
import {
  getPublicConfig,
  login,
  readSession,
  verifyPassword,
  type LoginMember,
  type PublicConfig,
  type Session,
} from "../../lib/api";
import avatarUs from "../../assets/illustrations/avatar-us.png";
import coupleStanding from "../../assets/illustrations/couple-standing.png";
import loginCity from "../../assets/illustrations/login-city.jpg";
import memoryIcon from "../../assets/tabbar/images-active.png";
import anniversaryIcon from "../../assets/tabbar/calendar-days-active.png";
import whisperIcon from "../../assets/illustrations/icon-message-circle.png";
import capsuleIcon from "../../assets/illustrations/icon-hourglass.png";
import shieldIcon from "../../assets/illustrations/icon-shield-check.png";
import userIcon from "../../assets/illustrations/icon-user-round.png";
import "./index.scss";

export default function IndexPage() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [spaceCode, setSpaceCode] = useState("");
  const [loginStep, setLoginStep] = useState<1 | 2>(1);
  const [verifiedUsers, setVerifiedUsers] = useState<LoginMember[]>([]);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  const loadConfig = () => {
    setStatus("");
    return getPublicConfig()
      .then((value) => {
        setConfig(value);
        setSpaceCode(value.spaceCode);
      })
      .catch(() => setStatus("暂时无法连接你们的空间，请稍后重试。"));
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  useDidShow(() => {
    const currentSession = readSession();
    setSession(currentSession);
    if (!currentSession) {
      setLoginStep(1);
      setVerifiedUsers([]);
      setUserId("");
      setPassword("");
      setStatus("");
    }
  });

  usePullDownRefresh(() => {
    setSession(readSession());
    void loadConfig().finally(() => Taro.stopPullDownRefresh());
  });

  const submitLogin = async () => {
    if (working) return;
    if (loginStep === 1 && (!spaceCode.trim() || !password.trim())) {
      setStatus("请填写空间码和密码。下次登录会保留当前空间。");
      return;
    }
    if (loginStep === 2 && !userId) {
      setStatus("请选择你的真实身份。");
      return;
    }
    setWorking(true);
    setStatus("");
    try {
      if (loginStep === 1) {
        const result = await verifyPassword({ spaceCode: spaceCode.trim(), password });
        setVerifiedUsers(result.users);
        setLoginStep(2);
        return;
      }
      const nextSession = await login({ spaceCode: spaceCode.trim(), userId, password });
      setSession(nextSession);
      setPassword("");
      Taro.switchTab({ url: "/pages/memories/index" });
    } catch {
      setStatus(loginStep === 1 ? "密码没有验证通过，请检查后再试。" : "身份登录失败，请重新验证密码。");
      if (loginStep === 2) {
        setLoginStep(1);
        setVerifiedUsers([]);
        setUserId("");
        setPassword("");
      }
    } finally {
      setWorking(false);
    }
  };

  const resetVerification = () => {
    setLoginStep(1);
    setVerifiedUsers([]);
    setUserId("");
    setPassword("");
    setStatus("");
  };

  const openSection = (url: string, tab = false) => {
    if (tab) {
      Taro.switchTab({ url });
      return;
    }
    Taro.navigateTo({ url });
  };

  if (session) {
    return (
      <View className="page home-page">
        <AppHeader title={session.space.name} />

        <View className="home-hero">
          <View className="home-copy">
            <Text className="home-kicker">欢迎回来</Text>
            <Text className="home-title">{session.user.displayName}</Text>
            <Text className="home-subtitle">去看看我们最近留下的片段。</Text>
          </View>
          <Image className="home-avatar" src={avatarUs} mode="aspectFit" />
        </View>

        <View className="section-heading">
          <Text className="section-title">我们的空间</Text>
          <Text className="section-note">只在登录后可见</Text>
        </View>

        <View className="shortcut-grid">
          <Button className="shortcut shortcut-memory" onClick={() => openSection("/pages/memories/index", true)}>
            <Image className="shortcut-icon" src={memoryIcon} mode="aspectFit" />
            <View className="shortcut-copy">
              <Text className="shortcut-title">回忆记录</Text>
              <Text className="shortcut-meta">照片与足迹</Text>
            </View>
            <Text className="shortcut-arrow">›</Text>
          </Button>
          <Button className="shortcut shortcut-map" onClick={() => openSection("/pages/map/index")}>
            <Image className="shortcut-icon" src={memoryIcon} mode="aspectFit" />
            <View className="shortcut-copy">
              <Text className="shortcut-title">足迹地图</Text>
              <Text className="shortcut-meta">点亮走过的地方</Text>
            </View>
            <Text className="shortcut-arrow">›</Text>
          </Button>
          <Button className="shortcut shortcut-anniversary" onClick={() => openSection("/pages/anniversaries/index", true)}>
            <Image className="shortcut-icon" src={anniversaryIcon} mode="aspectFit" />
            <View className="shortcut-copy">
              <Text className="shortcut-title">纪念日</Text>
              <Text className="shortcut-meta">一起数日子</Text>
            </View>
            <Text className="shortcut-arrow">›</Text>
          </Button>
          <Button className="shortcut shortcut-whisper" onClick={() => openSection("/pages/whispers/index")}>
            <Image className="shortcut-icon" src={whisperIcon} mode="aspectFit" />
            <View className="shortcut-copy">
              <Text className="shortcut-title">私语</Text>
              <Text className="shortcut-meta">两个人的对话</Text>
            </View>
            <Text className="shortcut-arrow">›</Text>
          </Button>
          <Button className="shortcut shortcut-capsule" onClick={() => openSection("/pages/capsules/index")}>
            <Image className="shortcut-icon" src={capsuleIcon} mode="aspectFit" />
            <View className="shortcut-copy">
              <Text className="shortcut-title">时光胶囊</Text>
              <Text className="shortcut-meta">留给未来</Text>
            </View>
            <Text className="shortcut-arrow">›</Text>
          </Button>
        </View>

        <View className="privacy-note">
          <Image className="privacy-icon" src={shieldIcon} mode="aspectFit" />
          <View className="privacy-copy">
            <Text className="privacy-title">私密空间</Text>
            <Text className="privacy-text">只有你们登录后才能查看里面的内容。</Text>
          </View>
        </View>
      </View>
    );
  }

  const selectedUser = verifiedUsers.find((user) => user.username === userId);

  return (
    <View className="page entry-page">
      <AppHeader title="OUR MEMORIES" brand />

      <View className="entry-hero">
        <Image className="entry-scene" src={loginCity} mode="aspectFill" />
        <Image className="entry-couple" src={coupleStanding} mode="aspectFit" />
        <View className="entry-hero-copy">
          <Text className="entry-title">{config?.spaceName || "回忆地图"}</Text>
          <Text className="entry-subtitle">把一起走过的路，安静地收在这里。</Text>
        </View>
      </View>

      <View className="login-section">
        <View className="login-heading">
          <Text className="login-title">{loginStep === 1 ? "验证空间密码" : "选择真实身份"}</Text>
          <Text className="login-step">{loginStep === 1 ? "01 / 02" : "02 / 02"}</Text>
        </View>

        {loginStep === 1 ? (
          <View className="login-fields">
            <View className="field-group">
              <Text className="field-label">空间码</Text>
              <Input
                className="field"
                value={spaceCode}
                onInput={(event) => setSpaceCode(event.detail.value)}
                placeholder="输入空间码"
              />
            </View>
            <View className="field-group">
              <Text className="field-label">空间密码</Text>
              <Input
                className="field"
                maxlength={64}
                password
                confirmType="done"
                value={password}
                onConfirm={submitLogin}
                onInput={(event) => setPassword(event.detail.value)}
                placeholder={`输入 ${config?.passcodeLength || 8} 位密码`}
              />
            </View>
          </View>
        ) : (
          <>
            <View className="verified-row">
              <Image className="verified-icon" src={shieldIcon} mode="aspectFit" />
              <View className="verified-copy">
                <Text className="verified-title">密码已通过</Text>
                <Text className="verified-text">现在请选择你在这个空间里的身份。</Text>
              </View>
              <Button className="change-password" onClick={resetVerification}>重输</Button>
            </View>

            <View className="account-switch" aria-label="选择真实身份">
              {verifiedUsers.map((user) => (
                <Button
                  className={userId === user.username ? "account active" : "account"}
                  key={user.username}
                  onClick={() => setUserId(user.username)}
                >
                  <View className="account-avatar">
                    <Image className="account-avatar-icon" src={userIcon} mode="aspectFit" />
                  </View>
                  <Text className="account-name">{user.displayName}</Text>
                  <Text className="account-state">{userId === user.username ? "已选择" : "选择"}</Text>
                </Button>
              ))}
            </View>
          </>
        )}

        {status && <ErrorBanner copy={status} onRetry={status.includes("连接") ? loadConfig : undefined} />}

        <Button
          className="btn login-button"
          loading={working}
          disabled={working || (loginStep === 2 && !userId)}
          onClick={submitLogin}
        >
          {working
            ? loginStep === 1 ? "正在验证…" : "正在进入…"
            : loginStep === 1 ? "验证并继续"
              : selectedUser ? `以 ${selectedUser.displayName} 身份进入` : "选择身份后进入"}
        </Button>
      </View>
    </View>
  );
}
