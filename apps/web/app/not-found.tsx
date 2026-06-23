import Link from "next/link";
import { Button } from "@/components/ui/button";

/** 404 兜底页。 */
export default function NotFound() {
  return (
    <div className="grid min-h-[80vh] place-items-center px-4 py-12">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-[8px] border border-dim/80 bg-cream/78 text-ink/50">
          <span className="text-2xl">?</span>
        </div>
        <h2 className="mt-4 text-xl font-semibold text-ink">页面不存在</h2>
        <p className="mt-3 text-sm leading-7 text-ink/60">
          你访问的页面可能已移动或从未存在。
        </p>
        <Link href="/" className="mt-6 inline-block">
          <Button variant="primary">返回首页</Button>
        </Link>
      </div>
    </div>
  );
}
