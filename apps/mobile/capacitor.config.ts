import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ourmemories.mobile",
  appName: "我们的回忆",
  webDir: "../web/out",
  server: {
    androidScheme: "https",
  },
};

export default config;
