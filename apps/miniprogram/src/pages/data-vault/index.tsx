import { useState } from "react";
import { Button, Image, Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import {
  clearSession,
  exportBackup,
  importBackup,
  readSession,
  type Session,
} from "../../lib/api";
import {
  backupErrorMessage,
  chooseBackupFile,
  deleteStoredBackup,
  formatFileSize,
  operationWasCancelled,
  parseBackupFile,
  readStoredBackup,
  shareBackupFile,
  writeBackupFile,
  type BackupPreview,
  type StoredBackupFile,
} from "../../lib/backup";
import shieldIcon from "../../assets/lucide/shield-check.svg";
import "./index.scss";

type WorkingState = "" | "export" | "choose" | "share" | "delete" | "restore";

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function DataVaultPage() {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [lastBackup, setLastBackup] = useState<StoredBackupFile | null>(() =>
    readStoredBackup(readSession()),
  );
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState<WorkingState>("");

  useDidShow(() => {
    const current = readSession();
    if (!current) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    setSession(current);
    setLastBackup(readStoredBackup(current));
  });

  const exportCurrent = async () => {
    if (!session || working) return;
    const warning = await Taro.showModal({
      title: "生成私密备份",
      content: "JSON 会包含私人记录和登录凭据摘要，但不包含照片、语音原文件，也不会额外加密。请只发送给可信的人。",
      confirmText: "继续",
      confirmColor: "#477A69",
    });
    if (!warning.confirm) return;

    setWorking("export");
    setStatus("");
    try {
      Taro.showLoading({ title: "正在生成…", mask: true });
      const payload = await exportBackup();
      const stored = await writeBackupFile(payload, "manual");
      setLastBackup(stored);
      Taro.hideLoading();

      const sharePrompt = await Taro.showModal({
        title: "备份已生成",
        content: "JSON 文本已保存在本机。现在打开微信，发送给文件传输助手或对方吗？",
        cancelText: "稍后",
        confirmText: "去分享",
        confirmColor: "#477A69",
      });
      if (!sharePrompt.confirm) {
        setStatus("备份已保存在本机，可在下方“最近备份”中再次分享。");
        return;
      }

      try {
        await shareBackupFile(stored);
        Taro.showToast({ title: "备份已生成", icon: "success" });
      } catch (error) {
        if (operationWasCancelled(error)) {
          setStatus("备份已保存在本机，可在下方“最近备份”中再次分享。");
        } else {
          setStatus(backupErrorMessage(error, "备份已生成，但暂时无法打开微信分享。文件仍保存在本机。"));
        }
      }
    } catch (error) {
      setStatus(backupErrorMessage(error, "备份生成失败，请检查网络后再试。"));
    } finally {
      Taro.hideLoading();
      setWorking("");
    }
  };

  const shareLastBackup = async () => {
    if (!lastBackup || working) return;
    setWorking("share");
    setStatus("");
    try {
      await shareBackupFile(lastBackup);
    } catch (error) {
      if (!operationWasCancelled(error)) {
        setStatus(backupErrorMessage(error, "这份本机备份暂时无法分享，建议重新生成一份。"));
      }
    } finally {
      setWorking("");
    }
  };

  const deleteLastBackup = async () => {
    if (!lastBackup || working) return;
    const check = await Taro.showModal({
      title: "删除本机备份",
      content: "这只会删除小程序本机保存的最新 JSON 文本，不会删除服务器上的回忆，也不会撤回已经发送出去的文件。",
      confirmText: "删除",
      confirmColor: "#B84D52",
    });
    if (!check.confirm) return;

    setWorking("delete");
    setStatus("");
    try {
      await deleteStoredBackup(lastBackup);
      setLastBackup(null);
      Taro.showToast({ title: "本机文件已删除", icon: "success" });
    } catch {
      setStatus("本机备份删除失败，请稍后再试。");
    } finally {
      setWorking("");
    }
  };

  const selectBackup = async () => {
    if (!session || working) return;
    const warning = await Taro.showModal({
      title: "恢复前先核对",
      content: "恢复会替换当前空间的数据。这里只允许选择当前空间自己导出的 JSON 或 JSON 文本，读取后还需要再次确认。",
      confirmText: "选文件",
      confirmColor: "#9E4144",
    });
    if (!warning.confirm) return;

    setWorking("choose");
    setStatus("");
    try {
      const file = await chooseBackupFile();
      Taro.showLoading({ title: "正在核对…", mask: true });
      const nextPreview = parseBackupFile(file, session);
      setPreview(nextPreview);
      setConfirmation("");
      Taro.showToast({ title: "本机检查通过", icon: "success" });
    } catch (error) {
      if (!operationWasCancelled(error)) {
        setStatus(backupErrorMessage(error, "备份文件读取失败，请重新选择。"));
      }
    } finally {
      Taro.hideLoading();
      setWorking("");
    }
  };

  const restoreSelected = async () => {
    if (!session || !preview || confirmation.trim() !== "恢复" || working) return;
    const finalCheck = await Taro.showModal({
      title: "最后确认",
      content: `将用 ${formatDateTime(preview.exportedAt)} 的 ${preview.recordCount} 条记录覆盖当前空间，空间密码也会回到备份当时的状态。系统会先保存恢复前快照。`,
      confirmText: "确认恢复",
      confirmColor: "#B84D52",
    });
    if (!finalCheck.confirm) return;

    setWorking("restore");
    setStatus("");
    let rollback: StoredBackupFile | null = null;
    let importStarted = false;
    try {
      Taro.showLoading({ title: "保护现有数据…", mask: true });
      rollback = await writeBackupFile(await exportBackup(), "rollback");
      setLastBackup(rollback);
      Taro.hideLoading();
      Taro.showLoading({ title: "正在恢复…", mask: true });
      importStarted = true;
      const result = await importBackup(preview.payload);
      setPreview(null);
      setConfirmation("");
      Taro.hideLoading();

      if (result.reloginRequired) {
        clearSession();
        await Taro.showModal({
          title: "恢复完成",
          content: "空间身份已发生变化，需要重新登录。恢复前快照仍保存在本机。",
          showCancel: false,
          confirmText: "去登录",
        });
        Taro.switchTab({ url: "/pages/index/index" });
        return;
      }

      const sharePrompt = await Taro.showModal({
        title: "恢复完成",
        content: "空间密码已回到备份当时的状态。恢复前快照已保存在本机，建议现在发送到文件传输助手留作回退保障。",
        cancelText: "稍后",
        confirmText: "去分享",
        confirmColor: "#477A69",
      });
      if (sharePrompt.confirm && rollback) {
        try {
          await shareBackupFile(rollback);
        } catch (error) {
          if (!operationWasCancelled(error)) {
            setStatus(backupErrorMessage(error, "数据已恢复，但恢复前快照暂时无法分享；可在最近备份中重试。"));
          }
        }
      }
    } catch (error) {
      setStatus(
        backupErrorMessage(
          error,
          importStarted
            ? "未能确认服务器最终恢复结果，请先重新进入页面检查数据，不要立即重复操作；恢复前快照已保存在本机。"
            : rollback
              ? "恢复请求尚未提交；恢复前快照已保存在本机。"
            : "恢复没有开始，当前空间数据未被改动。",
        ),
      );
    } finally {
      Taro.hideLoading();
      setWorking("");
    }
  };

  if (!session) {
    return (
      <View className="page data-vault-page">
        <AppHeader title="数据保险箱" back />
      </View>
    );
  }

  return (
    <View className="page data-vault-page">
      <AppHeader title="数据保险箱" back />

      <View className="vault-hero">
        <View className="vault-hero-icon">
          <Image className="vault-hero-icon-image" src={shieldIcon} mode="aspectFit" />
        </View>
        <View className="vault-hero-copy">
          <Text className="vault-kicker">只属于你们的数据副本</Text>
          <Text className="vault-title">把共同回忆握在自己手里</Text>
          <Text className="vault-subtitle">导出数据库记录，需要时再安全恢复到当前空间。</Text>
        </View>
      </View>

      {status ? (
        <View className="vault-status">
          <Text className="vault-status-copy">{status}</Text>
          <Button className="vault-status-close" onClick={() => setStatus("")}>知道了</Button>
        </View>
      ) : null}

      <View className="vault-layout">
        <View className="vault-panel card vault-export-panel">
          <View className="vault-panel-heading">
            <View>
              <Text className="vault-panel-kicker">推荐先做</Text>
              <Text className="vault-panel-title">生成数据库 JSON 文本备份</Text>
            </View>
            <Text className="vault-format">备份 v1</Text>
          </View>
          <Text className="vault-panel-copy">
            保存空间、双方成员、回忆、私语、纪念日、胶囊和共同记录；不包含照片、语音原文件。
          </Text>
          <Button
            className="btn vault-primary-action"
            disabled={Boolean(working)}
            loading={working === "export"}
            onClick={() => void exportCurrent()}
          >
            生成并分享备份
          </Button>

          <View className="vault-last">
            <Text className="vault-last-label">最近备份</Text>
            {lastBackup ? (
              <>
                <View className="vault-last-heading">
                  <View className="vault-last-copy">
                    <Text className="vault-last-name">{lastBackup.fileName}</Text>
                    <Text className="vault-last-meta">
                      {formatDateTime(lastBackup.createdAt)} · {formatFileSize(lastBackup.size)} · {lastBackup.recordCount} 条记录
                    </Text>
                  </View>
                  <Text className={lastBackup.kind === "rollback" ? "vault-badge vault-badge-gold" : "vault-badge"}>
                    {lastBackup.kind === "rollback" ? "恢复前快照" : "手动备份"}
                  </Text>
                </View>
                <View className="vault-file-actions">
                  <Button
                    className="vault-share-action"
                    disabled={Boolean(working)}
                    onClick={() => void shareLastBackup()}
                  >
                    {working === "share" ? "正在打开…" : "再次分享"}
                  </Button>
                  <Button
                    className="vault-delete-action"
                    disabled={Boolean(working)}
                    onClick={() => void deleteLastBackup()}
                  >
                    {working === "delete" ? "正在删除…" : "删除本机文件"}
                  </Button>
                </View>
                <Text className="vault-last-policy">本机始终只保留最新一份；生成新备份会覆盖上一份。</Text>
              </>
            ) : (
              <Text className="vault-last-empty">此设备还没有生成过备份。</Text>
            )}
          </View>
        </View>

        <View className="vault-panel card vault-restore-panel">
          <View className="vault-panel-heading">
            <View>
              <Text className="vault-panel-kicker vault-panel-kicker-danger">谨慎操作</Text>
              <Text className="vault-panel-title">从备份恢复</Text>
            </View>
            <Text className="vault-restore-step">双重确认</Text>
          </View>
          <Text className="vault-panel-copy">
            先在本机检查格式、空间归属和数据关系，通过后才允许提交恢复。
          </Text>
          <Button
            className="vault-secondary-action"
            disabled={Boolean(working)}
            onClick={() => void selectBackup()}
          >
            {working === "choose" ? "正在读取…" : preview ? "重新选择备份" : "选择备份文件"}
          </Button>

          {preview ? (
            <View className="vault-preview">
              <View className="vault-preview-heading">
                <View className="vault-preview-copy">
                  <Text className="vault-preview-name">{preview.fileName}</Text>
                  <Text className="vault-preview-meta">
                    {formatFileSize(preview.fileSize)} · {formatDateTime(preview.exportedAt)}
                  </Text>
                </View>
                <Button
                  className="vault-clear-action"
                  disabled={working === "restore"}
                  onClick={() => {
                    setPreview(null);
                    setConfirmation("");
                  }}
                >
                  移除
                </Button>
              </View>

              <View className="vault-check-row">
                <Text className="vault-check-mark">✓</Text>
                <View>
                  <Text className="vault-check-title">本机检查通过</Text>
                  <Text className="vault-check-copy">
                    {preview.sourceName} · {preview.sourceSpaceCode} · {preview.memberCount} 位成员
                  </Text>
                </View>
              </View>

              <View className="vault-count-grid">
                <View className="vault-count-item">
                  <Text className="vault-count-value">{preview.memoryCount}</Text>
                  <Text className="vault-count-label">回忆</Text>
                </View>
                <View className="vault-count-item">
                  <Text className="vault-count-value">{preview.conversationCount}</Text>
                  <Text className="vault-count-label">私语</Text>
                </View>
                <View className="vault-count-item">
                  <Text className="vault-count-value">{preview.capsuleCount}</Text>
                  <Text className="vault-count-label">胶囊</Text>
                </View>
                <View className="vault-count-item">
                  <Text className="vault-count-value">{preview.anniversaryCount + preview.otherCount}</Text>
                  <Text className="vault-count-label">其他记录</Text>
                </View>
              </View>

              <View className="vault-risk-note">
                <Text className="vault-risk-title">恢复会覆盖当前空间</Text>
                <Text className="vault-risk-copy">
                  空间密码也会回到备份当时的状态。提交前会自动生成恢复前快照，照片和语音原文件不会由 JSON 重建。
                </Text>
              </View>

              <View className="vault-confirm-group">
                <Text className="vault-confirm-label">输入“恢复”以解锁最后一步</Text>
                <Input
                  className="vault-confirm-input"
                  value={confirmation}
                  maxlength={2}
                  confirmType="done"
                  placeholder="恢复"
                  onInput={(event) => setConfirmation(event.detail.value)}
                />
              </View>
              <Button
                className="vault-danger-action"
                disabled={confirmation.trim() !== "恢复" || Boolean(working)}
                loading={working === "restore"}
                onClick={() => void restoreSelected()}
              >
                恢复这份备份
              </Button>
            </View>
          ) : (
            <View className="vault-restore-empty">
              <Text className="vault-restore-empty-title">尚未选择文件</Text>
              <Text className="vault-restore-empty-copy">支持本应用导出的 .json 或 .json.txt 文件，单个文件最大 8 MB。</Text>
            </View>
          )}
        </View>
      </View>

      <View className="vault-scope">
        <Text className="vault-scope-title">备份边界要知道</Text>
        <View className="vault-scope-list">
          <View className="vault-scope-row">
            <Text className="vault-scope-mark vault-scope-mark-green">✓</Text>
            <Text className="vault-scope-copy">包含数据库记录、空间设置和登录凭据摘要。</Text>
          </View>
          <View className="vault-scope-row">
            <Text className="vault-scope-mark vault-scope-mark-gold">!</Text>
            <Text className="vault-scope-copy">文件未额外加密，请不要随意转发或放进公共网盘。</Text>
          </View>
          <View className="vault-scope-row">
            <Text className="vault-scope-mark vault-scope-mark-gold">!</Text>
            <Text className="vault-scope-copy">照片和语音只保存地址与对象键，还需单独备份服务器图片目录或对象存储。</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
