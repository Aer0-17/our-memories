import { useEffect, useMemo, useState } from "react";
import { Button, Image, Input, Picker, Text, Textarea, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import type { Memory } from "@map-of-us/shared";
import { AppHeader } from "../../components/AppHeader";
import { ErrorBanner, LoadingState } from "../../components/PageStates";
import {
  apiBaseUrl,
  createMemory,
  deleteUploadedImages,
  getMemories,
  readSession,
  resolveAssetUrl,
  updateMemory,
  uploadMemoryImage,
  type MemoryInput,
  type MemoryPhotoPayload,
} from "../../lib/api";
import "./index.scss";

const MAX_PHOTOS = 6;
const MAX_SOURCE_PHOTO_BYTES = 12 * 1024 * 1024;
const moods = ["开心", "浪漫", "想念", "平静"];

const commonCities: Record<string, { id: string; nameEn: string }> = {
  北京: { id: "beijing", nameEn: "Beijing" },
  上海: { id: "shanghai", nameEn: "Shanghai" },
  广州: { id: "guangzhou", nameEn: "Guangzhou" },
  深圳: { id: "shenzhen", nameEn: "Shenzhen" },
  杭州: { id: "hangzhou", nameEn: "Hangzhou" },
  南京: { id: "nanjing", nameEn: "Nanjing" },
  苏州: { id: "suzhou", nameEn: "Suzhou" },
  成都: { id: "chengdu", nameEn: "Chengdu" },
  重庆: { id: "chongqing", nameEn: "Chongqing" },
  武汉: { id: "wuhan", nameEn: "Wuhan" },
  西安: { id: "xian", nameEn: "Xi'an" },
  长沙: { id: "changsha", nameEn: "Changsha" },
  青岛: { id: "qingdao", nameEn: "Qingdao" },
  厦门: { id: "xiamen", nameEn: "Xiamen" },
  大连: { id: "dalian", nameEn: "Dalian" },
  昆明: { id: "kunming", nameEn: "Kunming" },
  大理: { id: "dali", nameEn: "Dali" },
  香港: { id: "hongkong", nameEn: "Hong Kong" },
  澳门: { id: "macau", nameEn: "Macau" },
};

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
  return value.replace(/\./g, "-");
}

function apiDate(value: string) {
  return value.replace(/-/g, ".");
}

function cityIdentity(name: string) {
  const known = commonCities[name];
  if (known) return known;

  let hash = 2166136261;
  for (const character of name) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return { id: `custom-${(hash >>> 0).toString(36)}`, nameEn: name };
}

