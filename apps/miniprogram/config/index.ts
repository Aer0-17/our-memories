import { defineConfig, type UserConfigExport } from "@tarojs/cli";

declare const process: { env: { TARO_APP_API_BASE_URL?: string } };

export default defineConfig(async () => {
  const apiBaseUrl = process.env.TARO_APP_API_BASE_URL || "http://localhost:8080/api/v1";
  const config: UserConfigExport = {
    projectName: "our-memories-miniprogram",
    date: "2026-06-09",
    designWidth: 375,
    deviceRatio: {
      375: 2,
      640: 2.34 / 2,
      750: 1,
      828: 1.81 / 2,
    },
    sourceRoot: "src",
    outputRoot: "dist",
    framework: "react",
    compiler: "webpack5",
    plugins: ["@tarojs/plugin-platform-weapp"],
    defineConstants: {
      "process.env.TARO_APP_API_BASE_URL": JSON.stringify(apiBaseUrl),
    },
    mini: {},
    h5: {
      publicPath: "/",
      staticDirectory: "static",
    },
  };

  return config;
});
