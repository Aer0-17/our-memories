"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** 全局错误边界：捕获子树渲染/数据错误，避免白屏。 */
export default function ErrorBoundary({
  error,
  unstable_retry,
}: Readonly<{
  error: Error & { digest?: string };
  unstable_retry: () => void;
}>) {
  useEffect(() => {
    console.error("[Our Memories] 页面错误:", error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-4 py-12">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-[8px] border border-sakura bg-sakura/42 text-rose-ink">
          <span className="text-2xl">!</span>
        </div>
        <h2 className="mt-4 text-xl font-semibold text-ink">出错了</h2>
        <p className="mt-3 text-sm leading-7 text-ink/60">
          页面加载时遇到问题。可以尝试重新加载，若问题持续请返回首页。
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="ghost" onClick={() => window.location.assign("/")}>
            返回首页
          </Button>
          <Button variant="primary" onClick={unstable_retry}>
            重试
          </Button>
        </div>
      </div>
    </div>
  );
}
