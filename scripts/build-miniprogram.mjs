import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptsDir);
const distDir = join(repoRoot, "apps", "miniprogram", "dist");
const apiBaseUrl = process.env.TARO_APP_API_BASE_URL?.trim();

function fail(message) {
  console.error(`Mini program build blocked: ${message}`);
  process.exit(1);
}

if (!apiBaseUrl) {
  fail("TARO_APP_API_BASE_URL is required (for example https://example.com/api/v1).");
}

let parsedUrl;
try {
  parsedUrl = new URL(apiBaseUrl);
} catch {
  fail(`invalid TARO_APP_API_BASE_URL: ${apiBaseUrl}`);
}

if (parsedUrl.protocol !== "https:") {
  fail("production API must use HTTPS.");
}

if (["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)) {
  fail("production API cannot point to localhost.");
}

if (!parsedUrl.pathname.replace(/\/$/, "").endsWith("/api/v1")) {
  fail("production API must include the /api/v1 path.");
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const build = spawn(
  npmCommand,
  ["run", "build:weapp:raw", "--workspace", "@map-of-us/miniprogram"],
  {
    cwd: repoRoot,
    env: { ...process.env, TARO_APP_API_BASE_URL: apiBaseUrl },
    stdio: "inherit",
  },
);

const exitCode = await new Promise((resolve, reject) => {
  build.on("error", reject);
  build.on("exit", (code) => resolve(code ?? 1));
});

if (exitCode !== 0) process.exit(exitCode);

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  }));
  return files.flat();
}

const files = await javascriptFiles(distDir);
if (files.length === 0) fail("build produced no JavaScript files.");

let containsConfiguredApi = false;
const localhostFiles = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  if (source.includes(apiBaseUrl)) containsConfiguredApi = true;
  if (/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/api\/v1/i.test(source)) {
    localhostFiles.push(relative(repoRoot, file));
  }
}

if (!containsConfiguredApi) {
  fail(`compiled output does not contain ${apiBaseUrl}.`);
}

if (localhostFiles.length > 0) {
  fail(`compiled output still contains a localhost API in ${localhostFiles.join(", ")}.`);
}

console.log(`Verified mini program API: ${apiBaseUrl}`);
