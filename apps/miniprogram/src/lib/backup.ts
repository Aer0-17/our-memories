import Taro from "@tarojs/taro";
import type {
  BackupMediaReference,
  BackupPayload,
  BackupRow,
  Session,
} from "./api";

export const backupFormat = "our-memories-backup";
export const backupVersion = 1;
export const backupMaxBytes = 8 * 1024 * 1024;

const storedBackupKey = "our-memories:last-local-backup";
const managedBackupFileName = "our-memories-latest.json.txt";
const legacyManagedBackupFileName = "our-memories-latest.json";
const temporaryShareFileName = "our-memories-share.json.txt";

const directSpaceTables = [
  "users",
  "couple_questions",
  "memories",
  "anniversary_cards",
  "settings",
  "auxiliary_items",
  "whispers",
  "time_capsules",
  "orders",
] as const;

const relationshipTables = [
  { child: "couple_question_answers", foreignKey: "question_id", parent: "couple_questions" },
  { child: "memory_photos", foreignKey: "memory_id", parent: "memories" },
  { child: "anniversary_photos", foreignKey: "anniversary_card_id", parent: "anniversary_cards" },
  { child: "whisper_replies", foreignKey: "whisper_id", parent: "whispers" },
  { child: "time_capsule_photos", foreignKey: "time_capsule_id", parent: "time_capsules" },
] as const;

export type StoredBackupFile = {
  filePath: string;
  fileName: string;
  createdAt: string;
  exportedAt: string;
  sourceSpaceId: string;
  sourceName: string;
  kind: "manual" | "rollback";
  size: number;
  recordCount: number;
  mediaCount: number;
};

export type SelectedBackupFile = {
  filePath: string;
  fileName: string;
  size: number;
  text: string;
};

export type BackupPreview = {
  payload: BackupPayload;
  filePath: string;
  fileName: string;
  fileSize: number;
  exportedAt: string;
  sourceName: string;
  sourceSpaceCode: string;
  recordCount: number;
  memberCount: number;
  memoryCount: number;
  conversationCount: number;
  capsuleCount: number;
  anniversaryCount: number;
  otherCount: number;
  mediaCount: number;
};

export class BackupFileError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(row: Record<string, unknown>, key: string, message: string) {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) throw new BackupFileError(message);
  return value;
}

function optionalString(row: Record<string, unknown>, key: string, message: string) {
  const value = row[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new BackupFileError(message);
  return value;
}

function tableRows(tables: Record<string, BackupRow[]>, tableName: string) {
  return tables[tableName] || [];
}

function rowIds(tables: Record<string, BackupRow[]>, tableName: string) {
  return new Set(
    tableRows(tables, tableName).flatMap((row) => {
      const id = row.id;
      return typeof id === "string" && id ? [id] : [];
    }),
  );
}

function validateSpaceRows(tables: Record<string, BackupRow[]>, spaceId: string) {
  for (const tableName of directSpaceTables) {
    for (const row of tableRows(tables, tableName)) {
      if (row.space_id !== spaceId) {
        throw new BackupFileError(`备份中的 ${tableName} 不属于当前空间，已停止恢复。`);
      }
    }
  }

  if (tableRows(tables, "users").length === 0) {
    throw new BackupFileError("备份缺少成员信息，不能安全恢复。");
  }

  for (const relation of relationshipTables) {
    const parentIds = rowIds(tables, relation.parent);
    for (const row of tableRows(tables, relation.child)) {
      const foreignId = row[relation.foreignKey];
      if (typeof foreignId !== "string" || !parentIds.has(foreignId)) {
        throw new BackupFileError(`备份中的 ${relation.child} 关系不完整，已停止恢复。`);
      }
    }
  }
}

function normalizeMedia(value: unknown): BackupMediaReference[] {
  if (!Array.isArray(value)) throw new BackupFileError("备份缺少媒体引用清单。");
  return value.map((item) => {
    if (!isObject(item)) throw new BackupFileError("备份中的媒体引用格式不正确。");
    return {
      kind: requiredString(item, "kind", "备份中的媒体类型不正确。"),
      parentId: optionalString(item, "parentId", "备份中的媒体关联信息不正确。"),
      id: optionalString(item, "id", "备份中的媒体编号不正确。"),
      key: optionalString(item, "key", "备份中的媒体对象键不正确。"),
      url: optionalString(item, "url", "备份中的媒体地址不正确。"),
      mimeType: optionalString(item, "mimeType", "备份中的媒体格式不正确。"),
    };
  });
}

function normalizeTables(value: unknown): Record<string, BackupRow[]> {
  if (!isObject(value)) throw new BackupFileError("备份缺少数据表内容。");
  const tables: Record<string, BackupRow[]> = {};
  for (const [tableName, rows] of Object.entries(value)) {
    if (!Array.isArray(rows) || !rows.every(isObject)) {
      throw new BackupFileError(`备份中的 ${tableName} 数据格式不正确。`);
    }
    tables[tableName] = rows;
  }
  return tables;
}

function recordCount(tables: Record<string, BackupRow[]>) {
  return Object.values(tables).reduce((total, rows) => total + rows.length, 0);
}

function safeFilePart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "space";
}

