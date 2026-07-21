import { useEffect, useMemo, useState } from "react";
import { Button, Image, Input, Picker, Text, Textarea, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { ErrorBanner, LoadingState } from "../../components/PageStates";
import {
  apiBaseUrl,
  createTimeCapsule,
  deleteUploadedImages,
  getTimeCapsules,
  readSession,
  resolveAssetUrl,
  updateTimeCapsule,
  uploadMemoryImage,
  type MemoryPhotoPayload,
  type TimeCapsule,
  type TimeCapsuleInput,
} from "../../lib/api";
import "./index.scss";

const MAX_PHOTOS = 6;
const MAX_SOURCE_PHOTO_BYTES = 12 * 1024 * 1024;
const TITLE_LIMIT = 120;
const CONTENT_LIMIT = 4000;

type PhotoDraft = {
  id: string;
  previewUrl: string;
  filePath?: string;
  width?: number;
  height?: number;
  remote?: MemoryPhotoPayload;
};

function localDateValue(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isFutureDate(value: string) {
  return Boolean(value && value > localDateValue());
}

function remotePhotoDrafts(capsule: TimeCapsule): PhotoDraft[] {
  return (capsule.photos || []).slice(0, MAX_PHOTOS).map((photo, index) => ({
    id: `remote-${photo.id || index}`,
    previewUrl: resolveAssetUrl(photo.url, apiBaseUrl),
    remote: {
      url: photo.url,
      key: photo.key || "",
      mimeType: photo.mimeType || "image/jpeg",
      mediaType: "image",
    },
  }));
}

export default function CapsuleEditorPage() {
  const router = useRouter();
  const capsuleId = typeof router.params.id === "string" ? router.params.id : "";
  const [editingCapsule, setEditingCapsule] = useState<TimeCapsule | null>(null);
  const [loading, setLoading] = useState(Boolean(capsuleId));
  const [working, setWorking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState("");
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [openDate, setOpenDate] = useState(() => localDateValue(1));
  const [openMode, setOpenMode] = useState<"single" | "together">("single");
  const [voiceUrl, setVoiceUrl] = useState("");

  useEffect(() => {
    const session = readSession();
    if (!session) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!capsuleId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setUnavailable(false);
    setStatus("");
    void getTimeCapsules()
      .then((data) => {
        const capsule = (data.timeCapsules || []).find((item) => item.id === capsuleId);
        if (!capsule) throw new Error("Capsule not found");
        if (capsule.createdById !== session.user.id || capsule.isOpened || !isFutureDate(capsule.openDate)) {
          throw new Error("Capsule cannot be edited");
        }
        setEditingCapsule(capsule);
        setPhotos(remotePhotoDrafts(capsule));
        setTitle(capsule.title || "");
        setContent(capsule.content || "");
        setOpenDate(capsule.openDate.slice(0, 10));
        setOpenMode(capsule.openMode === "together" ? "together" : "single");
        setVoiceUrl(capsule.voiceUrl || "");
      })
      .catch(() => {
        setUnavailable(true);
        setStatus("没有找到这枚胶囊，或当前身份没有编辑权限。");
      })
      .finally(() => setLoading(false));
  }, [capsuleId]);

  const canSave = useMemo(
    () => Boolean(
      title.trim() &&
      content.trim() &&
      isFutureDate(openDate) &&
      !working &&
      !loading &&
      !unavailable,
    ),
    [content, loading, openDate, title, unavailable, working],
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
    const normalizedContent = content.trim();
    if (!normalizedTitle || !normalizedContent) {
      setStatus("标题和写给未来的话都需要填写。");
      return;
    }
    if (!isFutureDate(openDate)) {
      setStatus("开启日期需要晚于今天。");
      return;
    }
    if (!canSave) return;

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
          folder: "time-capsules",
        });
        uploadedById.set(photo.id, uploaded);
        if (uploaded.key) uploadedKeys.push(uploaded.key);
      }

      const payloadPhotos = photos.flatMap((photo) => {
        if (photo.remote) return [photo.remote];
        const uploaded = uploadedById.get(photo.id);
        return uploaded ? [uploaded] : [];
      });
      const payload: TimeCapsuleInput = {
        title: normalizedTitle,
        content: normalizedContent,
        openDate,
        openMode,
        voiceUrl,
        photos: payloadPhotos,
      };

      setProgress(editingCapsule ? "正在保存修改..." : "正在封存这枚胶囊...");
      if (editingCapsule) {
        await updateTimeCapsule(editingCapsule.id, payload);
      } else {
        await createTimeCapsule(payload);
      }

      Taro.showToast({ title: editingCapsule ? "修改已保存" : "胶囊已封存", icon: "success" });
      Taro.navigateBack({ delta: 1 });
    } catch {
      await deleteUploadedImages(uploadedKeys);
      setStatus("保存失败，已清理本次上传的临时照片。请检查网络后重试。");
    } finally {
      setProgress("");
      setWorking(false);
    }
  };

  return (
    <View className="page capsule-editor-page">
      <AppHeader title={editingCapsule ? "编辑胶囊" : "埋下胶囊"} back />

      <View className="screen-intro capsule-editor-intro">
        <Text className="screen-title">{editingCapsule ? "重新约定未来" : "写给未来的我们"}</Text>
        <Text className="screen-subtitle">选一个未来的日子，让这封信慢一点抵达。</Text>
      </View>

      {status && <ErrorBanner copy={status} />}
      {loading ? (
        <LoadingState compact />
      ) : !unavailable ? (
        <View className="capsule-form">
          <View className="capsule-editor-section card">
            <View className="capsule-editor-heading">
              <View className="capsule-editor-heading-copy">
                <Text className="capsule-editor-section-title">开启约定</Text>
                <Text className="capsule-editor-section-note">开启日期必须晚于今天</Text>
              </View>
            </View>

            <View className="capsule-editor-field-group">
              <Text className="capsule-editor-label">开启日期 *</Text>
              <Picker
                mode="date"
                start={localDateValue(1)}
                value={openDate}
                onChange={(event) => setOpenDate(event.detail.value)}
              >
                <View className="field capsule-date-picker">{openDate}</View>
              </Picker>
            </View>

            <View className="capsule-editor-field-group">
              <Text className="capsule-editor-label">开启方式</Text>
              <View className="capsule-mode-grid">
                <Button
                  className={openMode === "single" ? "capsule-mode-option active" : "capsule-mode-option"}
                  disabled={working}
                  onClick={() => setOpenMode("single")}
                >
                  <Text className="capsule-mode-title">到期即可开启</Text>
                  <Text className="capsule-mode-copy">任意一人都能打开</Text>
                </Button>
                <Button
                  className={openMode === "together" ? "capsule-mode-option active" : "capsule-mode-option"}
                  disabled={working}
                  onClick={() => setOpenMode("together")}
                >
                  <Text className="capsule-mode-title">两个人一起</Text>
                  <Text className="capsule-mode-copy">双方确认后才揭晓</Text>
                </Button>
              </View>
            </View>
          </View>

          <View className="capsule-editor-section card">
            <View className="capsule-editor-heading">
              <View className="capsule-editor-heading-copy">
                <Text className="capsule-editor-section-title">写给未来</Text>
                <Text className="capsule-editor-section-note">标题和正文都会好好封存</Text>
              </View>
            </View>

            <View className="capsule-editor-field-group">
              <View className="capsule-editor-label-row">
                <Text className="capsule-editor-label">标题 *</Text>
                <Text className="capsule-editor-counter">{title.length} / {TITLE_LIMIT}</Text>
              </View>
              <Input
                className="field"
                disabled={working}
                maxlength={TITLE_LIMIT}
                value={title}
                onInput={(event) => setTitle(event.detail.value)}
                placeholder="例如：明年春天见"
              />
            </View>

            <View className="capsule-editor-field-group">
              <View className="capsule-editor-label-row">
                <Text className="capsule-editor-label">写给未来的话 *</Text>
                <Text className="capsule-editor-counter">{content.length} / {CONTENT_LIMIT}</Text>
              </View>
              <Textarea
                className="field capsule-editor-textarea"
                disabled={working}
                maxlength={CONTENT_LIMIT}
                value={content}
                onInput={(event) => setContent(event.detail.value)}
                placeholder="到那一天，你最希望我们记得什么？"
              />
            </View>
          </View>

          <View className="capsule-editor-section card">
            <View className="capsule-editor-heading">
              <View className="capsule-editor-heading-copy">
                <Text className="capsule-editor-section-title">照片</Text>
                <Text className="capsule-editor-section-note">最多 6 张，上传前会自动压缩</Text>
              </View>
              <Text className="capsule-editor-count">{photos.length} / {MAX_PHOTOS}</Text>
            </View>

            <View className="capsule-photo-grid">
              {photos.map((photo) => (
                <View className="capsule-photo-draft" key={photo.id}>
                  <Image className="capsule-photo-image" src={photo.previewUrl} mode="aspectFill" />
                  <Button
                    className="capsule-photo-remove"
                    aria-label="移除照片"
                    disabled={working}
                    onClick={() => removePhoto(photo.id)}
                  >
                    x
                  </Button>
                </View>
              ))}
              {photos.length < MAX_PHOTOS && (
                <Button className="capsule-photo-add" disabled={working} onClick={() => void pickPhotos()}>
                  <Text className="capsule-photo-add-mark">+</Text>
                  <Text className="capsule-photo-add-copy">添加照片</Text>
                </Button>
              )}
            </View>
          </View>

          <View className="capsule-editor-submit-bar">
            {progress && <Text className="capsule-editor-progress">{progress}</Text>}
            <Button
              className="btn capsule-editor-submit"
              disabled={!canSave}
              loading={working}
              onClick={() => void save()}
            >
              {editingCapsule ? "保存修改" : "封存到未来"}
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}
