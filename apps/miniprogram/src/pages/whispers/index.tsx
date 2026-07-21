import { useCallback, useMemo, useState } from "react";
import { Button, Input, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import {
  createWhisper,
  getPublicConfig,
  getWhispers,
  readSession,
  replyWhisper,
  type PublicConfig,
  type Whisper,
} from "../../lib/api";
import "./index.scss";

const TITLE_LIMIT = 60;
const MESSAGE_LIMIT = 500;

function displayTime(value: string) {
  if (!value) return "";
  return value.replace("T", " ").replace(/\.\d+Z?$/, "").slice(0, 16);
}

function memberNames(config: PublicConfig | null) {
  const session = readSession();
  const mine = session?.user.displayName?.trim() || "我";
  const users = Array.isArray(config?.users) ? config.users : [];
  const other = users.find((user) => user.username !== session?.user.username)?.displayName?.trim() || "对方";
  return { mine, other };
}

export default function WhispersPage() {
  const [items, setItems] = useState<Whisper[]>([]);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [syncError, setSyncError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [replyOpen, setReplyOpen] = useState("");
  const [replyContent, setReplyContent] = useState("");
  const [replyingId, setReplyingId] = useState("");

  const names = useMemo(() => memberNames(config), [config]);

  const load = useCallback(async (background = false) => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!background) setLoading(true);
    setSyncError("");
    try {
      const [data, publicConfig] = await Promise.all([
        getWhispers(),
        getPublicConfig().catch(() => null),
      ]);
      setItems(Array.isArray(data.whispers) ? data.whispers : []);
      if (publicConfig) setConfig(publicConfig);
    } catch {
      setSyncError("私语暂时没有同步成功，请稍后再试。");
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

  const openComposer = () => {
    if (creating || replyingId) return;
    setReplyOpen("");
    setReplyContent("");
    setActionError("");
    setComposeOpen(true);
  };

  const closeComposer = () => {
    if (creating) return;
    setComposeOpen(false);
    setTitle("");
    setContent("");
    setActionError("");
  };

  const submitWhisper = async () => {
    const nextTitle = title.trim();
    const nextContent = content.trim();
    if (!nextTitle) {
      setActionError("先给这封私语写一个标题。");
      return;
    }
    if (creating || replyingId) return;

    setCreating(true);
    setActionError("");
    try {
      await createWhisper({ title: nextTitle, content: nextContent });
      setComposeOpen(false);
      setTitle("");
      setContent("");
      Taro.showToast({ title: "私语已送达", icon: "success" });
      await load(true);
    } catch {
      setActionError("发送失败，请检查网络后重试。");
    } finally {
      setCreating(false);
    }
  };

  const openReply = (whisperId: string) => {
    if (creating || replyingId) return;
    setComposeOpen(false);
    setTitle("");
    setContent("");
    setActionError("");
    setReplyOpen(whisperId);
    setReplyContent("");
  };

  const closeReply = () => {
    if (replyingId) return;
    setReplyOpen("");
    setReplyContent("");
    setActionError("");
  };

  const submitReply = async (whisperId: string) => {
    const nextContent = replyContent.trim();
    if (!nextContent) {
      setActionError("写下一句话再发送。");
      return;
    }
    if (creating || replyingId) return;

    setReplyingId(whisperId);
    setActionError("");
    try {
      await replyWhisper(whisperId, { content: nextContent });
      setReplyOpen("");
      setReplyContent("");
      Taro.showToast({ title: "回复已送达", icon: "success" });
      await load(true);
    } catch {
      setActionError("回复失败，请检查网络后重试。");
    } finally {
      setReplyingId("");
    }
  };

  const canCreate = Boolean(title.trim()) && !creating && !replyingId;

  return (
    <View className="page whispers-page">
      <AppHeader title="私语" back />

      <View className="screen-intro whisper-intro">
        <View className="whisper-intro-copy">
          <Text className="screen-title">只说给你听</Text>
          <Text className="screen-subtitle">一些不需要被世界听见的话。</Text>
        </View>
        {items.length > 0 && (
          <View className="whisper-count" aria-label={`${items.length} 封私语`}>
            <Text className="whisper-count-value">{items.length}</Text>
            <Text className="whisper-count-label">封私语</Text>
          </View>
        )}
      </View>

      {syncError && <ErrorBanner copy={syncError} onRetry={() => void load()} />}

      {composeOpen && (
        <View className="whisper-compose card">
          <View className="compose-heading">
            <View className="compose-heading-copy">
              <Text className="compose-title">写一封私语</Text>
              <Text className="compose-note">标题会成为你们以后找回这段对话的线索。</Text>
            </View>
          </View>

          <View className="compose-field-group">
            <View className="compose-label-row">
              <Text className="compose-label">标题 *</Text>
              <Text className="compose-counter">{title.length} / {TITLE_LIMIT}</Text>
            </View>
            <Input
              className="field"
              disabled={creating}
              maxlength={TITLE_LIMIT}
              value={title}
              onInput={(event) => setTitle(event.detail.value)}
              placeholder="例如：睡前想告诉你"
            />
          </View>

          <View className="compose-field-group">
            <View className="compose-label-row">
              <Text className="compose-label">第一句话</Text>
              <Text className="compose-counter">{content.length} / {MESSAGE_LIMIT}</Text>
            </View>
            <Textarea
              className="field whisper-textarea"
              disabled={creating}
              maxlength={MESSAGE_LIMIT}
              value={content}
              onInput={(event) => setContent(event.detail.value)}
              placeholder="现在最想对 TA 说什么？"
            />
          </View>

          {actionError && <Text className="whisper-action-error">{actionError}</Text>}

          <View className="compose-actions">
            <Button className="btn btn-secondary compose-cancel" disabled={creating} onClick={closeComposer}>
              取消
            </Button>
            <Button
              className="btn compose-submit"
              disabled={!canCreate}
              loading={creating}
              onClick={() => void submitWhisper()}
            >
              送给 TA
            </Button>
          </View>
        </View>
      )}

      {loading && items.length === 0 ? (
        <LoadingState compact />
      ) : items.length === 0 && !syncError && !composeOpen ? (
        <EmptyState
          title="这里还很安静"
          copy="写下第一句悄悄话，它只会留在你们两个人的空间里。"
          actionLabel="写第一封私语"
          onAction={openComposer}
        />
      ) : items.length > 0 ? (
        <View className="whisper-list">
          {items.map((item) => {
            const creator = item.createdById === readSession()?.user.id ? names.mine : names.other;
            const messages = item.messages || [];
            const replying = replyOpen === item.id;
            return (
              <View className="whisper-thread card" key={item.id}>
                <View className="whisper-heading">
                  <View className="whisper-title-copy">
                    <View className="whisper-title-row">
                      <View className="whisper-dot" />
                      <Text className="whisper-title">{item.title || "未命名私语"}</Text>
                    </View>
                    <Text className="whisper-thread-meta">{creator} 发起 · {displayTime(item.createdAt)}</Text>
                  </View>
                  <Text className="whisper-message-count">{messages.length} 条</Text>
                </View>

                <View className="message-list">
                  {messages.map((message) => {
                    const mine = message.userId === readSession()?.user.id;
                    return (
                      <View className={mine ? "message-row mine" : "message-row"} key={message.id}>
                        <View className="message-author-line">
                          <Text className="message-author">{mine ? names.mine : names.other}</Text>
                          <Text className="message-time">{displayTime(message.createdAt)}</Text>
                        </View>
                        <View className="message-bubble">
                          <Text className="message-copy">
                            {message.content || "发来了一段语音留言，请在网页端收听。"}
                          </Text>
                          {message.content && message.voiceUrl && (
                            <Text className="voice-note">还附带了一段语音</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                  {messages.length === 0 && <Text className="thread-empty">这封私语还没有第一句话。</Text>}
                </View>

                {replying ? (
                  <View className="reply-panel">
                    <View className="compose-label-row">
                      <Text className="compose-label">回复 {names.other}</Text>
                      <Text className="compose-counter">{replyContent.length} / {MESSAGE_LIMIT}</Text>
                    </View>
                    <Textarea
                      className="field reply-textarea"
                      disabled={Boolean(replyingId)}
                      maxlength={MESSAGE_LIMIT}
                      value={replyContent}
                      onInput={(event) => setReplyContent(event.detail.value)}
                      placeholder="写下你的回复…"
                    />
                    {actionError && <Text className="whisper-action-error">{actionError}</Text>}
                    <View className="reply-actions">
                      <Button className="reply-cancel" disabled={Boolean(replyingId)} onClick={closeReply}>
                        取消
                      </Button>
                      <Button
                        className="reply-submit"
                        disabled={!replyContent.trim() || Boolean(replyingId)}
                        loading={replyingId === item.id}
                        onClick={() => void submitReply(item.id)}
                      >
                        发送回复
                      </Button>
                    </View>
                  </View>
                ) : (
                  <Button className="thread-reply" disabled={creating || Boolean(replyingId)} onClick={() => openReply(item.id)}>
                    回复这封私语
                  </Button>
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      {items.length > 0 && !composeOpen && (
        <Button className="whisper-create-fab" aria-label="写一封新私语" onClick={openComposer}>
          <Text className="whisper-create-fab-plus">＋</Text>
          <Text className="whisper-create-fab-label">写私语</Text>
        </Button>
      )}
    </View>
  );
}
