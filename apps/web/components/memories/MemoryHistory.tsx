"use client";

import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { City } from "@/data/cities";
import type { Memory } from "@/data/memories";
import { photosOfMemory } from "@/components/memories/MemoryContentView";
import { MobileMemoryImage } from "@/components/memories/MobileMemoryImage";
import { memorySupplementLabel } from "@/lib/memorySupplement";
import { computeMemoryEditAccess } from "@/lib/useContentEditAccess";

export function MemoryHistory({
  city,
  memories,
  localMemoryIds,
  isAdmin,
  annotatingMemoryId,
  deletingMemoryId,
  deleteError,
  onEdit,
  onAnnotate,
  onDelete,
  renderNoteEditor,
}: Readonly<{
  city: City;
  memories: Memory[];
  localMemoryIds: Set<string>;
  isAdmin: boolean;
  annotatingMemoryId: string | null;
  deletingMemoryId: string;
  deleteError: string;
  onEdit: (record: Memory) => void;
  onAnnotate: (record: Memory) => void;
  onDelete: (record: Memory) => void;
  renderNoteEditor: (record: Memory) => ReactNode;
}>) {
  if (memories.length === 0) {
    return (
      <p className="rounded-[7px] border border-dashed border-dim px-4 py-6 text-center text-sm text-ink/56">
        还没有历史记录。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {memories.map((record, recordIndex) => {
        const recordPhotos = photosOfMemory(record);
        const editable = localMemoryIds.has(record.id);
        const recordAccess = computeMemoryEditAccess(record);
        const canEditRecord = editable && isAdmin && recordAccess.canEdit;
        const canAnnotateRecord = editable && isAdmin && recordAccess.canAddNote && !recordAccess.canEdit;

        return (
          <article
            key={record.id}
            className="rounded-[8px] border border-dim/70 bg-cream/72 p-3"
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
                    {(canEditRecord || canAnnotateRecord) && (
                      <button
                        className="grid h-7 w-7 place-items-center rounded-[5px] text-ink/50 transition hover:bg-mist/34 hover:text-sky"
                        type="button"
                        onClick={() => {
                          if (canEditRecord) onEdit(record);
                          else onAnnotate(record);
                        }}
                        aria-label={
                          canEditRecord
                            ? `编辑 ${record.city} ${record.date} 回忆`
                            : `给 ${record.city} ${record.date} 回忆添加补充`
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canEditRecord && (
                      <button
                        className="grid h-7 w-7 place-items-center rounded-[5px] text-ink/46 transition hover:bg-sakura/46 hover:text-bloom disabled:opacity-40"
                        type="button"
                        onClick={() => onDelete(record)}
                        disabled={deletingMemoryId === record.id}
                        aria-label={`删除 ${record.city} ${record.date} 回忆`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
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
                    key={`${record.id}-mobile-history-tag-${tag}`}
                    className="rounded-full bg-cream/80 px-2 py-0.5 text-[10px] font-semibold text-ink/46"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            {recordPhotos.length > 0 && (
              <div className="mt-3 grid grid-cols-5 gap-1.5">
                {recordPhotos.slice(0, 10).map((photo, photoIndex) => (
                  <span
                    key={`${record.id}-mobile-history-photo-${photoIndex}`}
                    className="relative aspect-square overflow-hidden rounded-[4px] border border-dim bg-mist"
                  >
                    <MobileMemoryImage src={photo} alt={`${city.name} history photo ${photoIndex + 1}`} fit="cover" />
                  </span>
                ))}
              </div>
            )}
            {record.partnerNote && (
              <div className="mt-3 rounded-[7px] border border-sakura/70 bg-sakura/24 px-3 py-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-bloom/80">
                  {memorySupplementLabel(record)}
                </p>
                <p className="text-xs leading-5 text-ink/70">{record.partnerNote}</p>
              </div>
            )}
            {annotatingMemoryId === record.id && <div className="mt-3">{renderNoteEditor(record)}</div>}
          </article>
        );
      })}
      {deleteError && <p className="text-xs text-bloom">{deleteError}</p>}
    </div>
  );
}
