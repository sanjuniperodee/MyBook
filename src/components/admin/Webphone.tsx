"use client";

import { useEffect, useState } from "react";
import { Headset, LoaderCircle } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    zadarmaWidgetFn?: (key: string, sip: string, shape: string, lang: string, visible: boolean, position: { right: string; bottom: string }) => void;
  }
}

const ON_KEY = "crm_webphone";
const BASE = "https://my.zadarma.com/webphoneWebRTCWidget/v9/js";

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Не загрузился ${src}`));
    document.head.appendChild(s);
  });
}

let started = false;

async function startWidget() {
  if (started) return;
  const res = await fetch("/api/admin/webphone", { cache: "no-store" });
  const data = (await res.json()) as { key?: string; sip?: string; error?: string };
  if (!res.ok || !data.key || !data.sip) throw new Error(data.error ?? "Не удалось получить ключ веб-телефона");
  await loadScript(`${BASE}/loader-phone-lib.js?sub_v=1`);
  await loadScript(`${BASE}/loader-phone-fn.js?sub_v=1`);
  if (!window.zadarmaWidgetFn) throw new Error("Виджет Zadarma не загрузился");
  window.zadarmaWidgetFn(data.key, data.sip, "square", "ru", true, { right: "10px", bottom: "5px" });
  started = true;
}

/**
 * Веб-телефон Zadarma: звонки и входящие прямо в браузере, без софтфона. Включается кнопкой в шапке
 * и запоминается в браузере; виджет и его скрипты грузятся только после включения.
 */
export function Webphone() {
  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(false);

  // Состояние из браузера читаем после гидратации, чтобы разметка сервера и клиента совпала.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        if (localStorage.getItem(ON_KEY) === "1") setOn(true);
      } catch {}
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!on || started) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      setLoading(true);
      startWidget()
        .catch((err: Error) => {
          if (cancelled) return;
          toast(err.message, "error");
          setOn(false);
          try {
            localStorage.removeItem(ON_KEY);
          } catch {}
        })
        .finally(() => !cancelled && setLoading(false));
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [on]);

  return (
    <button
      type="button"
      className={cn("btn btn-ghost btn-sm h-9 gap-1.5", on && "text-emerald-700")}
      title={on ? "Веб-телефон включён. Чтобы выключить — нажмите и обновите страницу" : "Включить веб-телефон: звонки из браузера (нужен микрофон)"}
      onClick={() => {
        if (on) {
          try {
            localStorage.removeItem(ON_KEY);
          } catch {}
          setOn(false);
          if (started) toast("Веб-телефон выключится после обновления страницы");
          return;
        }
        try {
          localStorage.setItem(ON_KEY, "1");
        } catch {}
        setOn(true);
      }}
      data-testid="webphone"
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Headset className="size-4" />}
      <span className="hidden sm:inline">{on ? "Телефон" : "Телефон выкл."}</span>
    </button>
  );
}
