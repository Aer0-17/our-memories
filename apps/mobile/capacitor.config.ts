import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ourmemories.mobile",
  appName: "我们的回忆",
  webDir: "../web/out",
  server: {
    androidScheme: "https",
    // 生产环境使用远程URL，前端更新无需重新打包APK
    url: process.env.CAPACITOR_SERVER_URL,
    cleartext: true,
  },
};

export default config;
