import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.replace(/\/$/, "");
const allowHttp =
  process.env.CAPACITOR_ALLOW_HTTP === "1" ||
  process.env.CAPACITOR_ALLOW_HTTP === "true";

if (!serverUrl) {
  console.error("CAPACITOR_SERVER_URL is required, for example:");
  console.error("CAPACITOR_SERVER_URL=https://your-domain.com npm run mobile:android:build:online");
  process.exit(1);
}

if (!/^https:\/\//.test(serverUrl) && !allowHttp) {
  console.error("CAPACITOR_SERVER_URL must be an https URL for a production APK.");
  console.error("For a private HTTP/IP build, set CAPACITOR_ALLOW_HTTP=1 explicitly.");
  process.exit(1);
}

if (!/^https:\/\//.test(serverUrl)) {
  console.warn("Warning: building an HTTP online APK. Use this only for private/internal distribution.");
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const fallbackIndex = resolve("../web/out/index.html");
if (!existsSync(fallbackIndex)) {
  mkdirSync(resolve("../web/out"), { recursive: true });
  writeFileSync(
    fallbackIndex,
    [
      "<!doctype html>",
      '<html lang="zh-CN">',
      "<head>",
      '  <meta charset="utf-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
      "  <title>我们的回忆</title>",
      "</head>",
      "<body>",
      "  <p>请连接网络后重新打开应用。</p>",
      "</body>",
      "</html>",
      "",
    ].join("\n"),
  );
}

run("npx", ["capacitor", "sync", "android"]);
run(process.platform === "win32" ? "gradlew.bat" : "./gradlew", ["assembleDebug"], {
  cwd: "android",
});
