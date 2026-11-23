"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, X } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { iosNeedsInstall, pushPromptKind, type PushPromptKind } from "./liveRules";
import { currentSubscription, enablePush, healPush, pushSupported } from "./push-client";

const DISMISS_KEY = "crm-push-prompt-until";
const LATER_MS = 3 * 24 * 3600_000;

function isIosTab() {
  return iosNeedsInstall({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: window.matchMedia?.("(display-mode: standalone)").matches || !!(navigator as Navigator & { standalone?: boolean }).standalone,
  });
}

/**
 * Приглашение включить push на этом устройстве — карточкой над нижней панелью (на компьютере — справа под шапкой), пока
 * устройство не подписано. Где разрешение уже дано, подписка молча восстанавливается и копия уходит в CRM (сервер удаляет
 * подписку после 404/410, ключ VAPID мог смениться). Приложение продажника (Flutter, APNs) сюда не относится.
 */
export function PushPrompt() {
  const [kind, setKind] = useState<PushPromptKind>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const supported = pushSupported();
      const permission = supported ? Notification.permission : "unsupported";
      let subscribed = false;
      if (supported && permission === "granted") subscribed = await healPush().catch(() => false);
      else if (supported) subscribed = !!(await currentSubscription().catch(() => null));
      const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) ?? 0) || 0;
      if (alive) setKind(pushPromptKind({ supported, iosTab: isIosTab(), permission, subscribed, dismissedUntil, now: Date.now() }));
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!kind) return null;

  const later = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + LATER_MS));
    setKind(null);
  };

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await enablePush();
      if (permission === "granted") {
        toast("Уведомления на этом устройстве включены", "success");
        setKind(null);
      } else if (permission === "denied") setKind("denied");
    } catch {
      toast("Не удалось включить уведомления на этом устройстве", "error");
    } finally {
      setBusy(false);
    }
  };

  const title = kind === "enable" ? "Включите уведомления" : kind === "install-ios" ? "Push на iPhone — из установленной CRM" : "Уведомления запрещены в браузере";
  const text =
    kind === "enable"
      ? "О сообщениях клиентов, заявках и звонках будет приходить push, даже когда CRM закрыта."
      : kind === "install-ios"
        ? "Safari → «Поделиться» → «На экран „Домой“», войдите с иконки и включите уведомления."
        : "Значок замка у адреса → «Уведомления» → «Разрешить», затем обновите страницу.";

  return (
    <div
      role="status"
      data-testid="push-prompt"
      className="animate-pop fixed inset-x-3 bottom-[calc(var(--tabbar-h,0px)+0.75rem)] z-40 rounded-[var(--r-panel)] border border-line bg-white p-4 shadow-lift sm:inset-x-auto sm:right-4 sm:w-[360px] lg:top-16 lg:bottom-auto [html[data-chat-open]_&]:max-lg:hidden"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rose text-wine">
          <BellRing className="size-[18px]" strokeWidth={1.8} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-ink">{title}</div>
          <p className="mt-0.5 text-[13px] text-muted">{text}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-icon btn-sm -mt-1 -mr-1 max-lg:size-11" onClick={later} aria-label="Скрыть на 3 дня">
          <X className="size-4" />
        </button>
      </div>
      {kind === "enable" ? (
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn btn-outline btn-sm flex-1" onClick={later}>
            Позже
          </button>
          <button type="button" className="btn btn-primary btn-sm flex-1" disabled={busy} onClick={enable} data-testid="push-prompt-enable">
            Включить
          </button>
        </div>
      ) : kind === "install-ios" ? (
        <div className="mt-3 flex">
          <Link href="/crm" className="btn btn-outline btn-sm flex-1">
            Как установить
          </Link>
        </div>
      ) : null}
    </div>
  );
}
