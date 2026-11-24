"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw, Unlink } from "lucide-react";
import { confirmDialog, toast, toastError } from "@/components/ui/overlays";
import { boardsApi } from "../boards/client";

type Status = Awaited<ReturnType<typeof boardsApi.google>>;

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "ещё нет");

/**
 * Google Календарь сотрудника: подключает каждый сам (свой аккаунт Google). Задачи со сроком — в отдельном календаре
 * «MyBooks CRM», перенос и переименование в Google возвращаются в CRM. Только название и ссылка на карточку.
 */
export function GoogleCalendar({ initial, notice }: { initial: Status; notice: string | null }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!notice) return;
    if (notice === "connected") toast("Google Календарь подключён: задачи появятся в календаре «MyBooks CRM»");
    else toast(notice, "error");
    const u = new URL(window.location.href);
    u.searchParams.delete("google");
    window.history.replaceState(window.history.state, "", u);
  }, [notice]);
  const sync = async () => {
    setBusy(true);
    try {
      const r = await boardsApi.googleSync();
      setS(await boardsApi.google());
      toast(r.changes ? `Синхронизировано изменений: ${r.changes}` : "Всё уже совпадает");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    if (!(await confirmDialog({ title: "Отключить Google Календарь?", text: "Календарь «MyBooks CRM» удалится из вашего Google, задачи в CRM останутся.", confirmLabel: "Отключить", danger: true }))) return;
    try {
      await boardsApi.googleDisconnect();
      setS(await boardsApi.google());
      toast("Google Календарь отключён");
    } catch (e) {
      toastError(e);
    }
  };
  if (!s.connected)
    return (
      <div className="flex flex-col gap-3 text-[13px]">
        <p className="text-muted">Задачи со сроком — в отдельном календаре «MyBooks CRM» в вашем Google. Перенесли или переименовали событие в Google — поменяется и задача. Встречам можно добавить Google Meet.</p>
        <a href="/api/integrations/google/connect" className="btn btn-dark btn-sm self-start">
          Подключить Google Календарь
        </a>
        <p className="text-xs text-muted">Google покажет, что MyBooks получит доступ только к календарям, которые создаст сам, — ваш основной календарь CRM не видит.</p>
      </div>
    );
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <p className="flex items-center gap-1.5 font-medium">
        <CheckCircle2 className="size-4 text-success" aria-hidden /> Подключён {s.email ?? ""}
      </p>
      {s.error ? <p className="rounded-[var(--r-ctl)] bg-danger-bg px-2.5 py-1.5 text-xs text-danger">{s.error.replace(/^revoked:\s*/, "")}</p> : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">В Google</dt>
        <dd>{when(s.lastPushAt)}</dd>
        <dt className="text-muted">Из Google</dt>
        <dd>
          {when(s.lastPullAt)} · {s.push ? "мгновенно" : "раз в 10 минут"}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-outline btn-sm" onClick={sync} disabled={busy}>
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Синхронизировать
        </button>
        {s.error?.startsWith("revoked") ? (
          <a href="/api/integrations/google/connect" className="btn btn-dark btn-sm">
            Подключить заново
          </a>
        ) : null}
        <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={disconnect}>
          <Unlink className="size-4" aria-hidden /> Отключить
        </button>
      </div>
    </div>
  );
}