function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,，\s]+/)
        .map((tag) => tag.trim().replace(/^#/, "").slice(0, 24))
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

function remotePhotoDrafts(memory: Memory): PhotoDraft[] {
  const urls = Array.from(new Set((memory.photos?.length ? memory.photos : [memory.image]).filter(Boolean)));
  return urls.slice(0, MAX_PHOTOS).map((url, index) => ({
    id: `remote-${index}-${url}`,
    previewUrl: resolveAssetUrl(url, apiBaseUrl),
    remote: { url, key: "", mimeType: "image/jpeg", mediaType: "image" },
  }));
}

export default function MemoryEditorPage() {
  const router = useRouter();
  const memoryId = typeof router.params.id === "string" ? router.params.id : "";
  const isAnniversaryDraft = !memoryId && router.params.template === "anniversary";
  const draftDate = typeof router.params.date === "string" ? router.params.date.slice(0, 10) : "";
  const draftTitle = typeof router.params.title === "string" ? router.params.title : "";
  const draftTags = typeof router.params.tags === "string" ? router.params.tags : "";
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [loading, setLoading] = useState(Boolean(memoryId));
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState("");
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [city, setCity] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(localDateValue);
  const [text, setText] = useState("");
  const [mood, setMood] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<"both" | "me">("both");

  useEffect(() => {
    const session = readSession();
    if (!session) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!memoryId) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(draftDate)) setDate(draftDate);
      if (draftTitle) setTitle(draftTitle.slice(0, 120));
      if (draftTags) setTags(draftTags);
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatus("");
    void getMemories()
      .then((data) => {
        const memory = Object.values(data.memories).flat().find((item) => item.id === memoryId);
        if (!memory) throw new Error("Memory not found");
        if (!memory.createdById || memory.createdById !== session.user.id) {
          throw new Error("Only creator can edit");
        }
        setEditingMemory(memory);
        setPhotos(remotePhotoDrafts(memory));
        setCity(memory.city || "");
        setPlaceName(memory.placeName || "");
        setTitle(memory.title || "");
        setDate(pickerDate(memory.date));
        setText(memory.text || "");
        setMood(memory.mood || "");
        setTags(memory.tags?.join("，") || "");
        setVisibility(memory.visibility === "me" ? "me" : "both");
      })
      .catch(() => setStatus("没有找到这段回忆，或当前身份没有编辑权限。"))
      .finally(() => setLoading(false));
  }, [draftDate, draftTags, draftTitle, memoryId]);

  const canSave = useMemo(
    () => Boolean(
      city.trim() &&
      date &&
      text.trim() &&
      !working &&
      !loading &&
      (!memoryId || editingMemory),
    ),
    [city, date, editingMemory, loading, memoryId, text, working],
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
    if (!canSave) {
      setStatus("请至少填写城市、日期和回忆内容。");
      return;
    }

    const trimmedCity = city.trim();
    const identity = cityIdentity(trimmedCity);
    const uploadedById = new Map<string, MemoryPhotoPayload>();
    const uploadedKeys: string[] = [];
    const localPhotos = photos.filter((photo) => photo.filePath);

    setWorking(true);
    setStatus("");
    try {
      for (let index = 0; index < localPhotos.length; index += 1) {
        const photo = localPhotos[index];
        setProgress(`正在上传第 ${index + 1} / ${localPhotos.length} 张照片…`);
        const uploaded = await uploadMemoryImage({
          filePath: photo.filePath || "",
          width: photo.width,
          height: photo.height,
        });
        uploadedById.set(photo.id, uploaded);
        if (uploaded.key) uploadedKeys.push(uploaded.key);
      }

      const payloadPhotos = photos.flatMap((photo) => {
        if (photo.remote) return [photo.remote];
        const uploaded = uploadedById.get(photo.id);
        return uploaded ? [uploaded] : [];
      });

      const common: Omit<MemoryInput, "cityId" | "city" | "cityEn"> = {
        title: title.trim().slice(0, 120),
        date: apiDate(date),
        text: text.trim().slice(0, 500),
        mood,
        tags: parseTags(tags),
        visibility,
        placeName: placeName.trim().slice(0, 120),
        photos: payloadPhotos,
      };

      setProgress(editingMemory ? "正在保存修改…" : "正在写入这段回忆…");
      if (editingMemory) {
        await updateMemory(editingMemory.id, common);
      } else {
        await createMemory({
          ...common,
          cityId: identity.id,
          city: trimmedCity,
          cityEn: identity.nameEn,
        });
      }

      Taro.showToast({ title: editingMemory ? "修改已保存" : "回忆已记录", icon: "success" });
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
    <View className="page memory-editor-page">
      <AppHeader title={editingMemory ? "编辑回忆" : isAnniversaryDraft ? "记录今年" : "记录回忆"} back />

      <View className="screen-intro editor-intro">
        <Text className="screen-title">
          {editingMemory ? "补好这段故事" : isAnniversaryDraft ? "把今年也留在这里" : "把今天留在这里"}
        </Text>
        <Text className="screen-subtitle">
          {isAnniversaryDraft ? "写下今天的感受，明年回放时会再次遇见。" : "照片可以以后再补，城市、日期和文字需要填写。"}
        </Text>
      </View>

      {status && <ErrorBanner copy={status} />}
      {loading ? (
        <LoadingState compact />
      ) : (
        <View className="memory-form">
          <View className="editor-section card">
            <View className="editor-section-heading">
              <View className="editor-section-copy">
                <Text className="editor-section-title">照片</Text>
                <Text className="editor-section-note">最多 6 张，上传前会自动压缩</Text>
              </View>
              <Text className="editor-section-count">{photos.length} / {MAX_PHOTOS}</Text>
            </View>

            <View className="photo-grid">
              {photos.map((photo) => (
                <View className="photo-draft" key={photo.id}>
                  <Image className="photo-draft-image" src={photo.previewUrl} mode="aspectFill" />
                  <Button
                    className="photo-remove"
                    aria-label="移除照片"
                    disabled={working}
                    onClick={() => removePhoto(photo.id)}
                  >
                    ×
                  </Button>
                </View>
              ))}
              {photos.length < MAX_PHOTOS && (
                <Button className="photo-add" disabled={working} onClick={() => void pickPhotos()}>
                  <Text className="photo-add-mark">＋</Text>
                  <Text className="photo-add-copy">添加照片</Text>
                </Button>
              )}
            </View>
          </View>

          <View className="editor-section card">
            <View className="editor-section-heading">
              <View className="editor-section-copy">
                <Text className="editor-section-title">时间与地点</Text>
                <Text className="editor-section-note">城市会用于网页端的回忆归类</Text>
              </View>
            </View>

            <View className="editor-meta-grid">
              <View className="editor-field-group">
                <Text className="editor-label">日期 *</Text>
                <Picker mode="date" value={date} onChange={(event) => setDate(event.detail.value)}>
                  <View className="field editor-picker">{date || "选择日期"}</View>
                </Picker>
              </View>
              <View className="editor-field-group">
                <Text className="editor-label">城市 *</Text>
                <Input
                  className="field"
                  disabled={Boolean(editingMemory)}
                  maxlength={40}
                  value={city}
                  onInput={(event) => setCity(event.detail.value)}
                  placeholder="例如：杭州"
                />
                {editingMemory && <Text className="editor-help">已有回忆的城市归属暂不修改。</Text>}
              </View>
            </View>

            <View className="editor-field-group">
              <Text className="editor-label">具体地点</Text>
              <Input
                className="field"
                maxlength={120}
                value={placeName}
                onInput={(event) => setPlaceName(event.detail.value)}
                placeholder="例如：西湖边、家里的阳台"
              />
            </View>
          </View>

          <View className="editor-section card">
            <View className="editor-section-heading">
              <View className="editor-section-copy">
                <Text className="editor-section-title">那天的故事</Text>
                <Text className="editor-section-note">先写下最想记住的一句话</Text>
              </View>
            </View>

            <View className="editor-field-group">
              <Text className="editor-label">标题</Text>
              <Input
                className="field"
                maxlength={120}
                value={title}
                onInput={(event) => setTitle(event.detail.value)}
                placeholder="给这段回忆起个名字"
              />
            </View>

            <View className="editor-field-group">
              <View className="editor-label-row">
                <Text className="editor-label">回忆内容 *</Text>
                <Text className="editor-counter">{text.length} / 500</Text>
              </View>
              <Textarea
                className="field editor-textarea"
                maxlength={500}
                value={text}
                onInput={(event) => setText(event.detail.value)}
                placeholder="那天发生了什么？当时是什么心情？"
              />
            </View>

            <View className="editor-field-group">
              <Text className="editor-label">心情</Text>
              <View className="choice-row">
                {moods.map((item) => (
                  <Button
                    className={mood === item ? "choice-chip active" : "choice-chip"}
                    key={item}
                    onClick={() => setMood((current) => (current === item ? "" : item))}
                  >
                    {item}
                  </Button>
                ))}
              </View>
            </View>

            <View className="editor-field-group">
              <Text className="editor-label">标签</Text>
              <Input
                className="field"
                maxlength={160}
                value={tags}
                onInput={(event) => setTags(event.detail.value)}
                placeholder="旅行，夜景，第一次"
              />
              <Text className="editor-help">用逗号或空格分开，最多保留 12 个。</Text>
            </View>

            <View className="editor-field-group">
              <Text className="editor-label">谁可以看</Text>
              <View className="visibility-grid">
                <Button
                  className={visibility === "both" ? "visibility-option active" : "visibility-option"}
                  onClick={() => setVisibility("both")}
                >
                  <Text className="visibility-title">两个人</Text>
                  <Text className="visibility-copy">你们都能看到</Text>
                </Button>
                <Button
                  className={visibility === "me" ? "visibility-option active" : "visibility-option"}
                  onClick={() => setVisibility("me")}
                >
                  <Text className="visibility-title">仅自己</Text>
                  <Text className="visibility-copy">只对当前身份可见</Text>
                </Button>
              </View>
            </View>
          </View>

          <View className="editor-submit-bar">
            {progress && <Text className="editor-progress">{progress}</Text>}
            <Button className="btn editor-submit" disabled={!canSave} loading={working} onClick={() => void save()}>
              {editingMemory ? "保存修改" : "记录这段回忆"}
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