function backupTimestamp(value: string) {
  const date = new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return safeDate.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function utf8ByteLength(value: string) {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) length += 1;
    else if (code < 0x800) length += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      length += 4;
      index += 1;
    } else length += 3;
  }
  return length;
}

function writeTextFile(filePath: string, data: string) {
  return new Promise<void>((resolve, reject) => {
    Taro.getFileSystemManager().writeFile({
      filePath,
      data,
      encoding: "utf8",
      success: () => resolve(),
      fail: reject,
    });
  });
}

function rawErrorMessage(error: unknown) {
  if (isObject(error) && typeof error.errMsg === "string") return error.errMsg;
  if (error instanceof Error) return error.message;
  return String(error || "");
}

function readTextFile(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      encoding: "utf8",
      success: (result) => {
        if (typeof result.data === "string") resolve(result.data);
        else reject(new BackupFileError("无法读取这份备份文件。"));
      },
      fail: reject,
    });
  });
}

function managedStoredBackup() {
  const stored = Taro.getStorageSync<StoredBackupFile | "">(storedBackupKey);
  const userDataPath = Taro.env.USER_DATA_PATH;
  if (
    !stored ||
    !userDataPath ||
    typeof stored.filePath !== "string" ||
    typeof stored.fileName !== "string" ||
    !stored.filePath.startsWith(`${userDataPath}/`)
  ) {
    return null;
  }
  return stored;
}

function unlinkManagedFile(filePath: string) {
  return new Promise<void>((resolve, reject) => {
    Taro.getFileSystemManager().unlink({
      filePath,
      success: () => resolve(),
      fail: (error) => {
        if (error.errMsg.toLowerCase().includes("no such file")) resolve();
        else reject(error);
      },
    });
  });
}

export function parseBackupFile(file: SelectedBackupFile, session: Session): BackupPreview {
  if (file.size > backupMaxBytes) {
    throw new BackupFileError("备份超过 8 MB，请改用网页端或服务器恢复。");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text) as unknown;
  } catch {
    throw new BackupFileError("这不是有效的 JSON 备份文件。");
  }
  if (!isObject(parsed)) throw new BackupFileError("备份文件的顶层格式不正确。");
  if (parsed.format !== backupFormat || parsed.version !== backupVersion) {
    throw new BackupFileError("备份格式或版本不受支持。");
  }
  if (!isObject(parsed.source) || !isObject(parsed.space)) {
    throw new BackupFileError("备份缺少空间信息。");
  }

  const sourceSpaceId = requiredString(parsed.source, "spaceId", "备份缺少空间编号。");
  const sourceSpaceCode = requiredString(parsed.source, "spaceCode", "备份缺少空间码。");
  const sourceName = requiredString(parsed.source, "name", "备份缺少空间名称。");
  const spaceId = requiredString(parsed.space, "id", "备份中的空间编号无效。");
  const spaceCode = requiredString(parsed.space, "space_code", "备份中的空间码无效。");
  requiredString(parsed.space, "name", "备份中的空间名称无效。");
  requiredString(parsed.space, "password_hash", "备份缺少登录凭据摘要，不能安全恢复。");

  if (
    sourceSpaceId !== session.space.id ||
    spaceId !== session.space.id ||
    sourceSpaceCode !== session.space.spaceCode ||
    spaceCode !== session.space.spaceCode
  ) {
    throw new BackupFileError("只能恢复当前空间自己导出的备份。");
  }

  const exportedAt = typeof parsed.exportedAt === "string" ? parsed.exportedAt : "";
  if (!exportedAt || Number.isNaN(new Date(exportedAt).getTime())) {
    throw new BackupFileError("备份导出时间无效。");
  }

  const tables = normalizeTables(parsed.tables);
  validateSpaceRows(tables, session.space.id);
  const media = normalizeMedia(parsed.media);
  const payload: BackupPayload = {
    format: backupFormat,
    version: backupVersion,
    exportedAt,
    source: { spaceId: sourceSpaceId, spaceCode: sourceSpaceCode, name: sourceName },
    space: parsed.space,
    tables,
    media,
  };

  return {
    payload,
    filePath: file.filePath,
    fileName: file.fileName,
    fileSize: file.size,
    exportedAt,
    sourceName,
    sourceSpaceCode,
    recordCount: recordCount(tables),
    memberCount: tableRows(tables, "users").length,
    memoryCount: tableRows(tables, "memories").length,
    conversationCount:
      tableRows(tables, "whispers").length + tableRows(tables, "whisper_replies").length,
    capsuleCount: tableRows(tables, "time_capsules").length,
    anniversaryCount: tableRows(tables, "anniversary_cards").length,
    otherCount:
      tableRows(tables, "auxiliary_items").length +
      tableRows(tables, "couple_questions").length +
      tableRows(tables, "couple_question_answers").length,
    mediaCount: media.length,
  };
}

