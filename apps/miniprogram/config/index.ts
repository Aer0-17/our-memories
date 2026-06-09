import { defineConfig, type UserConfigExport } from "@tarojs/cli";

export default defineConfig(async () => {
  const config: UserConfigExport = {
    projectName: "our-memories-miniprogram",
    date: "2026-06-09",
    designWidth: 375,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      828: 1.81 / 2,
    },
    sourceRoot: "src",
    outputRoot: "dist",
    framework: "react",
    compiler: "webpack5",
    plugins: ["@tarojs/plugin-platform-weapp"],
    defineConstants: {},
    mini: {},
    h5: {
      publicPath: "/",
      staticDirectory: "static",
    },
  };

  return config;
});
