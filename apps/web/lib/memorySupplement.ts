import type { Memory } from "@/data/memories";
import { readSession } from "@/lib/authStore";

export function memorySupplementLabel(
  memory: Pick<Memory, "partnerNoteAuthorId">,
  currentUserId = readSession()?.user?.id,
) {
  if (!memory.partnerNoteAuthorId) return "补充回忆";
  return memory.partnerNoteAuthorId === currentUserId ? "我的补充" : "达令的补充";
}
