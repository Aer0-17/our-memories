import { useEffect, useRef, useState } from "react";
import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import playIcon from "../assets/lucide/play.svg";
import pauseIcon from "../assets/lucide/pause.svg";
import { claimAudio, releaseAudio } from "../lib/voice";
import "./VoicePlayer.scss";

type VoicePlayerProps = {
  src?: string;
  label?: string;
  compact?: boolean;
  onError?: (message: string) => void;
};

const bars = [8, 16, 12, 20, 16, 20, 12, 24];

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function VoicePlayer({ src, label = "语音", compact = false, onError }: Readonly<VoicePlayerProps>) {
  const audioRef = useRef<ReturnType<typeof Taro.createInnerAudioContext> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (!src) return undefined;
    const audio = Taro.createInnerAudioContext();
    audio.autoplay = false;
    audio.src = src;
    audioRef.current = audio;
    audio.onPlay(() => setPlaying(true));
    audio.onPause(() => setPlaying(false));
    audio.onStop(() => setPlaying(false));
    audio.onTimeUpdate(() => {
      setCurrentTime(audio.currentTime || 0);
      setDuration(audio.duration || 0);
    });
    audio.onEnded(() => {
      setPlaying(false);
      setCurrentTime(0);
    });
    audio.onError(() => {
      setPlaying(false);
      onError?.("语音播放失败，请检查网络后重试。");
    });

    return () => {
      if (audioRef.current === audio) audioRef.current = null;
      releaseAudio(audio);
      setPlaying(false);
    };
  }, [onError, src]);

  if (!src) return null;

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    claimAudio(audio);
    audio.play();
  };

  return (
    <View className={compact ? "voice-player compact" : "voice-player"}>
      <View className="voice-player-main">
        <View className="voice-player-button-wrap">
          <View
            className="voice-player-button"
            role="button"
            aria-label={playing ? "暂停语音" : "播放语音"}
            onClick={toggle}
          >
            <Image className="voice-player-icon" src={playing ? pauseIcon : playIcon} mode="aspectFit" />
          </View>
        </View>
        <View className="voice-player-copy">
          {!compact && <Text className="voice-player-label">{label}</Text>}
          <View className="voice-wave" aria-hidden="true">
            {bars.map((height, index) => (
              <View
                className={index / bars.length <= progress ? "voice-wave-bar active" : "voice-wave-bar"}
                key={`voice-bar-${index}`}
                style={{ height: `${height}px` }}
              />
            ))}
          </View>
        </View>
        <Text className="voice-player-time">{formatTime(playing ? currentTime : duration)}</Text>
      </View>
    </View>
  );
}
