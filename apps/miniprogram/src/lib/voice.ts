import Taro from "@tarojs/taro";

export type VoiceDraft = {
  filePath: string;
  durationMs: number;
  fileSize: number;
};

type RecordingCallbacks = {
  onStop: (draft: VoiceDraft) => void;
  onError: (message: string) => void;
};

type ActiveRecording = RecordingCallbacks & {
  id: number;
  discarded: boolean;
};

let recorderReady = false;
let recordingSequence = 0;
let activeRecording: ActiveRecording | null = null;

function recordingErrorMessage(error = "") {
  const normalized = error.toLowerCase();
  if (normalized.includes("authorize") || normalized.includes("permission")) {
    return "麦克风权限未开启，请允许后再录制。";
  }
  if (normalized.includes("interruption") || normalized.includes("interrupt")) {
    return "录音被系统中断，请重新录制。";
  }
  return "录音没有成功，请检查麦克风后再试。";
}

function ensureRecorderListeners() {
  if (recorderReady) return;
  const recorder = Taro.getRecorderManager();
  recorder.onStop((result) => {
    const current = activeRecording;
    activeRecording = null;
    if (!current || current.discarded) return;
    current.onStop({
      filePath: result.tempFilePath,
      durationMs: result.duration,
      fileSize: result.fileSize,
    });
  });
  recorder.onError((result) => {
    const current = activeRecording;
    activeRecording = null;
    if (!current || current.discarded) return;
    current.onError(recordingErrorMessage(result.errMsg));
  });
  recorder.onInterruptionBegin(() => {
    const current = activeRecording;
    if (!current) return;
    current.discarded = true;
    activeRecording = null;
    recorder.stop();
    current.onError("录音被系统中断，请重新录制。");
  });
  recorderReady = true;
}

export async function ensureRecordPermission() {
  const setting = await Taro.getSetting();
  if (setting.authSetting["scope.record"]) return true;

  if (setting.authSetting["scope.record"] === false) {
    const modal = await Taro.showModal({
      title: "需要麦克风权限",
      content: "允许使用麦克风，才能录下只给 TA 听的语音。",
      confirmText: "去设置",
      cancelText: "暂不",
    });
    if (!modal.confirm) return false;
    const opened = await Taro.openSetting();
    return opened.authSetting["scope.record"] === true;
  }

  try {
    await Taro.authorize({ scope: "scope.record" });
    return true;
  } catch {
    const modal = await Taro.showModal({
      title: "需要麦克风权限",
      content: "请在设置中允许麦克风权限，再回来录制语音。",
      confirmText: "去设置",
      cancelText: "暂不",
    });
    if (!modal.confirm) return false;
    const opened = await Taro.openSetting();
    return opened.authSetting["scope.record"] === true;
  }
}

export function startVoiceRecording(callbacks: RecordingCallbacks) {
  ensureRecorderListeners();
  if (activeRecording) {
    callbacks.onError("已有一段录音正在进行，请先停止后再试。");
    return null;
  }

  const current: ActiveRecording = {
    id: ++recordingSequence,
    discarded: false,
    ...callbacks,
  };
  activeRecording = current;
  try {
    Taro.getRecorderManager().start({
      duration: 60_000,
      sampleRate: 16_000,
      numberOfChannels: 1,
      encodeBitRate: 48_000,
      format: "mp3",
      audioSource: "auto",
    });
  } catch {
    activeRecording = null;
    callbacks.onError("录音功能暂时不可用，请稍后再试。");
    return null;
  }
  return current.id;
}

export function stopVoiceRecording(id: number) {
  if (!activeRecording || activeRecording.id !== id) return;
  Taro.getRecorderManager().stop();
}

export function cancelVoiceRecording(id: number) {
  if (!activeRecording || activeRecording.id !== id) return;
  activeRecording.discarded = true;
  activeRecording = null;
  Taro.getRecorderManager().stop();
}

let activeAudio: ReturnType<typeof Taro.createInnerAudioContext> | null = null;

export function claimAudio(current: ReturnType<typeof Taro.createInnerAudioContext>) {
  if (activeAudio && activeAudio !== current) {
    activeAudio.stop();
  }
  activeAudio = current;
}

export function releaseAudio(current: ReturnType<typeof Taro.createInnerAudioContext>) {
  if (activeAudio === current) activeAudio = null;
  current.stop();
  current.destroy();
}