export async function chooseBackupFile(): Promise<SelectedBackupFile> {
  if (!Taro.canIUse("chooseMessageFile")) {
    throw new BackupFileError("当前微信版本不支持选择备份文件，请升级微信后再试。");
  }
  const result = await Taro.chooseMessageFile({
    count: 1,
    type: "file",
    extension: ["json", "txt"],
  });
  const file = result.tempFiles[0];
  if (!file) throw new BackupFileError("没有读取到备份文件。");
  if (!/\.(json|txt)$/i.test(file.name)) {
    throw new BackupFileError("请选择 .json 或 .txt 备份文件。");
  }
  if (file.size > backupMaxBytes) {
    throw new BackupFileError("备份超过 8 MB，请改用网页端或服务器恢复。");
  }
  return {
    filePath: file.path,
    fileName: file.name,
    size: file.size,
    text: await readTextFile(file.path),
  };
}

export async function writeBackupFile(payload: BackupPayload, kind: StoredBackupFile["kind"]) {
  const data = JSON.stringify(payload);
  const size = utf8ByteLength(data);
  if (size > backupMaxBytes) {
    throw new BackupFileError("数据库备份超过 8 MB，请改用网页端或服务器备份与恢复。");
  }
  const suffix = kind === "rollback" ? "before-restore-" : "";
  // JSON text is shared with a .txt suffix because some WeChat clients reject
  // application-specific extensions even though shareFileMessage accepts local paths.
  const fileName = `our-memories-${safeFilePart(payload.source.spaceCode)}-${suffix}${backupTimestamp(payload.exportedAt)}.json.txt`;
  const userDataPath = Taro.env.USER_DATA_PATH;
  if (!userDataPath) throw new BackupFileError("当前微信环境无法保存备份文件。");
  // A fixed managed path means a new export replaces the previous local copy
  // instead of leaving invisible, unencrypted backup files behind.
  const filePath = `${userDataPath}/${managedBackupFileName}`;
  await writeTextFile(filePath, data);

  // 0.32.0 used a .json-only managed path. Remove it after the compatible file
  // has been written so upgrades still keep only one unencrypted local backup.
  const legacyFilePath = `${userDataPath}/${legacyManagedBackupFileName}`;
  if (legacyFilePath !== filePath) {
    await unlinkManagedFile(legacyFilePath).catch(() => undefined);
  }

  const stored: StoredBackupFile = {
    filePath,
    fileName,
    createdAt: new Date().toISOString(),
    exportedAt: payload.exportedAt,
    sourceSpaceId: payload.source.spaceId,
    sourceName: payload.source.name,
    kind,
    size,
    recordCount: recordCount(payload.tables),
    mediaCount: payload.media.length,
  };
  Taro.setStorageSync(storedBackupKey, stored);
  return stored;
}

