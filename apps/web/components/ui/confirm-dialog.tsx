"use client";

import { type ReactNode } from "react";
import { Modal } from "./modal";
import { Button } from "./button";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: ReactNode;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 确认按钮是否为危险样式（删除/销毁操作）。 */
  danger?: boolean;
  /** 确认中状态，传入 true 时按钮显示加载并禁用。 */
  loading?: boolean;
}

/**
 * 确认对话框，替代散落各页的原生 confirm()。
 * 受控使用：由调用方管理 open 状态。
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "确认操作",
  description,
  confirmText = "确认",
  cancelText = "取消",
  danger = false,
  loading = false,
}: Readonly<ConfirmDialogProps>) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      showClose={false}
      closeOnOverlay={!loading}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "处理中…" : confirmText}
          </Button>
        </>
      }
    >
      <></>
    </Modal>
  );
}
