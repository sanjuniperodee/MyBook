"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, X } from "lucide-react";
import { Field } from "@/components/ui/Field";
import { createTemplateAction } from "@/app/admin/chats/actions";
import { toast } from "@/components/ui/overlays";

/**
 * «В шаблон»: быстрый ответ из выбранных сообщений. Текст можно поправить, подстановки {имя}, {заказ}, {ссылка} —
 * как в настройках. Шаблон личный: виден только вам, править его можно на странице «Шаблоны».
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
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-[20px] bg-white shadow-lift sm:rounded-[20px]" role="dialog" aria-modal="true" aria-label="Новый шаблон">
        <div className="flex min-h-14 items-center gap-2 border-b border-line py-2 pr-2 pl-5">
          
          <h2 className="flex-1 text-[15px] font-semibold">Новый шаблон</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon btn-sm max-lg:size-11" aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto p-5">
          <Field label="Название" hint="По нему шаблон находится в чате: «/» и начало названия.">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Например, «Реквизиты доставки»" className="input text-sm" />
          </Field>
          <Field label="Текст" hint={<>Подстановки: {"{имя}"}, {"{заказ}"}, {"{ссылка}"}. Шаблон будет только у вас — править его можно на странице «Шаблоны».</>}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={8} className="input text-sm" />
          </Field>
        </div>
        <div className="border-t border-line px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4">
          <button type="button" className="btn btn-dark w-full" disabled={!title.trim() || !text.trim() || saving} onClick={save}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : null} Создать шаблон
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
