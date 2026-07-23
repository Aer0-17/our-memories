import { useState } from "react";
import { Button, Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { logout, readSession, type Session } from "../../lib/api";
import avatarUs from "../../assets/illustrations/avatar-us.png";
import whisperIcon from "../../assets/illustrations/icon-message-circle.png";
import capsuleIcon from "../../assets/illustrations/icon-hourglass.png";
import diaryIcon from "../../assets/lucide/calendar-days.svg";
import logoutIcon from "../../assets/illustrations/icon-log-out.png";
import "./index.scss";

export default function SettingsPage() {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [working, setWorking] = useState(false);

  useDidShow(() => {
    setSession(readSession());
  });

  usePullDownRefresh(() => {
    setSession(readSession());
    Taro.stopPullDownRefresh();
  });

  const signOut = async () => {
    if (working) return;
    setWorking(true);
    await logout();
    setSession(null);
    setWorking(false);
    Taro.switchTab({ url: "/pages/index/index" });
  };

  const openPage = (url: string) => Taro.navigateTo({ url });

  if (!session) {
    return (
      <View className="page settings-page">
        <AppHeader title="我的" />
        <View className="signed-out-state">
          <Image className="signed-out-avatar" src={avatarUs} mode="aspectFit" />
          <Text className="signed-out-title">还没有进入空间</Text>
          <Text className="signed-out-copy">登录后才能查看当前身份和私密内容。</Text>
          <Button className="btn signed-out-button" onClick={() => Taro.switchTab({ url: "/pages/index/index" })}>
            去登录
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="page settings-page">
      <AppHeader title="我的" />

      <View className="profile-hero">
        <Image className="profile-avatar" src={avatarUs} mode="aspectFit" />
        <View className="profile-copy">
          <Text className="profile-kicker">当前身份</Text>
          <Text className="profile-name">{session.user.displayName}</Text>
          <Text className="profile-space">{session.space.name}</Text>
        </View>
      </View>

      <View className="settings-section">
        <Text className="settings-section-title">空间信息</Text>
        <View className="info-list">
          <View className="info-row">
            <Text className="info-label">空间名称</Text>
            <Text className="info-value">{session.space.name}</Text>
          </View>
          <View className="info-row">
            <Text className="info-label">空间码</Text>
            <Text className="info-value code">{session.space.spaceCode}</Text>
          </View>
          <View className="info-row">
            <Text className="info-label">登录账号</Text>
            <Text className="info-value">{session.user.username}</Text>
          </View>
        </View>
      </View>

      <View className="settings-section">
        <Text className="settings-section-title">更多内容</Text>
        <View className="action-list">
          <Button className="settings-action" onClick={() => openPage("/pages/whispers/index")}>
            <View className="action-icon-box action-icon-blue">
              <Image className="action-icon" src={whisperIcon} mode="aspectFit" />
            </View>
            <View className="action-copy">
              <Text className="action-title">私语</Text>
              <Text className="action-subtitle">查看两个人的对话</Text>
            </View>
            <Text className="action-arrow">›</Text>
          </Button>
          <Button className="settings-action" onClick={() => openPage("/pages/capsules/index")}>
            <View className="action-icon-box action-icon-gold">
              <Image className="action-icon" src={capsuleIcon} mode="aspectFit" />
            </View>
            <View className="action-copy">
              <Text className="action-title">时光胶囊</Text>
              <Text className="action-subtitle">看看留给未来的信</Text>
            </View>
            <Text className="action-arrow">›</Text>
          </Button>
          <Button className="settings-action" onClick={() => openPage("/pages/diaries/index")}>
            <View className="action-icon-box action-icon-green">
              <Image className="action-icon" src={diaryIcon} mode="aspectFit" />
            </View>
            <View className="action-copy">
              <Text className="action-title">双人日记</Text>
              <Text className="action-subtitle">一起记录还没归档的片段</Text>
            </View>
            <Text className="action-arrow">›</Text>
          </Button>
        </View>
      </View>

      <Button className="logout-button" disabled={working} onClick={signOut}>
        <Image className="logout-icon" src={logoutIcon} mode="aspectFit" />
        <Text>{working ? "正在退出…" : "退出当前账号"}</Text>
      </Button>
    </View>
  );
}
