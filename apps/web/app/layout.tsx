import type { Metadata } from "next";
import { ApiBaseScript } from "@/app/api-base-script";
import "./globals.css";

export const metadata: Metadata = {
  title: "我们的回忆",
  description: "只属于两个人的私密地图与纪念日墙。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <ApiBaseScript />
        {children}
      </body>
    </html>
  );
}
