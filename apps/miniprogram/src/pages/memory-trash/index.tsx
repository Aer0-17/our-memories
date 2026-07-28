import { useCallback, useMemo, useState } from "react";
import { Button, Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import {
  apiBaseUrl,
  getTrashedMemories,
  readSession,
  resolveAssetUrl,
  restoreMemory,
  type TrashedMemory,
} from "../../lib/api";
import trashIcon from "../../assets/lucide/trash-2.svg";
import "./index.scss";

const retentionDays = 30;
const dayMilliseconds = 24 * 60 * 60 * 1000;

function memoryDate(value: string) {
  const normalized = value.replace(/\./g, "-");
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) return value || "未记录日期";
  return `${year}.${month}.${day}`;
}

function deletedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近删除";
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日删除`;
}

function retentionLabel(value: string) {
  const deleted = new Date(value);
  if (Number.isNaN(deleted.getTime())) return "30 天内可恢复";
  const remaining = Math.max(
    0,
    Math.ceil((deleted.getTime() + retentionDays * dayMilliseconds - Date.now()) / dayMilliseconds),
  );
  return remaining > 0 ? `还可保留 ${remaining} 天` : "即将自动清理";
}

export default function MemoryTrashPage() {
  const [memories, setMemories] = useState<TrashedMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [restoringId, setRestoringId] = useState("");

  const loadTrash = useCallback(async () => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const data = await getTrashedMemories();
      setMemories(data.memories || []);
    } catch {
      setStatus("暂时没有同步到回收站，请检查网络后再试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void loadTrash();
  });

  usePullDownRefresh(() => {
    void loadTrash().finally(() => Taro.stopPullDownRefresh());
  });

  const sorted = useMemo(
    () => [...memories].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)),
    [memories],
  );
  const currentUserId = readSession()?.user.id;
  const mineCount = memories.filter((memory) => memory.createdById === currentUserId).length;

  const restore = async (memory: TrashedMemory) => {
    if (restoringId || memory.createdById !== currentUserId) return;
    setRestoringId(memory.id);
    setStatus("");
    try {
      await restoreMemory(memory.id);
      setMemories((current) => current.filter((item) => item.id !== memory.id));
      Taro.showToast({ title: "回忆已恢复", icon: "success" });
    } catch {
      setStatus("恢复失败，请稍后再试。");
    } finally {
      setRestoringId("");
    }
  };

  return (
    <View className="page memory-trash-page">
      <AppHeader title="回忆回收站" back />

      <View className="trash-protection">
        <View className="trash-protection-icon">
          <Image className="trash-protection-icon-image" src={trashIcon} mode="aspectFit" />
        </View>
        <View className="trash-protection-copy">
          <Text className="trash-protection-kicker">30 天安心期</Text>
          <Text className="trash-protection-title">误删的故事，还能回到原处</Text>
          <Text className="trash-protection-text">
            超过 30 天后，服务器会自动清理回忆和照片，届时无法恢复。
          </Text>
        </View>
      </View>

      <View className="trash-summary">
        <View>
          <Text className="trash-summary-value">{memories.length}</Text>
          <Text className="trash-summary-label"> 段待处理</Text>
        </View>
        <Text className="trash-summary-note">其中 {mineCount} 段可由当前身份恢复</Text>
      </View>

      {status ? <ErrorBanner copy={status} onRetry={loadTrash} /> : null}
      {loading && sorted.length === 0 ? (
        <LoadingState compact />
      ) : sorted.length === 0 && !status ? (
        <EmptyState
          title="回收站是空的"
          copy="所有回忆都好好待在原来的位置。"
          actionLabel="返回回忆"
          onAction={() => Taro.switchTab({ url: "/pages/memories/index" })}
        />
      ) : (
        <View className="trash-list">
          {sorted.map((memory) => {
            const cover = memory.photos?.[0] || memory.image;
            const canRestore = memory.createdById === currentUserId;
            return (
              <View className="trash-card card" key={memory.id}>
                {cover ? (
                  <Image
                    className="trash-card-cover"
                    src={resolveAssetUrl(cover, apiBaseUrl)}
                    mode="aspectFill"
                    lazyLoad
                  />
                ) : (
                  <View className="trash-card-cover trash-card-placeholder">
                    <Text>{memory.city?.slice(0, 1) || "忆"}</Text>
                  </View>
                )}

                <View className="trash-card-body">
                  <View className="trash-card-heading">
                    <Text className="trash-card-title">
                      {memory.title || memory.city || "未命名回忆"}
                    </Text>
                    <Text className="trash-card-retention">{retentionLabel(memory.deletedAt)}</Text>
                  </View>
                  <Text className="trash-card-meta">
                    {memoryDate(memory.date)} · {memory.placeName || memory.city || "未记录地点"}
                  </Text>
                  <Text className="trash-card-text">{memory.text || "这段回忆没有留下文字。"}</Text>

                  <View className="trash-card-footer">
                    <Text className="trash-card-deleted">{deletedDate(memory.deletedAt)}</Text>
                    {canRestore ? (
                      <Button
                        className="trash-restore"
                        disabled={Boolean(restoringId)}
                        onClick={() => void restore(memory)}
                      >
                        {restoringId === memory.id ? "恢复中…" : "恢复"}
                      </Button>
                    ) : (
                      <Text className="trash-owner-note">由对方管理</Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