export function readStoredBackup(session: Session | null) {
  if (!session) return null;
  const stored = managedStoredBackup();
  if (
    !stored ||
    typeof stored.filePath !== "string" ||
    typeof stored.fileName !== "string" ||
    typeof stored.createdAt !== "string" ||
    typeof stored.exportedAt !== "string" ||
    typeof stored.sourceName !== "string" ||
    (stored.kind !== "manual" && stored.kind !== "rollback") ||
    typeof stored.size !== "number" ||
    typeof stored.recordCount !== "number" ||
    typeof stored.mediaCount !== "number" ||
    stored.sourceSpaceId !== session.space.id ||
    !stored.filePath.startsWith(`${Taro.env.USER_DATA_PATH}/`)
  ) {
    return null;
  }
  return stored;
}

export async function deleteStoredBackup(file: StoredBackupFile) {
  const current = managedStoredBackup();
  await unlinkManagedFile(file.filePath);
  if (current?.filePath === file.filePath) Taro.removeStorageSync(storedBackupKey);
}

function shareError(error: unknown) {
  const rawMessage = rawErrorMessage(error).trim();
  const message = rawMessage.toLowerCase();

  if (message.includes("no such file") || message.includes("not found")) {
    return new BackupFileError("本机备份文件已经失效，请重新生成一份后分享。");
  }
  if (message.includes("permission") || message.includes("auth deny") || message.includes("authorize")) {
    return new BackupFileError("微信没有允许分享这个文件，请检查微信和系统权限后再试。");
  }
  if (message.includes("too large") || message.includes("exceed") || message.includes("size limit")) {
    return new BackupFileError("微信认为备份文件过大，文件仍保存在本机，可改用电脑端导出。");
  }
  if (message.includes("not support") || message.includes("unsupported")) {
    return new BackupFileError("当前微信或系统暂不支持文件分享，请升级微信后再试。");
  }
  if (message.includes("invalid file") || message.includes("file type")) {
    return new BackupFileError("当前微信仍无法识别这份 JSON 文本备份，文件已安全保存在本机。");
  }

  const detail = rawMessage
    .replace(/^shareFileMessage:fail\s*/i, "")
    .replace(/(?:wxfile|https?):\/\/\S+/gi, "[文件路径]")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return new BackupFileError(
    detail
      ? `微信文件分享失败（${detail}），备份仍保存在本机。`
      : "微信文件分享组件暂时不可用，备份仍保存在本机。",
  );
}

async function prepareShareFile(file: StoredBackupFile) {
  if (/\.txt$/i.test(file.filePath) && /\.txt$/i.test(file.fileName)) {
    return { filePath: file.filePath, fileName: file.fileName, temporary: false };
  }

  const userDataPath = Taro.env.USER_DATA_PATH;
  if (!userDataPath) throw new BackupFileError("当前微信环境无法准备分享文件。");
  const filePath = `${userDataPath}/${temporaryShareFileName}`;
  await writeTextFile(filePath, await readTextFile(file.filePath));
  const fileName = /\.json$/i.test(file.fileName)
    ? `${file.fileName}.txt`
    : `${file.fileName}.json.txt`;
  return { filePath, fileName, temporary: true };
}

export async function shareBackupFile(file: StoredBackupFile) {
  if (!Taro.canIUse("shareFileMessage")) {
    throw new BackupFileError("当前微信版本不支持分享备份文件，请升级微信后再试。");
  }

  let prepared: Awaited<ReturnType<typeof prepareShareFile>> | null = null;
  try {
    prepared = await prepareShareFile(file);
    await Taro.shareFileMessage({
      filePath: prepared.filePath,
      fileName: prepared.fileName,
    });
  } catch (error) {
    if (operationWasCancelled(error)) throw error;
    if (error instanceof BackupFileError) throw error;
    console.warn("backup file sharing failed", rawErrorMessage(error));
    throw shareError(error);
  } finally {
    if (prepared?.temporary) {
      await unlinkManagedFile(prepared.filePath).catch(() => undefined);
    }
  }
}

export function operationWasCancelled(error: unknown) {
  const message = rawErrorMessage(error);
  return message.toLowerCase().includes("cancel");
}

export function backupErrorMessage(error: unknown, fallback: string) {
  return error instanceof BackupFileError && error.message ? error.message : fallback;
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
