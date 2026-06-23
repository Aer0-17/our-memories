"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type StatusOptions = {
  autoClear?: boolean;
  durationMs?: number;
};

export function useTransientStatus(defaultDurationMs = 2600) {
  const [status, setStatusValue] = useState("");
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (!timerRef.current) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const setStatus = useCallback(
    (value: string, options: StatusOptions = {}) => {
      clearTimer();
      setStatusValue(value);

      if (!value || !options.autoClear) return;

      timerRef.current = window.setTimeout(() => {
        setStatusValue("");
        timerRef.current = null;
      }, options.durationMs ?? defaultDurationMs);
    },
    [clearTimer, defaultDurationMs],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return [status, setStatus] as const;
}
