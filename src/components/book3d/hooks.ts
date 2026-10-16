"use client";

import { useEffect, useState, useSyncExternalStore, type KeyboardEvent, type RefObject } from "react";

/** Полный экран для обёртки просмотра: доступен ли, включён ли, переключить. */
export function useFullscreen(wrapper: RefObject<HTMLElement | null>) {
  const canFull = useSyncExternalStore(
    () => () => {},
    () => document.fullscreenEnabled,
    () => false,
  );
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === wrapper.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [wrapper]);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapper.current?.requestFullscreen();
  };
  return { canFull, full, toggleFull };
}

/** Что умеет просмотр книги с клавиатуры. */
export interface BookKeyActions {
  /** Перелистнуть на step разворотов (−1 — назад). */
  turn(step: 1 | -1): void;
  /** К первому или последнему развороту. */
  edge(to: "first" | "last"): void;
  /** Повернуть книгу вокруг вертикали (Shift + ←/→). */
  orbit(dir: 1 | -1): void;
  /** Наклонить (↑ — вверх, ↓ — вниз). */
  tilt(dir: 1 | -1): void;
  /** Приблизить (1) или отдалить (−1). */
  zoom(dir: 1 | -1): void;
  /** Исходный вид (0). */
  reset(): void;
  /** Перед любым действием — например, остановить автоповорот. */
  before?(): void;
}

/**
 * Клавиши просмотра книги: ←/→ — листать (с Shift — повернуть), ↑/↓ — наклон, PageUp/PageDown, Home/End,
 * +/=/− — масштаб, 0 — исходный вид. Возвращает обработчик onKeyDown для фокусируемой обёртки.
 */
export function useBookKeys(actions: BookKeyActions) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const a = actions;
    const map: Record<string, () => void> = {
      ArrowRight: () => (e.shiftKey ? a.orbit(1) : a.turn(1)),
      ArrowLeft: () => (e.shiftKey ? a.orbit(-1) : a.turn(-1)),
      ArrowUp: () => a.tilt(1),
      ArrowDown: () => a.tilt(-1),
      PageDown: () => a.turn(1),
      PageUp: () => a.turn(-1),
      Home: () => a.edge("first"),
      End: () => a.edge("last"),
      "+": () => a.zoom(1),
      "=": () => a.zoom(1),
      "-": () => a.zoom(-1),
      "0": () => a.reset(),
    };
    const run = map[e.key];
    if (!run) return;
    e.preventDefault();
    a.before?.();
    run();
  };
}
