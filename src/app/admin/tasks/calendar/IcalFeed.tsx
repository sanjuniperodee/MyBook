"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, RefreshCw, Unlink } from "lucide-react";
import { confirmDialog, toast, toastError } from "@/components/ui/overlays";
import { boardsApi } from "../boards/client";

/**
 * Личная iCal-ссылка: подписка в Google, Apple или Outlook Календаре (только чтение, обновляется календарём сам раз
 * в несколько часов у Google, чаще у Apple). Ссылку показываем один раз; новая отзывает прежнюю.
 */
export function IcalFeed() {
  const [status, setStatus] = useState<{ active: boolean; createdAt: string | null; lastUsedAt: string | null } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    boardsApi.feed().then(setStatus, () => {});
  }, []);
  const issue = async () => {
    if (status?.active && !(await confirmDialog({ title: "Выдать новую ссылку?", text: "Прежняя перестанет работать — в календаре её нужно будет заменить.", confirmLabel: "Новая ссылка" }))) return;
    try {
      const r = await boardsApi.issueFeed();
      setUrl(r.url);
      setStatus({ active: true, createdAt: new Date().toISOString(), lastUsedAt: null });
    } catch (e) {
      toastError(e);
    }
  };
  const revoke = async () => {
    if (!(await confirmDialog({ title: "Отключить ссылку?", text: "Календари перестанут получать ваши задачи.", confirmLabel: "Отключить", danger: true }))) return;
    try {
      await boardsApi.revokeFeed();
      setUrl(null);
      setStatus({ active: false, createdAt: null, lastUsedAt: null });
      toast("Ссылка отключена");
    } catch (e) {
      toastError(e);
    }
  };
  const webcal = url?.replace(/^https?:/, "webcal:");
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <p className="text-muted">Ваши задачи со сроком (где вы исполнитель) в любом календаре: только название и ссылка на карточку, без данных клиента.</p>
      {url ? (
        <>
          <div className="flex gap-1.5">
            <input readOnly value={url} onFocus={(e) => e.target.select()} className="input h-8 min-w-0 flex-1 font-mono text-xs" aria-label="Ссылка на календарь" />
            <button type="button" className="btn btn-dark btn-sm" onClick={() => navigator.clipboard?.writeText(url).then(() => toast("Скопировано"))}>
              <Copy className="size-4" aria-hidden /> Копировать
            </button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-soft">
            <li>
              Google Календарь на компьютере: «Другие календари» → «+» → «Добавить по URL» → вставьте ссылку. Обновляется раз в несколько часов.
            </li>
            <li>
              iPhone и Mac:{" "}
              <a href={webcal} className="text-wine underline">
                подписаться
              </a>{" "}
              (или «Настройки» → «Календарь» → «Учётные записи» → «Подписной календарь»).
            </li>
            <li>Ссылку видно только сейчас — сохраните её в календаре. Это ваш личный ключ: никому не пересылайте.</li>
          </ol>
        </>
      ) : status?.active ? (
        <p className="text-ink-soft">
          Ссылка выдана {status.createdAt ? new Date(status.createdAt).toLocaleDateString("ru-RU") : ""}
          {status.lastUsedAt ? `, календарь обновлялся ${new Date(status.lastUsedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ", календарь ещё не обращался"}.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-outline btn-sm" onClick={issue}>
          {status?.active ? <RefreshCw className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />} {status?.active ? "Новая ссылка" : "Получить ссылку"}
        </button>
        {status?.active ? (
          <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={revoke}>
            <Unlink className="size-4" aria-hidden /> Отключить
          </button>
        ) : null}
      </div>
    </div>
  );
}
