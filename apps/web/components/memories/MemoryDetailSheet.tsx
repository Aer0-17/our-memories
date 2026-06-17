"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Pencil } from "lucide-react";
import { featureOfProvince, makePath, makeProjectionForProvince } from "@/lib/geo";
import type { City } from "@/data/cities";
import { provinces } from "@/data/provinces";
import type { Memory } from "@/data/memories";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { MemoryContentView } from "@/components/memories/MemoryContentView";
import { useContentEditAccess, useMemoryEditAccess } from "@/lib/useContentEditAccess";

type MemoryDetailSheetProps = {
  open: boolean;
  onClose: () => void;
  memory: Memory | null;
  city?: City;
  onUpdatePartnerNote?: (memory: Memory, partnerNote: string) => Promise<void>;
};

const MINI_MAP_WIDTH = 320;
const MINI_MAP_HEIGHT = 180;

/**
 * 移动端回忆详情抽屉：原地展开（不跳转），含迷你地图定位 + 回忆阅读视图。
 * 替代「点击卡片跳转到省份地图浮动卡片」这一不手机友好的旧交互。
 */
export function MemoryDetailSheet({
  open,
  onClose,
  memory,
  city,
  onUpdatePartnerNote,
}: Readonly<MemoryDetailSheetProps>) {
  const canUseEditSurface = useContentEditAccess();
  const access = useMemoryEditAccess(memory);
  const canAddNote = Boolean(canUseEditSurface && access.canAddNote && !access.canEdit && memory && onUpdatePartnerNote);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!open) {
        setNoteOpen(false);
        setNoteError("");
        return;
      }
      setNote(memory?.partnerNote ?? "");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [memory, open]);

  const province = useMemo(
    () => (city ? provinces.find((item) => item.id === city.provinceId) : undefined),
    [city],
  );

  // 迷你地图：省份轮廓 + 高亮该城市点（同一投影）。
  const miniMap = useMemo(() => {
    if (!city || !province) return null;
    const feature = featureOfProvince(province.id);
    const projection = makeProjectionForProvince(province.id, MINI_MAP_WIDTH, MINI_MAP_HEIGHT, 24);
    const pathBuilder = makePath(projection);
    const outlineD = feature ? pathBuilder(feature as never) : "";
    const point = projection([city.lng, city.lat]);
    if (!point) return null;
    return { outlineD, point };
  }, [city, province]);

  const provinceHref = city ? `/province/${city.provinceId}?city=${memory?.cityId ?? city.id}` : "/map";
  const trimmedNote = note.trim();
  const canSaveNote = canAddNote && trimmedNote.length > 0 && trimmedNote !== (memory?.partnerNote ?? "").trim() && !savingNote;

  const handleSaveNote = async () => {
    if (!memory || !onUpdatePartnerNote || !canSaveNote) return;
    setSavingNote(true);
    setNoteError("");
    try {
      await onUpdatePartnerNote(memory, trimmedNote);
      setNoteOpen(false);
    } catch {
      setNoteError("批注保存失败，请稍后再试");
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      snapPoints={[0.5, 0.92]}
      initialSnap={0}
      header={
        memory ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-[#5A6670]">
                {memory.title || memory.city}
              </h2>
              <p className="mt-0.5 text-xs font-medium text-[#5A6670]/52">
                {[memory.city, memory.date].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        ) : null
      }
    >
      {memory && (
        <div className="space-y-4 pb-2">
          {/* 迷你地图定位 */}
          {miniMap && (
            <div className="overflow-hidden rounded-[10px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/72">
              <svg viewBox={`0 0 ${MINI_MAP_WIDTH} ${MINI_MAP_HEIGHT}`} className="h-auto w-full" role="img" aria-label={`${memory.city} 在${province?.name ?? ""}的位置`}>
                {miniMap.outlineD && (
                  <path
                    d={miniMap.outlineD}
                    fill={"#F5DCE0"}
                    fillOpacity={0.32}
                    stroke={"#E8B8C2"}
                    strokeOpacity={0.7}
                    strokeWidth={1.4}
                    strokeLinejoin="round"
                  />
                )}
                <circle cx={miniMap.point[0]} cy={miniMap.point[1]} r={14} fill={"#E8B8C2"} fillOpacity={0.28} />
                <circle cx={miniMap.point[0]} cy={miniMap.point[1]} r={5} fill={"#E8B8C2"} stroke={"#FAFBF7"} strokeWidth={2} />
              </svg>
            </div>
          )}

          <MemoryContentView memory={memory} cityName={city?.name} />

          {canAddNote && (
            <div className="rounded-[7px] border border-[#F5DCE0]/70 bg-[#FAFBF7]/72 p-3">
              <button
                className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-[#E8B8C2]"
                type="button"
                onClick={() => setNoteOpen((value) => !value)}
              >
                <span>{memory.partnerNote ? "修改批注" : "加批注"}</span>
                <Pencil className="h-4 w-4" />
              </button>
              {noteOpen && (
                <div className="mt-3 space-y-2">
                  <textarea
                    className="min-h-[88px] w-full resize-none rounded-[6px] border border-[#D8DDD8] bg-white/70 px-3 py-2 text-sm leading-6 text-[#5A6670] outline-none transition focus:border-[#E8B8C2]"
                    value={note}
                    onChange={(event) => {
                      setNote(event.target.value);
                      setNoteError("");
                    }}
                    maxLength={500}
                    placeholder="写给对方的一句补充..."
                  />
                  {noteError && <p className="text-xs font-semibold text-[#D86F82]">{noteError}</p>}
                  <div className="flex items-center gap-2">
                    <button
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-[6px] bg-[#F5DCE0] px-3 text-sm font-semibold text-[#E8B8C2] transition hover:bg-[#E8B8C2] hover:text-[#FAFBF7] disabled:cursor-not-allowed disabled:opacity-45"
                      type="button"
                      onClick={handleSaveNote}
                      disabled={!canSaveNote}
                    >
                      {savingNote && <Loader2 className="h-4 w-4 animate-spin" />}
                      {savingNote ? "保存中" : "保存批注"}
                    </button>
                    <button
                      className="min-h-9 rounded-[6px] px-3 text-sm font-semibold text-[#5A6670]/58 transition hover:bg-[#D8DDD8]/28"
                      type="button"
                      onClick={() => {
                        setNote(memory.partnerNote ?? "");
                        setNoteOpen(false);
                        setNoteError("");
                      }}
                      disabled={savingNote}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 去地图编辑/查看入口 */}
          <Link
            className="flex items-center justify-center gap-1.5 rounded-[8px] border border-[#A8C8DC] bg-[#D6E8F0]/30 px-3 py-2.5 text-sm font-semibold text-[#A8C8DC] transition hover:bg-[#D6E8F0]/55"
            href={provinceHref}
            onClick={onClose}
          >
            <MapPin className="h-4 w-4" />
            去地图查看 / 编辑
          </Link>
        </div>
      )}
    </BottomSheet>
  );
}
