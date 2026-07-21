import { useCallback, useState } from "react";
import { Button, Input, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import { VoicePlayer } from "../../components/VoicePlayer";
import { VoiceRecorder } from "../../components/VoiceRecorder";
import {
  createWhisper,
  deleteUploadedMedia,
  getWhispers,
  readSession,
  replyWhisper,
  uploadWhisperAudio,
  type Whisper,
} from "../../lib/api";
import type { VoiceDraft } from "../../lib/voice";
import "./index.scss";

const TITLE_LIMIT = 60;
const MESSAGE_LIMIT = 500;

function displayTime(value: string) {
  if (!value) return "";
  return value.replace("T", " ").replace(/\.\d+Z?$/, "").slice(0, 16);
}

export default function WhispersPage() {
  const [items, setItems] = useState<Whisper[]>([]);
  const [syncError, setSyncError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [replyOpen, setReplyOpen] = useState("");
  const [replyContent, setReplyContent] = useState("");
  const [replyVoiceDraft, setReplyVoiceDraft] = useState<VoiceDraft | null>(null);
  const [replyingId, setReplyingId] = useState("");
  const [voiceRecording, setVoiceRecording] = useState(false);

  const load = useCallback(async (background = false) => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!background) setLoading(true);
    setSyncError("");
    try {
      const data = await getWhispers();
      setItems(Array.isArray(data.whispers) ? data.whispers : []);
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
    if (creating || replyingId || voiceRecording) return;
    setReplyOpen("");
    setReplyContent("");
    setReplyVoiceDraft(null);
    setActionError("");
    setComposeOpen(true);
  };

  const closeComposer = () => {
    if (creating || voiceRecording) return;
    setComposeOpen(false);
    setTitle("");
    setContent("");
    setVoiceDraft(null);
    setActionError("");
  };

  const submitWhisper = async () => {
    const nextTitle = title.trim();
    const nextContent = content.trim();
    if (!nextTitle) {
      setActionError("先给这封私语写一个标题。");
      return;
    }
    if (creating || replyingId || voiceRecording) return;

    setCreating(true);
    setActionError("");
    let uploadedKey = "";
    try {
      const uploaded = voiceDraft ? await uploadWhisperAudio(voiceDraft) : null;
      uploadedKey = uploaded?.key || "";
      await createWhisper({
        title: nextTitle,
        content: nextContent,
        voiceUrl: uploaded?.url,
      });
      setComposeOpen(false);
      setTitle("");
      setContent("");
      setVoiceDraft(null);
      Taro.showToast({ title: "私语已送达", icon: "success" });
      await load(true);
    } catch {
      if (uploadedKey) await deleteUploadedMedia([uploadedKey]);
      setActionError("发送失败，请检查网络后重试。");
    } finally {
      setCreating(false);
    }
  };

  const openReply = (whisperId: string) => {
    if (creating || replyingId || voiceRecording) return;
    setComposeOpen(false);
    setTitle("");
    setContent("");
    setVoiceDraft(null);
    setActionError("");
    setReplyOpen(whisperId);
    setReplyContent("");
    setReplyVoiceDraft(null);
  };

  const closeReply = () => {
    if (replyingId || voiceRecording) return;
    setReplyOpen("");
    setReplyContent("");
    setReplyVoiceDraft(null);
    setActionError("");
  };

  const submitReply = async (whisperId: string) => {
    const nextContent = replyContent.trim();
    if (!nextContent && !replyVoiceDraft) {
      setActionError("写下一句话或录一段语音再发送。");
      return;
    }
    if (creating || replyingId || voiceRecording) return;

    setReplyingId(whisperId);
    setActionError("");
    let uploadedKey = "";
    try {
      const uploaded = replyVoiceDraft ? await uploadWhisperAudio(replyVoiceDraft) : null;
      uploadedKey = uploaded?.key || "";
      await replyWhisper(whisperId, {
        content: nextContent,
        voiceUrl: uploaded?.url,
      });
      setReplyOpen("");
      setReplyContent("");
      setReplyVoiceDraft(null);
      Taro.showToast({ title: "回复已送达", icon: "success" });
      await load(true);
    } catch {
      if (uploadedKey) await deleteUploadedMedia([uploadedKey]);
      setActionError("回复失败，请检查网络后重试。");
    } finally {
      setReplyingId("");
    }
  };

  const canCreate = Boolean(title.trim()) && !creating && !replyingId && !voiceRecording;
  const session = readSession();
  const currentDisplayName = session?.user.displayName?.trim() || "我";

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

          <VoiceRecorder
            draft={voiceDraft}
            disabled={creating}
            onChange={setVoiceDraft}
            onClear={() => setVoiceDraft(null)}
            onRecordingChange={setVoiceRecording}
            onError={setActionError}
          />

          {actionError && <Text className="whisper-action-error">{actionError}</Text>}

          <View className="compose-actions">
            <Button className="btn btn-secondary compose-cancel" disabled={creating || voiceRecording} onClick={closeComposer}>
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
            const creatorIsMine = typeof item.creatorIsMine === "boolean"
              ? item.creatorIsMine
              : item.createdById === session?.user.id;
            const creator = item.creatorDisplayName || (creatorIsMine ? currentDisplayName : "对方");
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
                    const mine = typeof message.isMine === "boolean"
                      ? message.isMine
                      : message.userId === session?.user.id;
                    const author = message.authorDisplayName || (mine ? currentDisplayName : "对方");
                    return (
                      <View className={mine ? "message-row mine" : "message-row"} key={message.id}>
                        <View className="message-author-line">
                          <Text className="message-author">{author}</Text>
                          <Text className="message-time">{displayTime(message.createdAt)}</Text>
                        </View>
                        <View className="message-bubble">
                          {message.content && <Text className="message-copy">{message.content}</Text>}
                          {message.voiceUrl && <VoicePlayer src={message.voiceUrl} label="私语语音" compact onError={setActionError} />}
                          {!message.content && !message.voiceUrl && <Text className="message-copy">这条私语暂时无法显示。</Text>}
                        </View>
                      </View>
                    );
                  })}
                  {messages.length === 0 && <Text className="thread-empty">这封私语还没有第一句话。</Text>}
                </View>

                {replying ? (
                  <View className="reply-panel">
                    <View className="compose-label-row">
                      <Text className="compose-label">回复对方</Text>
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
                    <VoiceRecorder
                      draft={replyVoiceDraft}
                      disabled={Boolean(replyingId)}
                      onChange={setReplyVoiceDraft}
                      onClear={() => setReplyVoiceDraft(null)}
                      onRecordingChange={setVoiceRecording}
                      onError={setActionError}
                    />
                    {actionError && <Text className="whisper-action-error">{actionError}</Text>}
                    <View className="reply-actions">
                      <Button className="reply-cancel" disabled={Boolean(replyingId) || voiceRecording} onClick={closeReply}>
                        取消
                      </Button>
                      <Button
                        className="reply-submit"
                        disabled={(!replyContent.trim() && !replyVoiceDraft) || Boolean(replyingId) || voiceRecording}
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
        <Button className="whisper-create-fab" aria-label="写一封新私语" disabled={voiceRecording} onClick={openComposer}>
          <Text className="whisper-create-fab-plus">＋</Text>
          <Text className="whisper-create-fab-label">写私语</Text>
        </Button>
      )}
    </View>
  );
}
