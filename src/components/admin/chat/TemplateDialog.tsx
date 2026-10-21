"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, MessageSquareQuote, X } from "lucide-react";
import { createTemplateAction } from "@/app/admin/chats/actions";
import { toast } from "@/components/ui/overlays";

/**
 * «В шаблон»: быстрый ответ из выбранных сообщений. Текст можно поправить, подстановки {имя}, {заказ}, {ссылка} —
 * как в настройках. Шаблоны общие: появятся в «Шаблонах» у всех, кто отвечает клиентам.
 */
export function TemplateDialog({ initialText, onClose, onDone }: { initialText: string; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(() => initialText.replace(/\s+/g, " ").trim().slice(0, 40));
  const [text, setText] = useState(initialText);
  const [saving, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () =>
    start(async () => {
      const r = await createTemplateAction(title, text);
      if (r.error) return toast(r.error, "error");
      toast("Шаблон создан", "success");
      onDone();
    });

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label="Новый шаблон">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <MessageSquareQuote className="size-5 text-wine" />
          <h2 className="flex-1 font-semibold">Новый шаблон</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted hover:bg-cream" aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto p-4">
          <label className="block text-xs font-medium text-ink-soft">
            Название
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Например, «Реквизиты доставки»" className="input mt-1 w-full text-sm" />
          </label>
          <label className="block text-xs font-medium text-ink-soft">
            Текст
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={8} className="input mt-1 w-full text-sm" />
          </label>
          <p className="text-[11px] text-muted">Подстановки: {"{имя}"}, {"{заказ}"}, {"{ссылка}"}. Шаблон увидят все сотрудники, которые отвечают клиентам.</p>
        </div>
        <div className="border-t border-line p-3">
          <button type="button" className="btn w-full" disabled={!title.trim() || !text.trim() || saving} onClick={save}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : null} Создать шаблон
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
