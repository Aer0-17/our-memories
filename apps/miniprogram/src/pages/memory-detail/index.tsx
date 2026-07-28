import { useCallback, useMemo, useState } from "react";
import { Button, Image, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useRouter } from "@tarojs/taro";
import type { Memory } from "@map-of-us/shared";
import { AppHeader } from "../../components/AppHeader";
import { ErrorBanner, LoadingState } from "../../components/PageStates";
import { VoicePlayer } from "../../components/VoicePlayer";
import { VoiceRecorder } from "../../components/VoiceRecorder";
import {
  apiBaseUrl,
  deleteUploadedMedia,
  getMemories,
  readSession,
  resolveAssetUrl,
  updateMemorySupplement,
  uploadVoiceAudio,
} from "../../lib/api";
import type { VoiceDraft } from "../../lib/voice";
import imagesIcon from "../../assets/lucide/images.svg";
import "./index.scss";

const NOTE_LIMIT = 500;

type MemoryDetail = Memory & {
  partnerNoteAuthorId?: string;
};

type MemoryEcho = {
  memory: MemoryDetail;
  reason: string;
  score: number;
};

function displayDate(value: string) {
  const parts = value.slice(0, 10).replace(/\./g, "-").split("-");
  if (parts.length !== 3) return value;
  return `${parts[0]} 年 ${Number(parts[1])} 月 ${Number(parts[2])} 日`;
}

function flattenMemories(store: Record<string, Memory[]>) {
  return Object.values(store).flat() as MemoryDetail[];
}

function memoryPhotos(memory: MemoryDetail | null) {
  if (!memory) return [];
  return Array.from(new Set((memory.photos?.length ? memory.photos : [memory.image]).filter(Boolean)))
    .map((url) => resolveAssetUrl(url, apiBaseUrl));
}

function normalizedDate(value: string) {
  return value.slice(0, 10).replace(/\./g, "-");
}

function memoryEchoes(current: MemoryDetail | null, memories: MemoryDetail[]): MemoryEcho[] {
  if (!current) return [];
  const [currentYear, currentMonth, currentDay] = normalizedDate(current.date).split("-");

  return memories
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => {
      const [candidateYear, candidateMonth, candidateDay] = normalizedDate(candidate.date).split("-");
      const sameCalendarDay = Boolean(
        currentMonth && currentDay &&
        currentMonth === candidateMonth &&
        currentDay === candidateDay &&
        currentYear !== candidateYear,
      );
      const sharedCodes = (current.tags || []).filter((tag) => candidate.tags?.includes(tag));
      const samePlace = Boolean(
        current.placeName && candidate.placeName &&
        current.placeName.trim() === candidate.placeName.trim(),
      );
      const sameCity = Boolean(
        (current.cityId && candidate.cityId && current.cityId === candidate.cityId) ||
        (current.city && candidate.city && current.city === candidate.city),
      );

      let reason = "";
      let score = 0;
      if (sameCalendarDay) {
        const yearsApart = Math.abs(Number(currentYear) - Number(candidateYear));
        reason = yearsApart > 0 ? `隔了 ${yearsApart} 年的同一天` : "不同年份的同一天";
        score += 100;
      }
      if (sharedCodes.length > 0) {
        if (!reason) reason = `也写着 #${sharedCodes[0]}`;
        score += Math.min(sharedCodes.length, 3) * 40;
      }
      if (samePlace) {
        if (!reason) reason = `又回到了${current.placeName}`;
        score += 30;
      }
      if (sameCity) {
        if (!reason) reason = `同在${current.city}留下`;
        score += 20;
      }

      return { memory: candidate, reason, score };
    })
    .filter((echo) => echo.score > 0)
    .sort((a, b) => b.score - a.score || b.memory.date.localeCompare(a.memory.date))
    .slice(0, 3);
}

function memoryEchoCover(memory: MemoryDetail) {
  const url = memory.photos?.[0] || memory.image;
  return url ? resolveAssetUrl(url, apiBaseUrl) : "";
}

