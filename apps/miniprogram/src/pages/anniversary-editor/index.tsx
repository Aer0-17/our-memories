import { useEffect, useMemo, useState } from "react";
import { Button, Image, Input, Picker, Switch, Text, Textarea, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { ErrorBanner, LoadingState } from "../../components/PageStates";
import { VoicePlayer } from "../../components/VoicePlayer";
import { VoiceRecorder } from "../../components/VoiceRecorder";
import {
  apiBaseUrl,
  createAnniversaryCard,
  deleteUploadedMedia,
  getAnniversaryCards,
  readSession,
  resolveAssetUrl,
  updateAnniversaryCard,
  uploadMemoryImage,
  uploadVoiceAudio,
  type AnniversaryCard,
  type AnniversaryCardInput,
  type MemoryPhotoPayload,
} from "../../lib/api";
import type { VoiceDraft } from "../../lib/voice";
import "./index.scss";

const MAX_PHOTOS = 6;
const MAX_SOURCE_PHOTO_BYTES = 12 * 1024 * 1024;
const TITLE_LIMIT = 120;
const NOTE_LIMIT = 500;

type PhotoDraft = {
  id: string;
  previewUrl: string;
  filePath?: string;
  width?: number;
  height?: number;
  remote?: MemoryPhotoPayload;
};

function localDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function pickerDate(value: string) {
  return value.slice(0, 10).replace(/\./g, "-");
}

function apiDate(value: string) {
  return value.replace(/-/g, ".");
}

function remotePhotoDrafts(card: AnniversaryCard): PhotoDraft[] {
  return (card.photos || []).slice(0, MAX_PHOTOS).flatMap((photo, index) => {
    if (!photo?.url) return [];
    return [{
      id: `remote-${photo.id || index}`,
      previewUrl: resolveAssetUrl(photo.url, apiBaseUrl),
      remote: {
        url: photo.url,
        key: photo.key || "",
        mimeType: photo.mimeType || "image/jpeg",
        mediaType: "image",
      },
    }];
  });
}

export default function AnniversaryEditorPage() {
  const router = useRouter();
  const cardId = typeof router.params.id === "string" ? router.params.id : "";
  const [editingCard, setEditingCard] = useState<AnniversaryCard | null>(null);
  const [loading, setLoading] = useState(Boolean(cardId));
  const [working, setWorking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState("");
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(localDateValue);
  const [note, setNote] = useState("");
  const [repeatYearly, setRepeatYearly] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [voiceUrl, setVoiceUrl] = useState("");
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);
  const [voiceRecording, setVoiceRecording] = useState(false);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!cardId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setUnavailable(false);
    setStatus("");
    void getAnniversaryCards()
      .then((data) => {
        const card = (data.cards || []).find((item) => item.id === cardId);
        if (!card || card.createdById !== session.user.id) {
          throw new Error("Anniversary card cannot be edited");
        }
        setEditingCard(card);
        setPhotos(remotePhotoDrafts(card));
        setTitle(card.title || "");
        setDate(pickerDate(card.date));
        setNote(card.note || "");
        setRepeatYearly(card.repeatYearly !== false);
        setPinned(Boolean(card.pinned));
        setVoiceUrl(card.voiceUrl || "");
      })
      .catch(() => {
        setUnavailable(true);
        setStatus("没有找到这个纪念日，或当前身份没有编辑权限。");
      })
      .finally(() => setLoading(false));
  }, [cardId]);

  const canSave = useMemo(
    () => Boolean(
      title.trim() &&
      date &&
      !working &&
      !voiceRecording &&
      !loading &&
      !unavailable,
    ),
    [date, loading, title, unavailable, voiceRecording, working],
  );

  const pickPhotos = async () => {
    if (working || photos.length >= MAX_PHOTOS) return;
    setStatus("");
    try {
      const result = await Taro.chooseImage({
        count: MAX_PHOTOS - photos.length,
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
      });
      const oversized = result.tempFiles.some((file) => file.size > MAX_SOURCE_PHOTO_BYTES);
      const accepted = result.tempFiles.filter((file) => file.size <= MAX_SOURCE_PHOTO_BYTES);
      const next = await Promise.all(
        accepted.map(async (file, index) => {
          let width: number | undefined;
          let height: number | undefined;
          try {
            const info = await Taro.getImageInfo({ src: file.path });
            width = info.width;
            height = info.height;
          } catch {
            // Dimensions are optional metadata.
          }
          return {
            id: `local-${Date.now()}-${index}`,
            previewUrl: file.path,
            filePath: file.path,
            width,
            height,
          } satisfies PhotoDraft;
        }),
      );
      setPhotos((current) => [...current, ...next].slice(0, MAX_PHOTOS));
      if (oversized) setStatus("超过 12 MB 的原图没有加入，请先在相册中压缩。");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("cancel")) {
        setStatus("暂时无法读取照片，请检查微信的相册权限后重试。");
      }
    }
  };

  const removePhoto = (photoId: string) => {
    if (working) return;
    setPhotos((current) => current.filter((photo) => photo.id !== photoId));
  };

  const save = async () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle || !date) {
      setStatus("标题和日期都需要填写。");
      return;
    }
    if (!canSave || voiceRecording) return;

    const uploadedById = new Map<string, MemoryPhotoPayload>();
    const uploadedKeys: string[] = [];
    const localPhotos = photos.filter((photo) => photo.filePath);
    setWorking(true);
    setStatus("");

    try {
      for (let index = 0; index < localPhotos.length; index += 1) {
        const photo = localPhotos[index];
        setProgress(`正在上传第 ${index + 1} / ${localPhotos.length} 张照片...`);
        const uploaded = await uploadMemoryImage({
          filePath: photo.filePath || "",
          width: photo.width,
          height: photo.height,
          folder: "anniversaries",
        });
        uploadedById.set(photo.id, uploaded);
        if (uploaded.key) uploadedKeys.push(uploaded.key);
      }

      const payloadPhotos = photos.flatMap((photo) => {
        if (photo.remote) return [photo.remote];
        const uploaded = uploadedById.get(photo.id);
        return uploaded ? [uploaded] : [];
      });
      let uploadedVoiceUrl = "";
      if (voiceDraft) {
        setProgress("正在上传语音...");
        const uploadedVoice = await uploadVoiceAudio(voiceDraft, "anniversaries");
        uploadedVoiceUrl = uploadedVoice.url;
        if (uploadedVoice.key) uploadedKeys.push(uploadedVoice.key);
      }

      const payload: AnniversaryCardInput = {
        title: normalizedTitle,
        date: apiDate(date),
        note: note.trim(),
        voiceUrl: uploadedVoiceUrl || voiceUrl,
        bgmUrl: editingCard?.bgmUrl || "",
        bgmPreset: editingCard?.bgmPreset || "",
        repeatYearly,
        pinned,
        photos: payloadPhotos,
      };

      setProgress(editingCard ? "正在保存修改..." : "正在保存纪念日...");
      if (editingCard) {
        await updateAnniversaryCard(editingCard.id, payload);
      } else {
        await createAnniversaryCard(payload);
      }

      Taro.showToast({ title: editingCard ? "修改已保存" : "纪念日已添加", icon: "success" });
      Taro.navigateBack({ delta: 1 });
    } catch {
      await deleteUploadedMedia(uploadedKeys);
      setStatus("保存失败，已清理本次上传的临时文件。请检查网络后重试。");
    } finally {
      setProgress("");
      setWorking(false);
    }
  };

  return (
    <View className="page anniversary-editor-page">
      <AppHeader title={editingCard ? "编辑纪念日" : "新增纪念日"} back />

      <View className="screen-intro anniversary-editor-intro">
        <Text className="screen-title">{editingCard ? "重写这一天的注脚" : "记下重要的一天"}</Text>
        <Text className="screen-subtitle">让日期、照片和声音，一起替我们保存当时的心情。</Text>
      </View>

      {status && <ErrorBanner copy={status} />}
      {loading ? (
        <LoadingState compact />
      ) : !unavailable ? (
        <View className="anniversary-form">
          <View className="anniversary-editor-section card">
            <View className="anniversary-editor-heading">
              <View className="anniversary-editor-heading-copy">
                <Text className="anniversary-editor-section-title">这一天</Text>
                <Text className="anniversary-editor-section-note">过去和未来的日期都可以记录</Text>
              </View>
            </View>

            <View className="anniversary-editor-field-group">
              <View className="anniversary-editor-label-row">
                <Text className="anniversary-editor-label">标题 *</Text>
                <Text className="anniversary-editor-counter">{title.length} / {TITLE_LIMIT}</Text>
              </View>
              <Input
                className="field"
                disabled={working}
                maxlength={TITLE_LIMIT}
                value={title}
                onInput={(event) => setTitle(event.detail.value)}
                placeholder="例如：第一次见面"
              />
            </View>

            <View className="anniversary-editor-field-group">
              <Text className="anniversary-editor-label">日期 *</Text>
              <Picker mode="date" value={date} onChange={(event) => setDate(event.detail.value)}>
                <View className="field anniversary-date-picker">{date}</View>
              </Picker>
            </View>

            <View className="anniversary-editor-field-group">
              <View className="anniversary-editor-label-row">
                <Text className="anniversary-editor-label">关于这一天</Text>
                <Text className="anniversary-editor-counter">{note.length} / {NOTE_LIMIT}</Text>
              </View>
              <Textarea
                className="field anniversary-editor-textarea"
                disabled={working}
                maxlength={NOTE_LIMIT}
                value={note}
                onInput={(event) => setNote(event.detail.value)}
                placeholder="写一点那天的细节..."
              />
            </View>
          </View>

          <View className="anniversary-editor-section card">
            <View className="anniversary-editor-heading">
              <View className="anniversary-editor-heading-copy">
                <Text className="anniversary-editor-section-title">语音</Text>
                <Text className="anniversary-editor-section-note">留一段最长 60 秒的声音</Text>
              </View>
            </View>

            {voiceUrl && !voiceDraft && !voiceRecording && (
              <View className="anniversary-existing-voice">
                <View className="anniversary-existing-voice-heading">
                  <Text className="anniversary-editor-label">已保存的纪念日语音</Text>
                  <Text className="anniversary-editor-section-note">新录音会在保存后替换它</Text>
                </View>
                <VoicePlayer
                  src={resolveAssetUrl(voiceUrl, apiBaseUrl)}
                  compact
                  onError={setStatus}
                />
              </View>
            )}

            <VoiceRecorder
              draft={voiceDraft}
              disabled={working}
              onChange={setVoiceDraft}
              onClear={() => setVoiceDraft(null)}
              onRecordingChange={setVoiceRecording}
              onError={setStatus}
            />
          </View>

          <View className="anniversary-editor-section card">
            <View className="anniversary-editor-heading">
              <View className="anniversary-editor-heading-copy">
                <Text className="anniversary-editor-section-title">照片</Text>
                <Text className="anniversary-editor-section-note">最多 6 张，上传前会自动压缩</Text>
              </View>
              <Text className="anniversary-editor-count">{photos.length} / {MAX_PHOTOS}</Text>
            </View>

            <View className="anniversary-photo-grid">
              {photos.map((photo) => (
                <View className="anniversary-photo-draft" key={photo.id}>
                  <Image className="anniversary-photo-image" src={photo.previewUrl} mode="aspectFill" />
                  <Button
                    className="anniversary-photo-remove"
                    aria-label="移除照片"
                    disabled={working}
                    onClick={() => removePhoto(photo.id)}
                  >
                    x
                  </Button>
                </View>
              ))}
              {photos.length < MAX_PHOTOS && (
                <Button className="anniversary-photo-add" disabled={working} onClick={() => void pickPhotos()}>
                  <Text className="anniversary-photo-add-mark">+</Text>
                  <Text className="anniversary-photo-add-copy">添加照片</Text>
                </Button>
              )}
            </View>
          </View>

          <View className="anniversary-editor-section card">
            <View className="anniversary-editor-heading">
              <View className="anniversary-editor-heading-copy">
                <Text className="anniversary-editor-section-title">展示方式</Text>
                <Text className="anniversary-editor-section-note">设置倒数方式和卡片顺序</Text>
              </View>
            </View>

            <View className="anniversary-toggle-row">
              <View className="anniversary-toggle-copy">
                <Text className="anniversary-toggle-title">每年重复</Text>
                <Text className="anniversary-toggle-note">按月和日计算下一次纪念日</Text>
              </View>
              <Switch
                checked={repeatYearly}
                color="#C75C5C"
                disabled={working}
                onChange={(event) => setRepeatYearly(event.detail.value)}
              />
            </View>

            <View className="anniversary-toggle-row">
              <View className="anniversary-toggle-copy">
                <Text className="anniversary-toggle-title">置顶显示</Text>
                <Text className="anniversary-toggle-note">把这张卡片放在纪念日墙前面</Text>
              </View>
              <Switch
                checked={pinned}
                color="#C75C5C"
                disabled={working}
                onChange={(event) => setPinned(event.detail.value)}
              />
            </View>
          </View>

          <View className="anniversary-editor-submit-bar">
            {progress && <Text className="anniversary-editor-progress">{progress}</Text>}
            <Button
              className="btn anniversary-editor-submit"
              disabled={!canSave}
              loading={working}
              onClick={() => void save()}
            >
              {editingCard ? "保存修改" : "保存纪念日"}
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}
