import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.replace(/\/$/, "");

const config: CapacitorConfig = {
  appId: "com.ourmemories.mobile",
  appName: "回忆地图",
  webDir: "../web/out",
  server: serverUrl
    ? {
        androidScheme: "https",
        // 生产环境使用远程 URL，前端更新无需重新打包 APK。
        url: serverUrl,
        cleartext: serverUrl.startsWith("http://"),
      }
    : {
        androidScheme: "https",
      },
};

export default config;
