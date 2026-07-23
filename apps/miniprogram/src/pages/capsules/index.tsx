import { useCallback, useMemo, useState } from "react";
import { Button, Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import { VoicePlayer } from "../../components/VoicePlayer";
import {
  apiBaseUrl,
  deleteTimeCapsule,
  getTimeCapsules,
  openTimeCapsule,
  readSession,
  resolveAssetUrl,
  type TimeCapsule,
} from "../../lib/api";
import hourglassIcon from "../../assets/illustrations/icon-hourglass.png";
import "./index.scss";

const MAX_FUTURE_CAPSULES = 3;

function localDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysUntil(value: string) {
  const normalized = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const target = new Date(`${normalized}T00:00:00`);
  const today = new Date(`${localDateValue()}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function displayOpenDate(value: string) {
  const parts = value.slice(0, 10).split("-");
  if (parts.length !== 3) return value;
  return `${parts[0]} 年 ${Number(parts[1])} 月 ${Number(parts[2])} 日`;
}

export default function CapsulesPage() {
  const [items, setItems] = useState<TimeCapsule[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [justOpenedId, setJustOpenedId] = useState("");

  const load = useCallback(async (background = false) => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return [] as TimeCapsule[];
    }
    if (!background) setLoading(true);
    setStatus("");
    try {
      const data = await getTimeCapsules();
      const capsules = Array.isArray(data.timeCapsules) ? data.timeCapsules : [];
      setItems(capsules);
      return capsules;
    } catch {
      setStatus("时光胶囊暂时没有同步成功，请稍后再试。");
      return [] as TimeCapsule[];
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void load();
  });

  usePullDownRefresh(() => {
    void load(true).finally(() => Taro.stopPullDownRefresh());
  });

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.openDate.localeCompare(b.openDate)),
    [items],
  );
  const futureCount = useMemo(
    () => sorted.filter((item) => !item.isOpened && (daysUntil(item.openDate) || 0) > 0).length,
    [sorted],
  );
  const createDisabled = futureCount >= MAX_FUTURE_CAPSULES;
  const currentUserId = readSession()?.user.id || "";

  const openEditor = (capsuleId?: string) => {
    if (!capsuleId && createDisabled) {
      Taro.showToast({ title: "最多同时封存 3 枚", icon: "none" });
      return;
    }
    const query = capsuleId ? `?id=${encodeURIComponent(capsuleId)}` : "";
    Taro.navigateTo({ url: `/pages/capsule-editor/index${query}` });
  };

  const removeCapsule = async (capsule: TimeCapsule) => {
    if (deletingId || openingId) return;
    const result = await Taro.showModal({
      title: "删除这枚胶囊？",
      content: "删除后，信里的文字和照片都无法恢复。",
      confirmText: "删除",
    });
    if (!result.confirm) return;

    setDeletingId(capsule.id);
    setStatus("");
    try {
      await deleteTimeCapsule(capsule.id);
      setItems((current) => current.filter((item) => item.id !== capsule.id));
      Taro.showToast({ title: "胶囊已删除", icon: "success" });
    } catch {
      setStatus("删除失败。只有创建这枚胶囊的人才能删除，请稍后再试。");
    } finally {
      setDeletingId("");
    }
  };

  const revealCapsule = async (capsule: TimeCapsule) => {
    if (openingId || deletingId) return;
    const openedBy = capsule.openedByUserIds || [];
    if (capsule.openMode === "together" && openedBy.includes(currentUserId)) return;
    const willWait = capsule.openMode === "together" && openedBy.length === 0;

    setOpeningId(capsule.id);
    setStatus("");
    try {
      await openTimeCapsule(capsule.id);
      const refreshed = await load(true);
      const openedCapsule = refreshed.find((item) => item.id === capsule.id);
      if (openedCapsule?.isOpened) setJustOpenedId(capsule.id);
      Taro.showToast({
        title: willWait ? "已准备，等待 TA" : "胶囊已开启",
        icon: willWait ? "none" : "success",
      });
    } catch {
      setStatus("开启失败，请确认约定日期已经到来后再试。");
    } finally {
      setOpeningId("");
    }
  };

  const confirmReveal = async (capsule: TimeCapsule) => {
    if (openingId || deletingId) return;
    const openedBy = capsule.openedByUserIds || [];
    const partnerIsReady = openedBy.some((userId) => userId !== currentUserId);
    const together = capsule.openMode === "together";
    const result = await Taro.showModal({
      title: together
        ? partnerIsReady
          ? "和 TA 一起打开？"
          : "为这枚胶囊准备好了吗？"
        : "现在开启这枚胶囊？",
      content: together
        ? partnerIsReady
          ? "TA 已经准备好了。确认后，这封写给未来的信会立即揭晓。"
          : "确认后会留下你的准备状态，等 TA 也确认时再一起揭晓。"
        : "开启后，这封写给未来的信会立即揭晓。",
      confirmText: together && !partnerIsReady ? "准备好了" : "现在打开",
      cancelText: "再等等",
    });
    if (result.confirm) await revealCapsule(capsule);
  };

  const previewPhotos = (capsule: TimeCapsule, current: string) => {
    const urls = (capsule.photos || []).map((photo) => resolveAssetUrl(photo.url, apiBaseUrl));
    if (urls.length === 0) return;
    Taro.previewImage({ current, urls });
  };

  return (
    <View className="page capsules-page">
      <AppHeader title="时光胶囊" back />

      <View className="screen-intro capsule-intro">
        <View className="capsule-intro-copy">
          <Text className="screen-title">写给未来的我们</Text>
          <Text className="screen-subtitle">有些话，交给时间替我们好好保存。</Text>
        </View>
        <View className="capsule-count" aria-label={`封存中 ${futureCount} 枚`}>
          <Text className="capsule-count-value">{futureCount}</Text>
          <Text className="capsule-count-label">/ {MAX_FUTURE_CAPSULES} 枚</Text>
        </View>
      </View>

      {status && <ErrorBanner copy={status} onRetry={() => void load()} />}
      {loading && sorted.length === 0 ? (
        <LoadingState />
      ) : sorted.length === 0 && !status ? (
        <EmptyState
          title="还没有时光胶囊"
          copy="写一封给未来的信，在约定的那天一起打开。"
          actionLabel="埋下第一枚胶囊"
          onAction={() => openEditor()}
        />
      ) : (
        <View className="capsule-list">
          {sorted.map((item) => {
            const days = daysUntil(item.openDate);
            const isFuture = days !== null && days > 0;
            const isDue = !item.isOpened && !isFuture;
            const openedBy = item.openedByUserIds || [];
            const hasConfirmed = openedBy.includes(currentUserId);
            const partnerHasConfirmed = openedBy.some((userId) => userId !== currentUserId);
            const myReady = item.isOpened || hasConfirmed;
            const partnerReady = item.isOpened || partnerHasConfirmed;
            const readyCount = item.isOpened ? 2 : Math.min(openedBy.length, 2);
            const canManage = Boolean(
              currentUserId && item.createdById === currentUserId && !item.isOpened && isFuture,
            );
            const coverUrl = item.isOpened && item.photos?.[0]?.url
              ? resolveAssetUrl(item.photos[0].url, apiBaseUrl)
              : "";
            const stateClass = item.isOpened ? "opened" : isDue ? "due" : "locked";
            const stateLabel = item.isOpened
              ? "已开启"
              : hasConfirmed
                ? "我已准备"
                : isDue
                  ? "待开启"
                  : "封存中";
            const openButtonLabel = item.openMode === "together"
              ? partnerHasConfirmed
                ? "和 TA 一起打开"
                : "我准备好了"
              : "开启胶囊";
            const justOpened = justOpenedId === item.id;

            return (
              <View className={justOpened ? "capsule-card card just-opened" : "capsule-card card"} key={item.id}>
                {coverUrl ? (
                  <Image
                    className="capsule-cover"
                    src={coverUrl}
                    mode="aspectFill"
                    lazyLoad
                    onClick={() => previewPhotos(item, coverUrl)}
                  />
                ) : (
                  <View className={`capsule-cover capsule-placeholder ${stateClass}`}>
                    <Image className="capsule-icon" src={hourglassIcon} mode="aspectFit" />
                    {item.isOpened ? (
                      <Text className="capsule-placeholder-title">已经来到约定的这一天</Text>
                    ) : isFuture ? (
                      <View className="countdown">
                        <Text className="countdown-value">{days}</Text>
                        <Text className="countdown-label">天后开启</Text>
                      </View>
                    ) : hasConfirmed ? (
                      <Text className="capsule-placeholder-title">你的心意已经送达，等 TA 来赴约</Text>
                    ) : (
                      <Text className="capsule-placeholder-title">约定的日子到了</Text>
                    )}
                  </View>
                )}

                <View className="capsule-body">
                  <View className="capsule-heading">
                    <View className="capsule-title-copy">
                      <Text className="capsule-date">约定于 {displayOpenDate(item.openDate)}</Text>
                      <Text className="capsule-title">{item.title || "未命名胶囊"}</Text>
                    </View>
                    <Text className={`capsule-state ${stateClass}`}>{stateLabel}</Text>
                  </View>

                  <Text className="capsule-mode">
                    {item.openMode === "together" ? "两个人确认后开启" : "到期后任意一人开启"}
                  </Text>

                  {item.openMode === "together" && !isFuture && (
                    <View className={item.isOpened ? "capsule-ready-panel complete" : "capsule-ready-panel"}>
                      <View className="capsule-ready-heading">
                        <Text className="capsule-ready-title">一起开启</Text>
                        <Text className="capsule-ready-count">{readyCount} / 2 已准备</Text>
                      </View>
                      <View className="capsule-ready-steps">
                        <View className="capsule-ready-step">
                          <View className={myReady ? "capsule-ready-mark ready" : "capsule-ready-mark"}>1</View>
                          <View className="capsule-ready-copy">
                            <Text className="capsule-ready-person">我</Text>
                            <Text className="capsule-ready-status">{myReady ? "已准备" : "待确认"}</Text>
                          </View>
                        </View>
                        <View className={myReady && partnerReady ? "capsule-ready-line ready" : "capsule-ready-line"} />
                        <View className="capsule-ready-step">
                          <View className={partnerReady ? "capsule-ready-mark ready" : "capsule-ready-mark"}>2</View>
                          <View className="capsule-ready-copy">
                            <Text className="capsule-ready-person">TA</Text>
                            <Text className="capsule-ready-status">{partnerReady ? "已准备" : "待确认"}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  )}

                  {item.isOpened ? (
                    <View className={justOpened ? "capsule-reveal just-opened" : "capsule-reveal"}>
                      <View className="capsule-reveal-heading">
                        <View className="capsule-reveal-heading-copy">
                          <Text className="capsule-reveal-title">
                            {justOpened ? "时间到了" : "来自过去的信"}
                          </Text>
                          <Text className="capsule-reveal-date">
                            {item.revealedAt
                              ? `开启于 ${displayOpenDate(item.revealedAt)}`
                              : "这封信已经抵达现在"}
                          </Text>
                        </View>
                        <Image className="capsule-reveal-icon" src={hourglassIcon} mode="aspectFit" />
                      </View>
                      <Text className="capsule-content">{item.content || "这枚胶囊已经开启。"}</Text>
                      {item.voiceUrl && (
                        <View className="capsule-voice">
                          <Text className="capsule-voice-label">胶囊语音</Text>
                          <VoicePlayer
                            src={resolveAssetUrl(item.voiceUrl, apiBaseUrl)}
                            compact
                            onError={setStatus}
                          />
                        </View>
                      )}
                      {(item.photos?.length || 0) > 1 && (
                        <View className="capsule-gallery">
                          {item.photos?.slice(1).map((photo) => {
                            const photoUrl = resolveAssetUrl(photo.url, apiBaseUrl);
                            return (
                              <Image
                                className="capsule-gallery-image"
                                key={photo.id || photo.url}
                                src={photoUrl}
                                mode="aspectFill"
                                lazyLoad
                                onClick={() => previewPhotos(item, photoUrl)}
                              />
                            );
                          })}
                        </View>
                      )}
                    </View>
                  ) : (
                    <Text className="capsule-content locked-copy">
                      {isFuture ? "内容会在约定的日期到来后显示。" : "胶囊已经可以开启，里面的信还在等你。"}
                    </Text>
                  )}

                  {isDue && (
                    <View className="capsule-open-panel">
                      {item.openMode === "together" && hasConfirmed ? (
                        <Text className="capsule-waiting-copy">等 TA 一起打开</Text>
                      ) : (
                        <Button
                          className="btn capsule-open-button"
                          disabled={openingId === item.id}
                          loading={openingId === item.id}
                          onClick={() => void confirmReveal(item)}
                        >
                          {openButtonLabel}
                        </Button>
                      )}
                    </View>
                  )}

                  {canManage && (
                    <View className="capsule-actions">
                      <Button className="capsule-action" onClick={() => openEditor(item.id)}>
                        编辑
                      </Button>
                      <Button
                        className="capsule-action danger"
                        disabled={deletingId === item.id}
                        loading={deletingId === item.id}
                        onClick={() => void removeCapsule(item)}
                      >
                        删除
                      </Button>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Button
        className="capsule-create-fab"
        aria-label="埋下时光胶囊"
        disabled={createDisabled}
        onClick={() => openEditor()}
      >
        <Text className="capsule-create-fab-plus">+</Text>
        <Text className="capsule-create-fab-label">{createDisabled ? "已达上限" : "埋胶囊"}</Text>
      </Button>
    </View>
  );
}
