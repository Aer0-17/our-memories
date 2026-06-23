/** 照片 URL 数组转为后端 API 所需的 photo payload（过滤空值，补默认 key/mime）。 */
export function photoPayload(
  photos: string[],
): { url: string; key: string; mimeType: string }[] {
  return photos
    .filter(Boolean)
    .map((url) => ({ url, key: "", mimeType: "image/jpeg" }));
}

/** photoPayload 的别名，供回忆相关页面使用（语义等价）。 */
export const memoryPhotosPayload = photoPayload;
