/**
 * 判断 URL 是否为浏览器端可直接渲染的图片源
 *（data URL / https URL / blob URL），用于决定走原生 <img> 还是 next/image。
 * 作为类型守卫，收窄后 url 为 string。
 */
export function isBrowserImageUrl(url?: string | null): url is string {
  return (
    typeof url === "string" &&
    (url.startsWith("data:image/") ||
      url.startsWith("https://") ||
      url.startsWith("blob:"))
  );
}
