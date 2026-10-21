"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, Forward, LoaderCircle, Search, X } from "lucide-react";
import { forwardMessageAction, forwardTargetsAction } from "@/app/admin/chats/actions";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";

type Target = Awaited<ReturnType<typeof forwardTargetsAction>>[number];

/**
 * «Переслать»: поиск по диалогам, которые сотрудник ведёт, выбор до 10, отправка одного или нескольких сообщений
 * (по порядку, как в ленте). Вложение уходит тем же файлом, в WhatsApp — с пометкой «Пересланное». Итог — уведомлением
 * (куда не ушло и почему).
 */
export function ForwardDialog({ conversationId, messageIds, preview, onClose, onDone }: { conversationId: string; messageIds: string[]; preview: string; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Target[] | null>(null);
  const [picked, setPicked] = useState<Map<string, Target>>(new Map());
  const [sending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      void forwardTargetsAction(q).then((r) => alive && setList(r.filter((c) => c.id !== conversationId)));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q, conversationId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (c: Target) =>
    setPicked((m) => {
      const n = new Map(m);
      if (n.has(c.id)) n.delete(c.id);
      else if (n.size < 10) n.set(c.id, c);
      return n;
    });

  const send = () =>
    start(async () => {
      const failed = new Set<string>();
      let ok = 0;
      for (const id of messageIds) {
        const r = await forwardMessageAction(conversationId, id, [...picked.keys()]);
        if (r.error) {
          failed.add(r.error);
          continue;
        }
        ok++;
        r.failed?.forEach((f) => failed.add(`${f.title} — ${f.error}`));
      }
      if (!ok) return toast([...failed].join("; ") || "Не переслалось", "error");
      if (failed.size) toast(`Переслано: ${ok} из ${messageIds.length}. Не ушло: ${[...failed].join("; ")}`, "error");
      else toast(messageIds.length === 1 ? (picked.size === 1 ? "Переслано" : `Переслано в ${picked.size} диалога`) : `Переслано сообщений: ${messageIds.length}`, "success");
      onDone();
    });

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label="Переслать сообщения">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Forward className="size-5 text-wine" />
          <h2 className="flex-1 font-semibold">Переслать</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted hover:bg-cream" aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>
        <p className="mx-4 mt-3 line-clamp-2 rounded-lg bg-cream/60 px-3 py-2 text-xs text-ink-soft">{preview}</p>
        <div className="relative mx-4 mt-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя или номер" className="h-10 w-full rounded-xl border border-line bg-[#f7f4ef] pr-3 pl-9 text-sm outline-none focus:border-wine/40" />
        </div>
        {picked.size ? (
          <div className="mx-4 mt-2 flex flex-wrap gap-1.5">
            {[...picked.values()].map((c) => (
              <button key={c.id} type="button" onClick={() => toggle(c)} className="flex items-center gap-1 rounded-full bg-wine px-2.5 py-1 text-xs text-white">
                {c.title} <X className="size-3" />
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-2 min-h-40 flex-1 overflow-y-auto px-2">
          {list === null ? (
            <p className="flex justify-center py-8 text-muted">
              <LoaderCircle className="size-5 animate-spin" />
            </p>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Диалогов не нашлось</p>
          ) : (
            list.map((c) => {
              const on = picked.has(c.id);
              return (
                <button key={c.id} type="button" onClick={() => toggle(c)} className={cn("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-cream/60", on && "bg-rose/40")}>
                  <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", on ? "border-wine bg-wine text-white" : "border-line")}>{on ? <Check className="size-3.5" /> : null}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {c.channel}
                      {c.last ? ` · ${c.last}` : ""}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="border-t border-line p-3">
          <button type="button" className="btn w-full" disabled={!picked.size || sending} onClick={send}>
            {sending ? <LoaderCircle className="size-4 animate-spin" /> : <Forward className="size-4" />} Переслать{picked.size ? ` (${picked.size})` : ""}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
