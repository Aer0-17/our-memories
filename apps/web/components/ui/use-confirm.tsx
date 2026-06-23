"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ConfirmDialog } from "./confirm-dialog";

interface ConfirmOptions {
  title?: ReactNode;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * Promise 化的确认对话框 hook，替代原生 confirm()。
 *
 * 用法：
 *   const confirm = useConfirm();
 *   if (!await confirm({ title: "确定删除？", danger: true })) return;
 *
 * 需要将 <confirm.dialog /> 渲染在组件 JSX 中（通常放返回树末尾）。
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions = {}): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      });
    },
    [],
  );

  const handleClose = useCallback(() => {
    pending?.resolve(false);
    setPending(null);
  }, [pending]);

  const handleConfirm = useCallback(() => {
    pending?.resolve(true);
    setPending(null);
  }, [pending]);

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onClose={handleClose}
      onConfirm={handleConfirm}
      title={pending?.title}
      description={pending?.description}
      confirmText={pending?.confirmText}
      cancelText={pending?.cancelText}
      danger={pending?.danger}
    />
  );

  return { confirm, dialog };
}
