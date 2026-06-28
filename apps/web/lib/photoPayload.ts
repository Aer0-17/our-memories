export type PhotoPayload = {
  url: string;
  key: string;
  mimeType: string;
  width?: number;
  height?: number;
};

type UploadedPhotoPayloadSource = {
  url: string;
  key: string;
  mimeType: string;
  width: number;
  height: number;
};

/** 照片 URL 数组转为后端 API 所需的 photo payload（过滤空值，补默认 key/mime）。 */
export function photoPayload(photos: string[]): PhotoPayload[] {
  return photos
    .filter(Boolean)
    .map((url) => ({ url, key: "", mimeType: "image/jpeg" }));
}

/** 上传结果转为后端 API 所需的 photo payload，保留对象 key、尺寸和 MIME 元数据。 */
export function uploadedPhotosPayload(photos: UploadedPhotoPayloadSource[]): PhotoPayload[] {
  return photos
    .filter((photo) => Boolean(photo.url))
    .map((photo) => ({
      url: photo.url,
      key: photo.key,
      mimeType: photo.mimeType || "image/jpeg",
      width: photo.width,
      height: photo.height,
    }));
}

/** photoPayload 的别名，供回忆相关页面使用（语义等价）。 */
export const memoryPhotosPayload = photoPayload;