export default function MemoryDetailPage() {
  const router = useRouter();
  const memoryId = typeof router.params.id === "string" ? router.params.id : "";
  const [memory, setMemory] = useState<MemoryDetail | null>(null);
  const [memoryPool, setMemoryPool] = useState<MemoryDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [partnerVoiceUrl, setPartnerVoiceUrl] = useState("");
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);
  const [voiceRecording, setVoiceRecording] = useState(false);

  const loadMemory = useCallback(async (background = false) => {
    const session = readSession();
    if (!session) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!memoryId) {
      setStatus("没有找到要查看的回忆。");
      setLoading(false);
      return;
    }

    if (!background) setLoading(true);
    setStatus("");
    try {
      const data = await getMemories();
      const allMemories = flattenMemories(data.memories);
      const item = allMemories.find((candidate) => candidate.id === memoryId);
      if (!item) throw new Error("Memory not found");
      setMemoryPool(allMemories);
      setMemory(item);
      setNote(item.partnerNote || "");
      setPartnerVoiceUrl(item.partnerVoiceUrl || "");
      setVoiceDraft(null);
    } catch {
      setStatus("回忆详情暂时没有同步成功，请稍后再试。");
    } finally {
      if (!background) setLoading(false);
    }
  }, [memoryId]);

  useDidShow(() => {
    void loadMemory(Boolean(memory));
  });

  usePullDownRefresh(() => {
    void loadMemory(true).finally(() => Taro.stopPullDownRefresh());
  });

  const session = readSession();
  const isCreator = Boolean(memory?.createdById && session?.user.id === memory.createdById);
  const canSupplement = Boolean(memory?.createdById && session?.user.id && !isCreator);
  const photos = useMemo(() => memoryPhotos(memory), [memory]);
  const echoes = useMemo(() => memoryEchoes(memory, memoryPool), [memory, memoryPool]);
  const originalNote = memory?.partnerNote || "";
  const originalVoiceUrl = memory?.partnerVoiceUrl || "";
  const supplementChanged = Boolean(
    note.trim() !== originalNote.trim() ||
    partnerVoiceUrl !== originalVoiceUrl ||
    voiceDraft,
  );
  const canSaveSupplement = Boolean(
    canSupplement && supplementChanged && !working && !voiceRecording,
  );
  const hasPartnerPerspective = Boolean(
    memory?.partnerNote?.trim() || memory?.partnerVoiceUrl,
  );
  const perspectiveCount = hasPartnerPerspective ? 2 : 1;
  const creatorPerspectiveLabel = isCreator ? "我的视角" : "TA 的视角";
  const partnerPerspectiveLabel = isCreator ? "TA 的视角" : "我的视角";

  const previewPhotos = (current: string) => {
    if (photos.length === 0) return;
    Taro.previewImage({ current, urls: photos });
  };

  const openEditor = () => {
    if (!memory || !isCreator) return;
    Taro.navigateTo({ url: `/pages/memory-editor/index?id=${encodeURIComponent(memory.id)}` });
  };

  const openEcho = (echoId: string) => {
    Taro.redirectTo({ url: `/pages/memory-detail/index?id=${encodeURIComponent(echoId)}` });
  };

  const saveSupplement = async () => {
    if (!memory || !canSaveSupplement) return;
    let uploadedKey = "";
    let uploadedVoiceUrl = "";
    setWorking(true);
    setStatus("");
    try {
      if (voiceDraft) {
        const uploaded = await uploadVoiceAudio(voiceDraft, "memories");
        uploadedKey = uploaded.key;
        uploadedVoiceUrl = uploaded.url;
      }
      const nextVoiceUrl = uploadedVoiceUrl || partnerVoiceUrl;
      const response = await updateMemorySupplement(memory.id, {
        partnerNote: note.trim(),
        partnerVoiceUrl: nextVoiceUrl,
      });
      const refreshed = flattenMemories(response.memories).find((item) => item.id === memory.id);
      setMemory(refreshed || {
        ...memory,
        partnerNote: note.trim(),
        partnerVoiceUrl: nextVoiceUrl,
        partnerNoteAuthorId: session?.user.id,
      });
      setNote(note.trim());
      setPartnerVoiceUrl(nextVoiceUrl);
      setVoiceDraft(null);
      Taro.showToast({ title: "视角已保存", icon: "success" });
    } catch {
      if (uploadedKey) await deleteUploadedMedia([uploadedKey]);
      setStatus("视角保存失败，已清理本次上传的语音，请稍后再试。");
    } finally {
      setWorking(false);
    }
  };

  return (
    <View className="page memory-detail-page">
      <AppHeader title="回忆详情" back />

      {status && <ErrorBanner copy={status} onRetry={() => void loadMemory()} />}
      {loading && !memory ? (
        <LoadingState />
      ) : memory ? (
        <View className="memory-detail-content">
          {photos[0] ? (
            <Image
              className="memory-detail-hero"
              src={photos[0]}
              mode="aspectFill"
              onClick={() => previewPhotos(photos[0])}
            />
          ) : (
            <View className="memory-detail-hero memory-detail-placeholder">
              <Image className="memory-detail-placeholder-icon" src={imagesIcon} mode="aspectFit" />
              <Text className="memory-detail-placeholder-place">{memory.city || "回忆"}</Text>
            </View>
          )}

          <View className="memory-detail-story">
            <Text className="memory-detail-date">{displayDate(memory.date)}</Text>
            <Text className="memory-detail-title">{memory.title || memory.city || "未命名回忆"}</Text>
            {(memory.city || memory.placeName) && (
              <Text className="memory-detail-place">
                {[memory.city, memory.placeName].filter(Boolean).join(" · ")}
              </Text>
            )}
            {memory.mood && (
              <View className="memory-detail-tags">
                <Text className="memory-detail-tag mood">{memory.mood}</Text>
              </View>
            )}
            {Boolean(memory.tags?.length) && (
              <View className="memory-detail-codes">
                <View className="memory-detail-codes-heading">
                  <View className="memory-detail-codes-heading-copy">
                    <Text className="memory-detail-codes-title">我们的暗号</Text>
                    <Text className="memory-detail-codes-subtitle">只有你们知道，它们指向哪段故事。</Text>
                  </View>
                  <Text className="memory-detail-codes-count">{memory.tags?.length} 个</Text>
                </View>
                <View className="memory-detail-code-row">
                  {memory.tags?.map((tag) => (
                    <Text className="memory-detail-code" key={`${memory.id}-${tag}`}>#{tag}</Text>
                  ))}
                </View>
              </View>
            )}
          </View>

          <View className="memory-perspectives">
            <View className="memory-perspectives-heading">
              <View className="memory-perspectives-heading-copy">
                <Text className="memory-detail-section-title">同一天，两种记得</Text>
                <Text className="memory-perspectives-subtitle">两个人的视角，都留在这段回忆里。</Text>
              </View>
              <Text className="memory-perspectives-count">{perspectiveCount} / 2</Text>
            </View>

            <View className="memory-perspective memory-perspective-creator">
              <View className="memory-perspective-heading">
                <View className="memory-perspective-avatar creator">{isCreator ? "我" : "TA"}</View>
                <View className="memory-perspective-heading-copy">
                  <Text className="memory-perspective-label">{creatorPerspectiveLabel}</Text>
                  <Text className="memory-perspective-meta">最初写下</Text>
                </View>
              </View>
              <Text className="memory-perspective-copy">{memory.text}</Text>
              {memory.voiceTextUrl && (
                <VoicePlayer
                  src={resolveAssetUrl(memory.voiceTextUrl, apiBaseUrl)}
                  label="回忆语音"
                  onError={setStatus}
                />
              )}
            </View>

            {canSupplement ? (
              <View className="memory-perspective memory-perspective-partner memory-perspective-editable">
                <View className="memory-perspective-heading">
                  <View className="memory-perspective-avatar partner">我</View>
                  <View className="memory-perspective-heading-copy">
                    <Text className="memory-perspective-label">我的视角</Text>
                    <Text className="memory-perspective-meta">把你记得的也留在这里</Text>
                  </View>
                  <Text className="memory-detail-section-count">{note.length} / {NOTE_LIMIT}</Text>
                </View>

                <Textarea
                  className="field memory-supplement-textarea"
                  disabled={working}
                  maxlength={NOTE_LIMIT}
                  value={note}
                  onInput={(event) => setNote(event.detail.value)}
                  placeholder="那天你记得什么？"
                />

                {partnerVoiceUrl && !voiceDraft && !voiceRecording && (
                  <View className="memory-supplement-existing-voice">
                    <View className="memory-supplement-voice-heading">
                      <Text className="memory-detail-section-label">已保存的视角语音</Text>
                      <Button
                        className="memory-supplement-remove-voice"
                        disabled={working}
                        onClick={() => setPartnerVoiceUrl("")}
                      >
                        移除
                      </Button>
                    </View>
                    <VoicePlayer
                      src={resolveAssetUrl(partnerVoiceUrl, apiBaseUrl)}
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

                <Button
                  className="btn memory-supplement-save"
                  disabled={!canSaveSupplement}
                  loading={working}
                  onClick={() => void saveSupplement()}
                >
                  保存我的视角
                </Button>
              </View>
            ) : hasPartnerPerspective ? (
              <View className="memory-perspective memory-perspective-partner">
                <View className="memory-perspective-heading">
                  <View className="memory-perspective-avatar partner">TA</View>
                  <View className="memory-perspective-heading-copy">
                    <Text className="memory-perspective-label">{partnerPerspectiveLabel}</Text>
                    <Text className="memory-perspective-meta">后来补充</Text>
                  </View>
                </View>
                {memory.partnerNote && <Text className="memory-perspective-copy">{memory.partnerNote}</Text>}
                {memory.partnerVoiceUrl && (
                  <VoicePlayer
                    src={resolveAssetUrl(memory.partnerVoiceUrl, apiBaseUrl)}
                    compact
                    onError={setStatus}
                  />
                )}
              </View>
            ) : (
              <View className="memory-perspective memory-perspective-empty">
                <View className="memory-perspective-avatar partner">TA</View>
                <View className="memory-perspective-empty-copy">
                  <Text className="memory-perspective-label">{partnerPerspectiveLabel}</Text>
                  <Text className="memory-perspective-meta">还在等 TA 留下那天的记得</Text>
                </View>
              </View>
            )}
          </View>

          {photos.length > 1 && (
            <View className="memory-detail-gallery-section">
              <View className="memory-detail-section-heading">
                <Text className="memory-detail-section-title">全部照片</Text>
                <Text className="memory-detail-section-count">{photos.length} 张</Text>
              </View>
              <View className="memory-detail-gallery">
                {photos.map((photo, index) => (
                  <Image
                    className="memory-detail-gallery-image"
                    key={`${photo}-${index}`}
                    src={photo}
                    mode="aspectFill"
                    lazyLoad
                    onClick={() => previewPhotos(photo)}
                  />
                ))}
              </View>
            </View>
          )}

          {echoes.length > 0 && (
            <View className="memory-echoes">
              <View className="memory-echoes-heading">
                <View className="memory-echoes-heading-copy">
                  <Text className="memory-detail-section-title">回忆的回声</Text>
                  <Text className="memory-echoes-subtitle">有些日子，会在后来的故事里轻轻回应。</Text>
                </View>
                <Text className="memory-echoes-count">{echoes.length} 段</Text>
              </View>
              <View className="memory-echo-list">
                {echoes.map((echo) => {
                  const cover = memoryEchoCover(echo.memory);
                  return (
                    <Button
                      className="memory-echo-card"
                      key={echo.memory.id}
                      onClick={() => openEcho(echo.memory.id)}
                    >
                      {cover ? (
                        <Image className="memory-echo-cover" src={cover} mode="aspectFill" lazyLoad />
                      ) : (
                        <View className="memory-echo-cover memory-echo-placeholder">
                          <Text>{echo.memory.city?.slice(0, 1) || "忆"}</Text>
                        </View>
                      )}
                      <View className="memory-echo-body">
                        <Text className="memory-echo-reason">{echo.reason}</Text>
                        <Text className="memory-echo-title">
                          {echo.memory.title || echo.memory.city || "未命名回忆"}
                        </Text>
                        <Text className="memory-echo-meta">
                          {displayDate(echo.memory.date)}{echo.memory.city ? ` · ${echo.memory.city}` : ""}
                        </Text>
                      </View>
                      <Text className="memory-echo-arrow">›</Text>
                    </Button>
                  );
                })}
              </View>
            </View>
          )}

          {isCreator && (
            <Button className="btn btn-secondary memory-detail-edit" onClick={openEditor}>
              编辑这段回忆
            </Button>
          )}
        </View>
      ) : null}
    </View>
  );
}
