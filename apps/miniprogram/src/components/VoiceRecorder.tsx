import { useEffect, useRef, useState } from "react";
import { Image, Text, View } from "@tarojs/components";
import { useDidHide } from "@tarojs/taro";
import micIcon from "../assets/lucide/mic.svg";
import squareIcon from "../assets/lucide/square.svg";
import trashIcon from "../assets/lucide/trash-2.svg";
import {
  cancelVoiceRecording,
  ensureRecordPermission,
  startVoiceRecording,
  stopVoiceRecording,
  type VoiceDraft,
} from "../lib/voice";
import { VoicePlayer } from "./VoicePlayer";
import "./VoiceRecorder.scss";

type VoiceRecorderProps = {
  draft: VoiceDraft | null;
  disabled?: boolean;
  maxSeconds?: number;
  onChange: (draft: VoiceDraft) => void;
  onClear: () => void;
  onRecordingChange?: (recording: boolean) => void;
  onError?: (message: string) => void;
};

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.min(60, seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function VoiceRecorder({
  draft,
  disabled = false,
  maxSeconds = 60,
  onChange,
  onClear,
  onRecordingChange,
  onError,
}: Readonly<VoiceRecorderProps>) {
  const mountedRef = useRef(true);
  const recordingIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const clearTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    timerRef.current = null;
    stopTimerRef.current = null;
  };

  const setRecordingState = (value: boolean) => {
    if (!mountedRef.current) return;
    setRecording(value);
    onRecordingChange?.(value);
  };

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearTimers();
      if (recordingIdRef.current !== null) cancelVoiceRecording(recordingIdRef.current);
    };
  }, []);

  useDidHide(() => {
    if (recordingIdRef.current === null) return;
    cancelVoiceRecording(recordingIdRef.current);
    recordingIdRef.current = null;
    clearTimers();
    setRecordingState(false);
    onError?.("应用进入后台，录音已停止，请重新录制。");
  });

  const stop = () => {
    if (recordingIdRef.current === null) return;
    stopVoiceRecording(recordingIdRef.current);
  };

  const start = async () => {
    if (disabled || recording || draft) return;
    let allowed = false;
    try {
      allowed = await ensureRecordPermission();
    } catch {
      onError?.("无法读取麦克风权限，请稍后再试。");
      return;
    }
    if (!allowed || !mountedRef.current) return;

    const id = startVoiceRecording({
      onStop: (nextDraft) => {
        clearTimers();
        recordingIdRef.current = null;
        setRecordingState(false);
        onChange(nextDraft);
      },
      onError: (message) => {
        clearTimers();
        recordingIdRef.current = null;
        setRecordingState(false);
        onError?.(message);
      },
    });
    if (id === null) return;
    recordingIdRef.current = id;
    setElapsed(0);
    setRecordingState(true);
    timerRef.current = setInterval(() => {
      setElapsed((current) => Math.min(maxSeconds, current + 1));
    }, 1000);
    stopTimerRef.current = setTimeout(stop, maxSeconds * 1000);
  };

  const clear = () => {
    if (disabled || recording) return;
    setElapsed(0);
    onClear();
  };

  return (
    <View className="voice-recorder">
      <View className="voice-recorder-heading">
        <View className="voice-recorder-copy">
          <Text className="voice-recorder-label">语音留言</Text>
          <Text className={recording ? "voice-recorder-status recording" : "voice-recorder-status"}>
            {recording ? `正在录音 ${formatTime(elapsed)} / 1:00` : draft ? `已录制 ${formatTime(Math.round(draft.durationMs / 1000))}，可发送` : "最长 60 秒"}
          </Text>
        </View>
        <View
          className={recording ? "voice-recorder-button recording" : "voice-recorder-button"}
          role="button"
          aria-label={recording ? "停止录音" : "开始录音"}
          onClick={recording ? stop : start}
        >
          <Image className="voice-recorder-icon" src={recording ? squareIcon : micIcon} mode="aspectFit" />
        </View>
      </View>
      {draft && !recording && (
        <View className="voice-recorder-preview">
          <VoicePlayer src={draft.filePath} compact />
          <View
            className="voice-recorder-delete"
            role="button"
            aria-label="删除录音"
            onClick={clear}
          >
            <Image className="voice-recorder-delete-icon" src={trashIcon} mode="aspectFit" />
          </View>
        </View>
      )}
    </View>
  );
}
