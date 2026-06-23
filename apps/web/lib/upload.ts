import { apiFetch, apiJson } from "@/lib/apiClient";

export type UploadedImage = {
  url: string;
  key: string;
  mimeType: string;
  width: number;
  height: number;
};

type PresignResponse = {
  key: string;
  uploadUrl: string;
  publicUrl: string;
};

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 压缩后硬上限，挡住超大文件

const loadImageFile = (file: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.addEventListener(
      "load",
      () => {
        URL.revokeObjectURL(imageUrl);
        resolve(image);
      },
      { once: true },
    );
    image.addEventListener(
      "error",
      () => {
        URL.revokeObjectURL(imageUrl);
        reject(new Error("Image load failed"));
      },
      { once: true },
    );
    image.src = imageUrl;
  });

type CompressedImage = { blob: Blob; width: number; height: number; contentType: string };

function readThemeColor(token: string) {
  return window.getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim();
}

// 把图片压成 JPEG（svg 直接透传），返回 blob + 尺寸 + contentType。
async function compressImage(file: File): Promise<CompressedImage> {
  if (file.type === "image/svg+xml") {
    return { blob: file, width: 0, height: 0, contentType: file.type };
  }

  const image = await loadImageFile(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return { blob: file, width, height, contentType: file.type || "image/jpeg" };

  context.fillStyle = readThemeColor("cream") || "white";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });

  if (!blob) return { blob: file, width, height, contentType: file.type || "image/jpeg" };
  return { blob, width, height, contentType: "image/jpeg" };
}

/**
 * 统一图片上传：压缩 → 向后端取预签名 PUT URL → 直传 OSS。
 * 失败时抛出错误，由调用方用 toast/status 提示用户，避免静默保存大体积 data URL。
 */
export async function uploadImage(file: File, folder: string): Promise<UploadedImage> {
  const { blob, width, height, contentType } = await compressImage(file);

  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error("图片过大，请压缩后再上传");
  }

  try {
    const presign = await apiJson<PresignResponse>("/api/v1/upload/presign", {
      method: "POST",
      body: JSON.stringify({ folder, contentType }),
    });

    const put = await fetch(presign.uploadUrl, {
      method: "PUT",
      body: blob,
      headers: { "Content-Type": contentType },
    });
    if (!put.ok) throw new Error(`OSS upload failed (${put.status})`);

    return { url: presign.publicUrl, key: presign.key, mimeType: contentType, width, height };
  } catch (error) {
    console.warn("Direct image upload failed.", error);
    throw error instanceof Error ? error : new Error("图片上传失败，请稍后再试");
  }
}

/** 批量上传，保留顺序。 */
export function uploadImages(files: File[], folder: string): Promise<UploadedImage[]> {
  return Promise.all(files.map((file) => uploadImage(file, folder)));
}

/** 保存失败时回滚：删除已直传的对象（base64 回退无 key，自动跳过）。 */
export async function deleteUploaded(keys: string[]): Promise<void> {
  await Promise.all(
    keys
      .filter(Boolean)
      .map((key) =>
        apiFetch(`/api/v1/upload?key=${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => null),
      ),
  );
}
