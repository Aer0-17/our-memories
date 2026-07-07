import type { Metadata } from "next";
import { ApiCacheProvider } from "@/lib/apiCache";
import { AuthProvider } from "@/lib/authContext";
import { AuthenticatedRuntime } from "@/components/AuthenticatedRuntime";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "回忆地图",
  description: "私密地图、回忆相册与纪念日墙。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="antialiased"
    >
      <body className="flex flex-col">
        <ApiCacheProvider>
          <AuthProvider>
            <ToastProvider>
              <AuthenticatedRuntime />
              {children}
            </ToastProvider>
          </AuthProvider>
        </ApiCacheProvider>
      </body>
    </html>
  );
}
