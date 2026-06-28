"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { clampZoom, type DragState, type MapCamera } from "./shared";

type UseMapCameraOptions = {
  width: number;
};

export function useMapCamera({ width }: UseMapCameraOptions) {
  const frameRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<MapCamera>({ scale: 1, x: 0, y: 0 });
  const dragStateRef = useRef<DragState | null>(null);
  const dragMovedRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [frameScale, setFrameScale] = useState(1);
  const [camera, setCameraState] = useState<MapCamera>({ scale: 1, x: 0, y: 0 });

  const setCamera = useCallback((nextCamera: MapCamera | ((current: MapCamera) => MapCamera)) => {
    setCameraState((current) => {
      const resolved = typeof nextCamera === "function" ? nextCamera(current) : nextCamera;
      const clamped = {
        ...resolved,
        scale: clampZoom(resolved.scale),
      };
      cameraRef.current = clamped;

      return clamped;
    });
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const updateScale = () => {
      const { width: renderedWidth } = frame.getBoundingClientRect();
      setFrameScale(renderedWidth / width);
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(frame);
    window.addEventListener("resize", updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [width]);

  const zoomAt = useCallback(
    (clientX: number, clientY: number, delta: number) => {
      const frame = frameRef.current;
      if (!frame) return;

      const rect = frame.getBoundingClientRect();
      const pointerX = (clientX - rect.left) / frameScale;
      const pointerY = (clientY - rect.top) / frameScale;

      setCamera((current) => {
        const nextScale = clampZoom(current.scale * delta);
        const mapX = (pointerX - current.x) / current.scale;
        const mapY = (pointerY - current.y) / current.scale;

        return {
          scale: nextScale,
          x: pointerX - mapX * nextScale,
          y: pointerY - mapY * nextScale,
        };
      });
    },
    [frameScale, setCamera],
  );

  const zoomFromCenter = useCallback(
    (delta: number) => {
      const frame = frameRef.current;
      const rect = frame?.getBoundingClientRect();
      const centerX = rect ? rect.left + rect.width / 2 : 0;
      const centerY = rect ? rect.top + rect.height / 2 : 0;

      zoomAt(centerX, centerY, delta);
    },
    [zoomAt],
  );

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 1.12 : 0.88;
      zoomAt(event.clientX, event.clientY, delta);
    },
    [zoomAt],
  );

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, article, aside")) return;

    dragMovedRef.current = false;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCamera: cameraRef.current,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }, []);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      const dx = (event.clientX - dragState.startClientX) / frameScale;
      const dy = (event.clientY - dragState.startClientY) / frameScale;

      if (Math.abs(dx) + Math.abs(dy) > 3) dragMovedRef.current = true;

      setCamera({
        ...dragState.startCamera,
        x: dragState.startCamera.x + dx,
        y: dragState.startCamera.y + dy,
      });
    },
    [frameScale, setCamera],
  );

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
      setDragging(false);
    }
  }, []);

  const consumeDragMoved = useCallback(() => {
    if (!dragMovedRef.current) return false;
    dragMovedRef.current = false;
    return true;
  }, []);

  const resetCamera = useCallback(() => {
    setCamera({ scale: 1, x: 0, y: 0 });
  }, [setCamera]);

  return {
    frameRef,
    camera,
    cameraRef,
    dragging,
    frameScale,
    setCamera,
    zoomFromCenter,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    consumeDragMoved,
    resetCamera,
  };
}
