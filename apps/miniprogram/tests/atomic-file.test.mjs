import assert from "node:assert/strict";
import test from "node:test";
import { replaceTextFileAtomically } from "../src/lib/atomic-file.ts";

function memoryFileSystem(initial = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    operations: {
      async remove(filePath) {
        files.delete(filePath);
      },
      async write(filePath, data) {
        files.set(filePath, data);
      },
      async read(filePath) {
        if (!files.has(filePath)) throw new Error("missing file");
        return files.get(filePath);
      },
      async rename(oldPath, newPath) {
        if (!files.has(oldPath)) throw new Error("missing source");
        files.set(newPath, files.get(oldPath));
        files.delete(oldPath);
      },
    },
  };
}

test("publishes the verified temporary file over the previous backup", async () => {
  const fileSystem = memoryFileSystem({ "/latest": "previous" });

  await replaceTextFileAtomically(
    "/latest",
    "/latest.partial",
    "current",
    fileSystem.operations,
    () => new Error("incomplete"),
  );

  assert.equal(fileSystem.files.get("/latest"), "current");
  assert.equal(fileSystem.files.has("/latest.partial"), false);
});

test("preserves the previous backup when writing is interrupted", async () => {
  const fileSystem = memoryFileSystem({ "/latest": "previous" });
  fileSystem.operations.write = async (filePath) => {
    fileSystem.files.set(filePath, "truncated");
    throw new Error("interrupted");
  };

  await assert.rejects(
    replaceTextFileAtomically(
      "/latest",
      "/latest.partial",
      "current",
      fileSystem.operations,
      () => new Error("incomplete"),
    ),
    /interrupted/,
  );

  assert.equal(fileSystem.files.get("/latest"), "previous");
  assert.equal(fileSystem.files.has("/latest.partial"), false);
});

test("preserves the previous backup when read-back verification fails", async () => {
  const fileSystem = memoryFileSystem({ "/latest": "previous" });
  fileSystem.operations.read = async () => "truncated";

  await assert.rejects(
    replaceTextFileAtomically(
      "/latest",
      "/latest.partial",
      "current",
      fileSystem.operations,
      () => new Error("incomplete"),
    ),
    /incomplete/,
  );

  assert.equal(fileSystem.files.get("/latest"), "previous");
  assert.equal(fileSystem.files.has("/latest.partial"), false);
});
