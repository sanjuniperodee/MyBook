"use client";

/**
 * Звуки CRM через WebAudio (файлов нет). Браузер разрешает звук только после действия на странице, поэтому один общий
 * AudioContext создаётся и «размораживается» первым кликом или клавишей — дальше сигналы звучат и в фоновой вкладке.
 * Выключить звук можно на каждом устройстве отдельно (меню колокольчика).
 */
import type { LiveSound } from "./liveRules";

const KEY = "crm.sound";
let ctx: AudioContext | null = null;
/** Выбор на время вкладки, если хранилище браузера недоступно (приватный режим). */
let mutedHere: boolean | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  ctx = new Ctx();
  return ctx;
}

/** Вызывать из обработчика клика или клавиши: после этого звук разрешён. true — звук уже работает. */
export function unlockAudio(): boolean {
  try {
    const c = audio();
    if (!c) return false;
    if (c.state === "suspended") void c.resume();
    return c.state === "running";
  } catch {
    return false;
  }
}

function tone(c: AudioContext, at: number, freq: number, length: number, peak: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** Напоминание — три сигнала; сообщение — короткое «дзынь» в два тона. */
export function playSound(kind: Exclude<LiveSound, null>) {
  try {
    const c = audio();
    if (!c) return;
    if (c.state === "suspended") void c.resume();
    const t = c.currentTime + 0.02;
    if (kind === "reminder") [0, 0.3, 0.6].forEach((d, i) => tone(c, t + d, i === 2 ? 1320 : 880, 0.25, 0.4));
    else {
      tone(c, t, 784, 0.14, 0.32);
      tone(c, t + 0.12, 1175, 0.26, 0.32);
    }
  } catch {
    // звук недоступен — остаются всплывающее уведомление и счётчик во вкладке
  }
}

/** Звонок телефона: двойная трель (входящий звонок WhatsApp звонит в CRM — другого телефона у него нет). */
export function playRing() {
  try {
    const c = audio();
    if (!c) return;
    if (c.state === "suspended") void c.resume();
    const t = c.currentTime + 0.02;
    for (const d of [0, 0.5]) for (let i = 0; i < 8; i++) tone(c, t + d + i * 0.05, i % 2 ? 480 : 440, 0.05, 0.22);
  } catch {
    // звук недоступен — остаётся карточка звонка
  }
}

/** Звук выключен на этом устройстве. Хранилище браузера может быть недоступно — тогда звук включён. */
export function soundMuted(): boolean {
  if (mutedHere !== null) return mutedHere;
  try {
    return localStorage.getItem(KEY) === "off";
  } catch {
    return false;
  }
}

export function setSoundMuted(off: boolean) {
  mutedHere = off;
  try {
    if (off) localStorage.setItem(KEY, "off");
    else localStorage.removeItem(KEY);
  } catch {
    // без хранилища настройка живёт до перезагрузки
  }
}
