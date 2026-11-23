"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { myNotifyPrefsAction, saveMyNotifyPrefsAction } from "@/app/admin/notify-actions";
import type { NotifyPrefs } from "@/modules/workspace/domain/notifyPrefs";
import { iosNeedsInstall } from "./liveRules";
import { currentSubscription, enablePush, pushSupported, unsubscribeDevice } from "./push-client";

const never = () => () => {};
/** Страница уже ожила в браузере: до этого (и на сервере) возможности браузера не проверяем — разметка совпадёт. */
const useHydrated = () => useSyncExternalStore(never, () => true, () => false);

/** Переключатель-строка: подпись слева, «тумблер» справа (role=switch). */
export function SwitchRow({ on, onChange, children, disabled, testId, hint }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode; disabled?: boolean; testId?: string; hint?: React.ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className="flex min-h-10 w-full items-center gap-3 text-left text-[13px] text-ink disabled:opacity-50 max-lg:min-h-11" data-testid={testId}>
      <span className="min-w-0 flex-1">
        {children}
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-wine" : "bg-line-strong")} aria-hidden>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-[left]", on ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}

/**
 * Мои push (tasks-19, tasks-22): тихие часы — ночью push не будит (напоминания о задачах приходят всегда, колокольчик —
 * всё), и push о сообщениях клиентов — можно выключить, если WhatsApp и так на телефоне магазина. Для всех устройств.
 */
export function PushPrefs() {
  const [p, setP] = useState<NotifyPrefs | null>(null);
  useEffect(() => {
    void myNotifyPrefsAction().then(setP, () => setP(null));
  }, []);
  if (!p) return null;
  const save = (next: NotifyPrefs) => {
    setP(next);
    void saveMyNotifyPrefsAction(next).then((r) => (r.ok ? undefined : toast(r.error, "error")));
  };
  return (
    <div className="border-t border-line/70" data-testid="push-prefs">
      <SwitchRow on={p.pushMessages} onChange={(v) => save({ ...p, pushMessages: v })}>
        Push о сообщениях клиентов
      </SwitchRow>
      <SwitchRow on={p.quiet} onChange={(v) => save({ ...p, quiet: v })} hint="ночью push не будит, напоминания о задачах приходят всегда">
        Тихие часы push
      </SwitchRow>
      {p.quiet ? (
        <div className="flex items-center gap-2 pb-2 text-[13px] text-ink-soft">
          с
          <input type="time" className="input h-8 w-28 px-2 text-sm" value={p.quietFrom} onChange={(e) => e.target.value && save({ ...p, quietFrom: e.target.value })} aria-label="Тихие часы с" />
          до
          <input type="time" className="input h-8 w-28 px-2 text-sm" value={p.quietTo} onChange={(e) => e.target.value && save({ ...p, quietTo: e.target.value })} aria-label="Тихие часы до" />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Push-уведомления на это устройство (телефон или компьютер) — приходят даже при закрытой CRM. Живёт в меню колокольчика
 * и в «Ещё» / «Профиль» на телефоне; подписка и её копия в CRM — push-client (общая с плашкой PushPrompt).
 */
export function PushToggle() {
  const hydrated = useHydrated();
  const supported = hydrated && pushSupported();
  const [state, setState] = useState<"unknown" | "on" | "off">("unknown");
  const [askedPerm, setPerm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!pushSupported()) return;
    currentSubscription().then((sub) => setState(sub ? "on" : "off"), () => setState("off"));
  }, []);
  if (!hydrated) return null;
  const perm = askedPerm ?? ("Notification" in window ? Notification.permission : "default");
  // Вкладка Safari на iPhone: push придут только после «На экран „Домой“» — подсказка вместо кнопки.
  const iosTab = iosNeedsInstall({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, standalone: window.matchMedia?.("(display-mode: standalone)").matches || !!(navigator as Navigator & { standalone?: boolean }).standalone });
  if (iosTab)
    return (
      <p className="py-2 text-xs text-ink-soft" data-testid="push-ios-hint">
        Чтобы push приходили на iPhone, откройте CRM в Safari → «Поделиться» → «На экран „Домой“» и войдите с иконки — там включите push.
      </p>
    );
  if (!supported) {
    return perm === "default" && "Notification" in window ? (
      <button className="flex min-h-10 w-full items-center text-left text-[13px] font-medium text-wine hover:underline max-lg:min-h-11" onClick={async () => setPerm(await Notification.requestPermission())}>
        Показывать уведомления на рабочем столе
      </button>
    ) : null;
  }
  if (state === "unknown") return null;
  const enable = async () => {
    setBusy(true);
    try {
      const permission = await enablePush();
      setPerm(permission);
      if (permission !== "granted") {
        if (permission === "denied") toast("Уведомления запрещены в браузере: значок замка у адреса → «Уведомления» → «Разрешить»", "error");
        return;
      }
      setState("on");
      toast("Уведомления на этом устройстве включены", "success");
    } catch {
      toast("Не удалось включить уведомления на этом устройстве", "error");
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    try {
      await unsubscribeDevice();
      setState("off");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SwitchRow on={state === "on"} disabled={busy} onChange={() => void (state === "on" ? disable() : enable())} testId="push-toggle" hint="приходят, даже когда CRM закрыта">
      Push на этом устройстве
    </SwitchRow>
  );
}
