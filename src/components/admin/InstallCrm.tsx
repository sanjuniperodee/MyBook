"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Download, Share, SquarePlus } from "lucide-react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Открыто как установленное приложение (иконка на экране «Домой»): iOS — navigator.standalone, остальные — display-mode. */
export const isStandalone = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

const never = () => () => {};
/** Открыто как приложение — на сервере считаем «да», чтобы подсказки установки не мигали до гидратации. */
export const useStandalone = () => useSyncExternalStore(never, isStandalone, () => true);
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Установка CRM на телефон: на Android — кнопка (событие beforeinstallprompt), на iPhone — подсказка «Поделиться → На экран
 * Домой» (iOS не даёт установить из кода). Уже установлено — сразу в CRM.
 */
export function InstallCrm() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const ios = useSyncExternalStore(never, isIos, () => false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      window.location.replace("/admin");
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setDone(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return (
    <div className="space-y-4">
      {done ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Готово — найдите «MyBooks CRM» на экране телефона и откройте оттуда.</p> : null}
      {event && !done ? (
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={async () => {
            await event.prompt();
            const r = await event.userChoice;
            if (r.outcome === "accepted") setDone(true);
            setEvent(null);
          }}
        >
          <Download className="size-5" /> Установить на телефон
        </button>
      ) : null}

      <ol className="space-y-3 rounded-2xl border border-line bg-white p-4 text-sm">
        {ios ? (
          <>
            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-rose font-semibold text-wine">1</span>
              <span>
                Откройте эту страницу в <b>Safari</b> и нажмите <Share className="inline size-4 align-text-bottom" /> <b>«Поделиться»</b>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-rose font-semibold text-wine">2</span>
              <span>
                Выберите <SquarePlus className="inline size-4 align-text-bottom" /> <b>«На экран “Домой”»</b> и нажмите «Добавить».
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-rose font-semibold text-wine">3</span>
              <span>Откройте иконку «MyBooks CRM» с экрана — войдите один раз, дальше вход сохранится.</span>
            </li>
          </>
        ) : (
          <>
            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-rose font-semibold text-wine">1</span>
              <span>
                В <b>Chrome</b> нажмите <b>⋮</b> → <b>«Установить приложение»</b> (или кнопку выше).
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-rose font-semibold text-wine">2</span>
              <span>Откройте «MyBooks CRM» с экрана телефона — войдите один раз, дальше вход сохранится.</span>
            </li>
          </>
        )}
      </ol>
      <Link href="/admin" className="btn btn-outline w-full">
        Открыть CRM в браузере
      </Link>
    </div>
  );
}
