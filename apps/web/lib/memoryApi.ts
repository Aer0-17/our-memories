import type { Memory } from "@/data/memories";
import type { LocalMemoryStore } from "@/data/progress";
import { apiFetch } from "@/lib/apiClient";
import { memoryPhotosPayload, type PhotoPayload } from "@/lib/photoPayload";

export type MemoryPhotoPayload = PhotoPayload;

export type MemoryPatchPayload = Omit<Partial<Memory>, "photos"> & {
  coverImage?: string;
  photos?: MemoryPhotoPayload[];
};

export type MemoryMutationResponse = {
  memory?: Memory;
  memories: LocalMemoryStore;
};

export async function createMemory(
  memory: Memory,
  photos?: MemoryPhotoPayload[],
): Promise<MemoryMutationResponse> {
  const response = await apiFetch("/api/v1/memories", {
    method: "POST",
    body: JSON.stringify({
      ...memory,
      photos: photos ?? memoryPhotosPayload(memory.photos ?? [memory.image]),
    }),
  });

  if (!response.ok) throw new Error("Failed to save memory");
  return (await response.json()) as MemoryMutationResponse;
}

export async function updateMemory(
  memoryId: string,
  patch: MemoryPatchPayload,
): Promise<MemoryMutationResponse> {
  const response = await apiFetch(`/memories/${memoryId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  if (!response.ok) throw new Error("Failed to update memory");
  return (await response.json()) as MemoryMutationResponse;
}

export async function setMemoryCover(
  memoryId: string,
  coverImage: string,
): Promise<MemoryMutationResponse> {
  return updateMemory(memoryId, { coverImage });
}

export async function deleteMemory(memoryId: string): Promise<MemoryMutationResponse> {
  const response = await apiFetch(`/memories/${memoryId}`, {
    method: "DELETE",
  });

  if (!response.ok) throw new Error("Failed to delete memory");
  return (await response.json()) as MemoryMutationResponse;
}
