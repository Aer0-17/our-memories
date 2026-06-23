"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ImagePlus, Maximize2, Minimize2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import type { City } from "@/data/cities";
import { sortMemoriesByTime, type Memory } from "@/data/memories";
import { MemoryContentView, photosOfMemory } from "@/components/memories/MemoryContentView";
import type { MemoryPatchPayload } from "@/components/memories/MemoryCitySheet";
import { DatePicker } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useConfirm } from "@/components/ui/use-confirm";
import { apiFetch } from "@/lib/apiClient";
import { normalizeDottedDate } from "@/lib/dateFormat";
import { memoryPhotosPayload } from "@/lib/photoPayload";
import { computeMemoryEditAccess, useMemoryEditAccess } from "@/lib/useContentEditAccess";
import { deleteUploaded, uploadImage, uploadImages } from "@/lib/upload";
import { LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { type CardAnchor, type MemoryPanelTab, type PhotoDraft, maxPhotosPerMemory, memoryTextMaxLength, revokePhotoDrafts, spring } from "./shared";
import { MemoryImage } from "./MemoryImage";

export function MemoryCard({
  city,
  localMemories,
  isLit,
  anchor,
  isAdmin,
  onClose,
  onSave,
  onSetCover,
  onUpdate,
  onDelete,
  landmarkImage,
  hasCustomLandmark,
  onSaveLandmark,
  onDeleteLandmark,
}: Readonly<{
  city: City;
  localMemories: Memory[];
  isLit: boolean;
  anchor: CardAnchor | null;
  isAdmin: boolean;
  onClose: () => void;
  onSave: (cityId: string, memory: Memory) => Promise<void>;
  onSetCover: (cityId: string, memoryId: string, coverImage: string) => Promise<void>;
  onUpdate: (cityId: string, memoryId: string, memory: MemoryPatchPayload) => Promise<void>;
  onDelete: (cityId: string, memoryId: string) => Promise<void>;
  landmarkImage: string;
  hasCustomLandmark: boolean;
  onSaveLandmark: (cityId: string, image: string) => Promise<void>;
  onDeleteLandmark: (cityId: string) => Promise<void>;
}>) {
  const memories = sortMemoriesByTime(localMemories);
  const memory = memories[0];
  // 卡片级权限：基于「最新回忆」判断，决定卡片上显示「编辑/添加补充/删除」哪个按钮。
  // useMemoryEditAccess 比较 memory.createdById === session.user.id（两者均为 UUID）。
  const access = useMemoryEditAccess(memory);
  const canEditMemory = isAdmin && access.canEdit;
  const canAnnotateMemory = isAdmin && access.canAddNote && !access.canEdit;
  const memoryPhotos = photosOfMemory(memory);
  const galleryPhotos = Array.from(new Set(memories.flatMap((item) => photosOfMemory(item))));
  const localMemoryIds = useMemo(
    () => new Set(localMemories.map((item) => item.id)),
    [localMemories],
  );
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [formOpen, setFormOpen] = useState(!isLit && isAdmin);
  const [title, setTitle] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [date, setDate] = useState("");
  const [text, setText] = useState("");
  const [mood, setMood] = useState("");
  const [tags, setTags] = useState("");
  const [partnerNote, setPartnerNote] = useState("");
  const [visibility, setVisibility] = useState<"both" | "me" | "her">("both");
  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [polishSuggestion, setPolishSuggestion] = useState("");
  const [polishError, setPolishError] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [coverError, setCoverError] = useState("");
  const [settingCover, setSettingCover] = useState("");
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [deletingMemoryId, setDeletingMemoryId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [landmarkError, setLandmarkError] = useState("");
  const [landmarkSaving, setLandmarkSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<MemoryPanelTab>("memory");
  const [isSaving, setIsSaving] = useState(false);
  const photoDraftsRef = useRef<PhotoDraft[]>([]);
  const mountedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const landmarkInputRef = useRef<HTMLInputElement>(null);

  // 表单级权限：基于「正在编辑的记录」editingMemory 判断，而非最新回忆。
  // 这样编辑较旧记录、或在最新回忆属对方时新建回忆，都能得到正确权限。
  // 用同步的 computeMemoryEditAccess（而非 hook）：编辑中途登录态变化无意义，
  // 同步计算可避免 startEdit 切换 editingMemory 后 1 帧的陈旧权限窗口。
  const editingAccess = computeMemoryEditAccess(editingMemory);
  // 新建模式（editingMemory 为 null）：任何登录者都可编辑全部字段（任何人都能创建新回忆并成为作者）。
  // 编辑模式：创建者可编辑全部字段，非创建者只能添加补充回忆。
  const isCreating = editingMemory == null;
  const canEditFields = isAdmin && (isCreating || editingAccess.canEdit);
  const canAnnotate = isAdmin && !isCreating && editingAccess.canAddNote && !editingAccess.canEdit;

  const trimmedDate = date.trim();
  const trimmedText = text.trim();
  const normalizedDate = normalizeDottedDate(trimmedDate);
  const dateInvalid = trimmedDate.length > 0 && !normalizedDate;
  // 创建者/新建：保存完整回忆（需日期+正文）；非创建者：仅保存补充回忆。
  const canSave = isAdmin
    ? canEditFields
      ? Boolean(normalizedDate) &&
        trimmedText.length > 0 &&
        !photoError &&
        !isSaving
      : canAnnotate &&
        editingMemory != null &&
        partnerNote.trim() !== (editingMemory.partnerNote ?? "").trim() &&
        (partnerNote.trim().length > 0 || Boolean(editingMemory.partnerNote?.trim())) &&
        !isSaving
    : false;
  const isEditing = Boolean(editingMemory);
  const showMemory = !expanded || activeTab === "memory";
  const showGallery = expanded && activeTab === "gallery";
  const showHistory = (!expanded || activeTab === "history") && memories.length > 0;

  const resetForm = (revokePhoto: boolean) => {
    setTitle("");
    setPlaceName("");
    setDate("");
    setText("");
    setMood("");
    setTags("");
    setPartnerNote("");
    setVisibility("both");
    setPhotoError("");
    setPolishSuggestion("");
    setPolishError("");
    setPolishing(false);
    setSaveError("");
    setCoverError("");
    setDeleteError("");
    setEditingMemory(null);
    if (revokePhoto) revokePhotoDrafts(photoDraftsRef.current);
    photoDraftsRef.current = [];
    setPhotoDrafts([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startEdit = (record: Memory) => {
    if (!isAdmin) return;

    revokePhotoDrafts(photoDraftsRef.current);
    photoDraftsRef.current = [];
    setPhotoDrafts([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setTitle(record.title ?? "");
    setPlaceName(record.placeName ?? "");
    setDate(record.date);
    setText(record.text);
    setMood(record.mood ?? "");
    setTags(record.tags?.join("，") ?? "");
    setPartnerNote(record.partnerNote ?? "");
    setVisibility(record.visibility ?? "both");
    setPhotoError("");
    setPolishSuggestion("");
    setPolishError("");
    setPolishing(false);
    setSaveError("");
    setCoverError("");
    setDeleteError("");
    setEditingMemory(record);
    setFormOpen(true);
    setActiveTab("memory");
  };

  const handleDelete = async (record: Memory) => {
    if (!isAdmin) {
      setDeleteError("请先登录后再删除");
      return;
    }

    if (deletingMemoryId) return;
    if (!await confirm({ title: `确定删除 ${record.city} ${record.date} 的这条回忆吗？`, danger: true, confirmText: "删除" })) return;

    setDeletingMemoryId(record.id);
    setDeleteError("");

    try {
      await onDelete(city.id, record.id);
      if (editingMemory?.id === record.id) resetForm(true);
    } catch {
      setDeleteError("删除失败，请稍后再试");
    } finally {
      if (mountedRef.current) setDeletingMemoryId("");
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      revokePhotoDrafts(photoDraftsRef.current);
    };
  }, []);

  const handlePickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) {
      event.target.value = "";
      setPhotoError("请先登录后再选择照片");
      return;
    }

    const files = Array.from(event.target.files ?? [])
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, maxPhotosPerMemory);
    if (files.length === 0) return;

    revokePhotoDrafts(photoDraftsRef.current);
    const nextPhotoDrafts = files.map((file) => ({
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      file,
    }));

    photoDraftsRef.current = nextPhotoDrafts;
    setPhotoDrafts(nextPhotoDrafts);
    setPhotoError("");
    setSaveError("");
  };

  const handlePolishMemory = async () => {
    if (!isAdmin) {
      setPolishError("请先登录后再使用 AI 润色");
      return;
    }
    if (!trimmedText || polishing) return;

    setPolishing(true);
    setPolishError("");

    try {
      const response = await apiFetch("/ai/memory-polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: trimmedText,
          cityId: city.id,
          city: city.name,
          date: normalizedDate ?? trimmedDate,
        }),
      });
      if (!response.ok) throw new Error("Polish failed");
      const data = (await response.json()) as { polishedText?: unknown };
      const nextText = typeof data.polishedText === "string" ? data.polishedText.trim().slice(0, memoryTextMaxLength) : "";
      if (!nextText) throw new Error("Empty polish result");
      setPolishSuggestion(nextText);
    } catch {
      setPolishError("润色失败，请稍后再试");
    } finally {
      if (mountedRef.current) setPolishing(false);
    }
  };

  const handlePickLandmark = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!isAdmin) {
      if (landmarkInputRef.current) landmarkInputRef.current.value = "";
      setLandmarkError("请先登录后再保存地标图");
      return;
    }
    if (!file || !file.type.startsWith("image/") || landmarkSaving) return;

    setLandmarkSaving(true);
    setLandmarkError("");

    let uploadedKey = "";
    try {
      const uploaded = await uploadImage(file, "city-assets");
      uploadedKey = uploaded.key;
      await onSaveLandmark(city.id, uploaded.url);
    } catch {
      await deleteUploaded([uploadedKey]);
      setLandmarkError("地标图片保存失败，请重新选择");
    } finally {
      if (mountedRef.current) setLandmarkSaving(false);
      if (landmarkInputRef.current) landmarkInputRef.current.value = "";
    }
  };

  const handleDeleteLandmark = async () => {
    if (!isAdmin) {
      setLandmarkError("请先登录后再删除地标图");
      return;
    }

    if (!hasCustomLandmark || landmarkSaving) return;
    if (!await confirm({ title: `确定删除 ${city.name} 的自定义地标图吗？`, danger: true, confirmText: "删除" })) return;

    setLandmarkSaving(true);
    setLandmarkError("");

    try {
      await onDeleteLandmark(city.id);
    } catch {
      setLandmarkError("地标图片删除失败，请稍后再试");
    } finally {
      if (mountedRef.current) setLandmarkSaving(false);
    }
  };

  const handleSave = async () => {
    if (!isAdmin) {
      setSaveError("请先登录后再保存");
      return;
    }
    if (!canSave) return;
    // 非创建者只保存补充回忆；创建者/新建保存完整回忆（需日期）。
    if (canEditFields && !normalizedDate) return;
    setIsSaving(true);
    setSaveError("");

    let uploadedKeys: string[] = [];
    try {
      if (editingMemory && canAnnotate && !canEditFields) {
        await onUpdate(city.id, editingMemory.id, { partnerNote: partnerNote.trim() });
        resetForm(true);
        setFormOpen(false);
        return;
      }

      if (!normalizedDate) return;

      const uploaded = await uploadImages(photoDrafts.map((photo) => photo.file), "memories");
      uploadedKeys = uploaded.map((item) => item.key);
      const photos = uploaded.map((item) => item.url);
      const nextTags = Array.from(
        new Set(
          tags
            .split(/[，,\s]+/)
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ).slice(0, 12);

      const nextPhotos = photos.length > 0 ? photos : editingMemory?.photos ?? [editingMemory?.image ?? landmarkImage];
      const nextMemory: Memory = {
        id: editingMemory?.id ?? `${city.id}-local`,
        cityId: city.id,
        city: city.name,
        cityEn: city.nameEn,
        title: title.trim() || undefined,
        placeName: placeName.trim() || undefined,
        date: normalizedDate,
        image: editingMemory && photos.length === 0 ? editingMemory.image : nextPhotos[0],
        photos: nextPhotos,
        text: trimmedText,
        mood: mood.trim() || undefined,
        tags: nextTags,
        visibility,
        createdById: editingMemory?.createdById,
        createdAt: editingMemory?.createdAt,
      };

      if (editingMemory) {
        const patch: MemoryPatchPayload = {
          title: nextMemory.title,
          placeName: nextMemory.placeName,
          date: nextMemory.date,
          image: nextMemory.image,
          text: nextMemory.text,
          mood: nextMemory.mood,
          tags: nextMemory.tags,
          visibility: nextMemory.visibility,
        };
        if (uploaded.length > 0) {
          patch.photos = memoryPhotosPayload(nextMemory.photos ?? [nextMemory.image]);
        }
        await onUpdate(city.id, editingMemory.id, patch);
      }
      else await onSave(city.id, {
        id: `${city.id}-local`,
        cityId: city.id,
        city: city.name,
        cityEn: city.nameEn,
        date: normalizedDate,
        image: photos[0] ?? landmarkImage,
        photos: photos.length > 0 ? photos : [landmarkImage],
        text: trimmedText,
        title: title.trim() || undefined,
        placeName: placeName.trim() || undefined,
        mood: mood.trim() || undefined,
        tags: nextTags,
        visibility,
      });
      resetForm(true);
      setFormOpen(false);
    } catch {
      await deleteUploaded(uploadedKeys);
      setSaveError("保存失败，请稍后再试");
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  };

  const handleSetCover = async (photo: string) => {
    if (!isAdmin) {
      setCoverError("请先登录后再设置封面");
      return;
    }

    if (!memory || memory.image === photo || settingCover) return;
    setSettingCover(photo);
    setCoverError("");

    try {
      await onSetCover(city.id, memory.id, photo);
    } catch {
      setCoverError("封面保存失败，请稍后再试");
    } finally {
      if (mountedRef.current) setSettingCover("");
    }
  };

  return (
    <motion.article
      className={`absolute z-50 overflow-y-auto rounded-[8px] border border-dim bg-cream/94 text-ink shadow-[0_18px_42px_rgba(90,102,112,0.18)] backdrop-blur ${
        expanded
          ? "max-h-[min(720px,calc(100vh-92px))] w-[390px] p-6"
          : "max-h-[min(620px,calc(100vh-110px))] w-[292px] p-5"
      }`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring}
      style={
        expanded
          ? { right: 0, top: 12 }
          : {
              left: anchor ? anchor.x : 24,
              top: anchor ? anchor.y : "50%",
            }
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <span className={`h-3 w-3 rounded-sm ${isLit ? "bg-bloom" : "bg-dim"}`} />
            {city.name}
            <span className="text-sm font-normal text-ink/62">{city.nameEn}</span>
          </h2>
          <p className="mt-3 text-sm text-ink/76">
            {memory?.date ?? "添加回忆后点亮"}
          </p>
          {!isAdmin && (
            <p className="mt-2 text-xs font-semibold text-ink/42">登录后可以修改回忆</p>
          )}
          {isAdmin && memory && !access.canEdit && (
            <p className="mt-2 text-xs font-semibold text-ink/42">这是对方写的回忆，你可以添加补充</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="grid h-8 w-8 place-items-center rounded-[6px] text-ink/62 transition hover:bg-mist/32 hover:text-sky"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? "收起城市记录面板" : "展开城市记录面板"}
            type="button"
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            className="grid h-8 w-8 place-items-center rounded-[6px] text-ink/62 transition hover:bg-dim/28 hover:text-ink"
            onClick={onClose}
            aria-label="关闭回忆卡片"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 flex rounded-[8px] border border-dim/72 bg-cream/72 p-1 text-xs font-semibold text-ink/58">
          {([
            ["memory", "回忆"],
            ["gallery", "相册"],
            ["history", "历史"],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              className={`flex-1 rounded-[7px] px-3 py-2 text-center transition ${
                activeTab === tab ? "bg-sakura text-bloom" : "hover:bg-mist/30"
              }`}
              type="button"
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {showMemory && (
        <>
          <div className="mt-4 rounded-[7px] border border-dim/72 bg-cream/72 p-3">
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[6px] border border-dim bg-mist">
                <MemoryImage src={landmarkImage} alt={`${city.name} 地标图`} dim={!isLit} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink/72">地图地标图</p>
                <p className="mt-1 text-[11px] leading-4 text-ink/46">
                  上传后会显示在省份地图里，不需要先点亮城市。
                </p>
              </div>
            </div>
            <input
              ref={landmarkInputRef}
              className="hidden"
              type="file"
              accept="image/*"
              onChange={handlePickLandmark}
              disabled={!isAdmin}
            />
            <div className="mt-3 flex gap-2">
              <button
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-sky px-3 py-2 text-xs font-semibold text-sky transition hover:bg-mist/34 disabled:opacity-45"
                type="button"
                onClick={() => landmarkInputRef.current?.click()}
                disabled={landmarkSaving || !isAdmin}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {hasCustomLandmark ? "替换地标" : "上传地标"}
              </button>
              {hasCustomLandmark && (
                <button
                  className="grid h-8 w-8 place-items-center rounded-[6px] border border-sakura text-bloom transition hover:bg-sakura/45 disabled:opacity-45"
                  type="button"
                  onClick={handleDeleteLandmark}
                  disabled={landmarkSaving || !isAdmin}
                  aria-label="删除自定义地标图"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {landmarkError && <p className="mt-2 text-xs text-bloom">{landmarkError}</p>}
          </div>

          <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-[6px] border border-dim bg-mist">
            <MemoryImage
              src={memory?.image ?? landmarkImage}
              alt={`${city.name} memory`}
              dim={!isLit}
              fit={memory ? "cover" : "contain"}
            />
            {memoryPhotos.length > 1 && (
              <span className="absolute bottom-2 right-2 rounded-[6px] bg-cream/86 px-2 py-1 text-xs font-medium text-ink/78 shadow-[0_6px_14px_rgba(90,102,112,0.12)]">
                {memoryPhotos.length} photos
              </span>
            )}
          </div>

          {memoryPhotos.length > 1 && (
            <div className={`mt-3 grid gap-2 ${expanded ? "grid-cols-5" : "grid-cols-4"}`}>
              {memoryPhotos.map((photo, index) => {
                const isCover = memory?.image === photo;

                return (
                  <button
                    key={`${memory?.id ?? city.id}-photo-${index}`}
                    className={`group relative aspect-square overflow-hidden rounded-[4px] border bg-mist transition ${
                      isCover
                        ? "border-bloom shadow-[0_0_0_2px_rgba(245,220,224,0.75)]"
                        : "border-dim hover:border-bloom"
                    }`}
                    type="button"
                    onClick={() => handleSetCover(photo)}
                    aria-label={isCover ? "当前封面" : `将第 ${index + 1} 张照片设为封面`}
                    disabled={!isAdmin || isCover || Boolean(settingCover)}
                  >
                    <MemoryImage src={photo} alt={`${city.name} memory photo ${index + 1}`} fit="cover" />
                    <span
                      className={`absolute inset-x-1 bottom-1 rounded-[4px] bg-cream/90 px-1.5 py-1 text-[10px] font-medium shadow-[0_4px_10px_rgba(90,102,112,0.10)] transition ${
                        isCover
                          ? "text-bloom opacity-100"
                          : "text-ink/68 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      {isCover ? "封面" : settingCover === photo ? "保存中" : "设封面"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {coverError && <p className="mt-2 text-xs text-bloom">{coverError}</p>}

          {memory ? (
            <div className="mt-4">
              <MemoryContentView memory={memory} cityName={city.name} showPhotos={false} showTitle />
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-ink/82">
              写下第一段回忆后，这座城市会被点亮。
            </p>
          )}
          {memory && localMemoryIds.has(memory.id) && (
            <div className="mt-4 flex gap-2">
              {canEditMemory ? (
                <button
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-dim px-3 py-2 text-xs font-medium text-ink/70 transition hover:border-sky hover:text-sky"
                  type="button"
                  onClick={() => startEdit(memory)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  编辑
                </button>
              ) : canAnnotateMemory ? (
                <button
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-sakura px-3 py-2 text-xs font-medium text-bloom transition hover:bg-sakura/55"
                  type="button"
                  onClick={() => startEdit(memory)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  添加补充
                </button>
              ) : null}
              <button
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-sakura px-3 py-2 text-xs font-medium text-bloom transition hover:bg-sakura/55 disabled:opacity-45"
                type="button"
                onClick={() => handleDelete(memory)}
                disabled={!canEditMemory || deletingMemoryId === memory.id}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deletingMemoryId === memory.id ? "删除中" : "删除"}
              </button>
            </div>
          )}
          {deleteError && <p className="mt-2 text-xs text-bloom">{deleteError}</p>}
        </>
      )}

      {showGallery && (
        <div className="mt-4">
          {galleryPhotos.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {galleryPhotos.map((photo, index) => (
                <span
                  key={`${city.id}-gallery-photo-${index}`}
                  className="relative aspect-square overflow-hidden rounded-[5px] border border-dim bg-mist"
                >
                  <MemoryImage src={photo} alt={`${city.name} gallery photo ${index + 1}`} fit="cover" />
                </span>
              ))}
            </div>
          ) : (
            <p className="rounded-[7px] border border-dashed border-dim px-4 py-6 text-center text-sm text-ink/56">
              还没有照片，添加第一段回忆后会出现在这里。
            </p>
          )}
        </div>
      )}

      {showHistory && (
        <div className="mt-4 border-t border-dashed border-dim pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-semibold text-ink/70">历史记录</p>
            <span className="text-[11px] text-ink/42">{memories.length} 条</span>
          </div>
          <div className={`mt-3 ${expanded ? "space-y-4" : "space-y-3"}`}>
            {memories.map((record, recordIndex) => {
              const recordPhotos = photosOfMemory(record);
              const editable = localMemoryIds.has(record.id);
              // 按每条记录的作者判断权限（历史里各条可能由不同人创建）。
              const recordAccess = computeMemoryEditAccess(record);
              const canEditRecord = editable && isAdmin && recordAccess.canEdit;
              const canAnnotateRecord = editable && isAdmin && recordAccess.canAddNote && !recordAccess.canEdit;

              return (
                <article
                  key={record.id}
                  className="rounded-[7px] border border-dim/70 bg-cream/72 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-ink/70">{record.date}</p>
                    <div className="flex items-center gap-1.5">
                      {recordIndex === 0 && (
                        <span className="rounded-full bg-sakura/82 px-2 py-0.5 text-[10px] font-medium text-bloom">
                          最新
                        </span>
                      )}
                      {editable ? (
                        <>
                          {canEditRecord && (
                            <button
                              className="grid h-6 w-6 place-items-center rounded-[5px] text-ink/46 transition hover:bg-mist/34 hover:text-sky"
                              type="button"
                              onClick={() => startEdit(record)}
                              aria-label={`编辑 ${record.city} ${record.date} 回忆`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canAnnotateRecord && (
                            <button
                              className="grid h-6 w-6 place-items-center rounded-[5px] text-bloom/70 transition hover:bg-sakura/46 hover:text-bloom"
                              type="button"
                              onClick={() => startEdit(record)}
                              aria-label={`给 ${record.city} ${record.date} 回忆添加补充`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            className="grid h-6 w-6 place-items-center rounded-[5px] text-ink/46 transition hover:bg-sakura/46 hover:text-bloom disabled:opacity-40"
                            type="button"
                            onClick={() => handleDelete(record)}
                            disabled={!canEditRecord || deletingMemoryId === record.id}
                            aria-label={`删除 ${record.city} ${record.date} 回忆`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] text-ink/36">示例</span>
                      )}
                    </div>
                  </div>
                  {record.title && <p className="mt-2 text-sm font-semibold text-ink">{record.title}</p>}
                  <p className="mt-2 text-xs leading-5 text-ink/72">{record.text}</p>
                  {(record.mood || record.tags?.length) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {record.mood && (
                        <span className="rounded-full bg-mist/42 px-2 py-0.5 text-[10px] font-semibold text-ink/58">
                          {record.mood}
                        </span>
                      )}
                      {record.tags?.slice(0, 4).map((tag) => (
                        <span
                          key={`${record.id}-history-tag-${tag}`}
                          className="rounded-full bg-cream/80 px-2 py-0.5 text-[10px] font-semibold text-ink/46"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {recordPhotos.length > 0 && (
                    <div className={`mt-3 grid gap-1.5 ${expanded ? "grid-cols-6" : "grid-cols-5"}`}>
                      {recordPhotos.slice(0, expanded ? 12 : 10).map((photo, photoIndex) => (
                        <span
                          key={`${record.id}-timeline-photo-${photoIndex}`}
                          className="relative aspect-square overflow-hidden rounded-[4px] border border-dim bg-mist"
                        >
                          <MemoryImage
                            src={photo}
                            alt={`${city.name} history photo ${photoIndex + 1}`}
                            fit="cover"
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {showMemory && !formOpen && (
        <button
          className="mt-4 flex w-full items-center gap-2 border-t border-dashed border-dim pt-4 text-sm font-medium text-ink/78 transition hover:text-sky"
          type="button"
          onClick={() => setFormOpen(true)}
          disabled={!isAdmin}
        >
          <Plus className="h-4 w-4" />
          {isLit ? "Add memory" : "Add memory to light"}
        </button>
      )}

      <AnimatePresence initial={false}>
        {formOpen && (
          <motion.div
            key="memory-form"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
          >
            <div className="mt-4 space-y-3 border-t border-dashed border-dim pt-4">
              {canEditFields && (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-ink/70">标题</span>
                    <input
                      className="mt-1.5 w-full rounded-[6px] border border-dim bg-cream px-3 py-2 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-bloom"
                      type="text"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="例如：第一次一起看海"
                      maxLength={120}
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-ink/70">具体地点</span>
                    <input
                      className="mt-1.5 w-full rounded-[6px] border border-dim bg-cream px-3 py-2 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-bloom"
                      type="text"
                      value={placeName}
                      onChange={(event) => setPlaceName(event.target.value)}
                      placeholder={`${city.name} 的某条街、某家店、某个角落`}
                      maxLength={120}
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-ink/70">日期</span>
                    <DatePicker
                      className="mt-1.5 w-full rounded-[6px] border border-dim bg-cream px-3 py-2 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-bloom"
                      value={date}
                      onChange={setDate}
                      aria-invalid={dateInvalid}
                    />
                    {dateInvalid && (
                      <span className="mt-1.5 block text-xs text-bloom">
                        请使用 2024.05.20 或 2024.5.20 格式
                      </span>
                    )}
                  </label>

                  <label className="block">
                    <span className="flex items-center justify-between gap-3 text-xs font-medium text-ink/70">
                      一句话回忆
                      <span className="font-normal text-ink/45">
                        {text.length}/{memoryTextMaxLength}
                      </span>
                    </span>
                    <textarea
                      className="mt-1.5 w-full resize-none rounded-[6px] border border-dim bg-cream px-3 py-2 text-sm leading-6 text-ink placeholder:text-ink/40 outline-none transition focus:border-bloom"
                      rows={3}
                      value={text}
                      onChange={(event) => {
                        setText(event.target.value);
                        setPolishSuggestion("");
                        setPolishError("");
                      }}
                      placeholder="写下这一刻……"
                      maxLength={memoryTextMaxLength}
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-medium text-ink/70">心情</span>
                      <input
                        className="mt-1.5 w-full rounded-[6px] border border-dim bg-cream px-3 py-2 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-bloom"
                        type="text"
                        value={mood}
                        onChange={(event) => setMood(event.target.value)}
                        placeholder="开心、想念、松弛..."
                        maxLength={40}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-ink/70">标签</span>
                      <input
                        className="mt-1.5 w-full rounded-[6px] border border-dim bg-cream px-3 py-2 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-bloom"
                        type="text"
                        value={tags}
                        onChange={(event) => setTags(event.target.value)}
                        placeholder="海边，夜景，第一次"
                        maxLength={120}
                      />
                    </label>
                  </div>

                  <div>
                    <span className="text-xs font-medium text-ink/70">可见性</span>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      {[
                        ["both", "给我们看"],
                        ["me", "只给我"],
                        ["her", "只给她"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          className={`rounded-[6px] border px-2 py-2 text-xs font-semibold transition ${
                            visibility === value
                              ? "border-sakura bg-sakura/62 text-rose-ink"
                              : "border-dim bg-cream text-ink/58 hover:border-sky"
                          }`}
                          type="button"
                          onClick={() => setVisibility(value as "both" | "me" | "her")}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      className="inline-flex min-h-9 items-center gap-2 rounded-[6px] border border-sakura bg-sakura/42 px-3 text-xs font-semibold text-bloom transition hover:bg-sakura/70 disabled:cursor-not-allowed disabled:opacity-45"
                      type="button"
                      onClick={handlePolishMemory}
                      disabled={!trimmedText || polishing}
                    >
                      {polishing ? <Spinner size="sm" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {polishing ? "润色中" : "AI 润色"}
                    </button>
                    {polishSuggestion && (
                      <div className="rounded-[7px] border border-sakura/76 bg-white/54 p-3">
                        <p className="text-xs leading-5 text-ink/72">{polishSuggestion}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            className="rounded-[6px] bg-sakura px-3 py-1.5 text-xs font-semibold text-bloom transition hover:bg-bloom hover:text-cream"
                            type="button"
                            onClick={() => {
                              setText(polishSuggestion.slice(0, memoryTextMaxLength));
                              setPolishSuggestion("");
                              setPolishError("");
                            }}
                          >
                            采用
                          </button>
                          <button
                            className="rounded-[6px] border border-dim px-3 py-1.5 text-xs font-semibold text-ink/66 transition hover:border-sky hover:text-sky"
                            type="button"
                            onClick={handlePolishMemory}
                            disabled={polishing}
                          >
                            重新润色
                          </button>
                          <button
                            className="rounded-[6px] px-3 py-1.5 text-xs font-semibold text-ink/52 transition hover:bg-dim/28"
                            type="button"
                            onClick={() => {
                              setPolishSuggestion("");
                              setPolishError("");
                            }}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                    {polishError && <p className="text-xs text-bloom">{polishError}</p>}
                  </div>

                  <div>
                    <span className="text-xs font-medium text-ink/70">照片</span>
                    <input
                      ref={fileInputRef}
                      className="hidden"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePickFile}
                    />
                    <button
                      className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-[6px] border border-dashed border-dim bg-cream px-3 py-3 text-sm text-ink/70 transition hover:border-bloom hover:text-bloom"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {photoDrafts.length > 0 ? (
                        <span className="relative w-full">
                          <span className="grid grid-cols-4 gap-2">
                            {photoDrafts.slice(0, 8).map((photo, index) => (
                              <span
                                key={`${photo.previewUrl}-${index}`}
                                className="relative aspect-square overflow-hidden rounded-[4px] bg-mist"
                              >
                                <LocalPrivacyImg
                                  className="pixelated h-full w-full object-cover"
                                  src={photo.previewUrl}
                                  alt={photo.name || `照片预览 ${index + 1}`}
                                />
                              </span>
                            ))}
                          </span>
                          <span className="mt-2 block text-xs text-ink/58">
                            已选择 {photoDrafts.length} 张
                          </span>
                        </span>
                      ) : (
                        <>
                          <ImagePlus className="h-4 w-4" />
                          选择本地图片，可多选
                        </>
                      )}
                    </button>
                    {photoError && (
                      <span className="mt-1.5 block text-xs text-bloom">{photoError}</span>
                    )}
                  </div>
                </>
              )}

              {canAnnotate && (
                <label className="block">
                  <span className="text-xs font-medium text-ink/70">补充回忆</span>
                  <textarea
                    className="mt-1.5 w-full resize-none rounded-[6px] border border-dim bg-cream px-3 py-2 text-sm leading-6 text-ink placeholder:text-ink/40 outline-none transition focus:border-bloom"
                    rows={4}
                    value={partnerNote}
                    onChange={(event) => setPartnerNote(event.target.value)}
                    placeholder="留给另一个人的一句补充..."
                    maxLength={500}
                  />
                </label>
              )}

              <div className="sticky bottom-0 -mx-5 flex items-center gap-2 border-t border-dim/70 bg-cream/96 px-5 pb-1 pt-3 shadow-[0_-10px_18px_rgba(250,251,247,0.88)] backdrop-blur">
                <button
                  className="flex-1 rounded-[6px] bg-sakura px-3 py-2 text-sm font-medium text-bloom transition hover:bg-bloom hover:text-cream disabled:cursor-not-allowed disabled:opacity-45"
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave}
                >
                  {isSaving ? "保存中" : canAnnotate ? "保存补充" : isEditing ? "保存修改" : "保存回忆"}
                </button>
                <button
                  className="rounded-[6px] px-3 py-2 text-sm text-ink/62 transition hover:bg-dim/28 hover:text-ink"
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    resetForm(true);
                    setFormOpen(false);
                  }}
                >
                  取消
                </button>
              </div>
              {saveError && <p className="text-xs text-bloom">{saveError}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {confirmDialog}
    </motion.article>
  );
}
