"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, Search, ShoppingBag, Store, X } from "lucide-react";
import { chatProductsAction, sendCatalogLinkAction, sendProductAction } from "@/app/admin/catalog/actions";
import { toast } from "@/components/ui/overlays";
import { formatPrice } from "@/modules/messaging/domain/catalog";

type Item = { id: string; name: string; price: number | null; currency: string; hidden: boolean; image: boolean };

/**
 * «Товар из каталога» в чате: товары каталога WhatsApp с фото и ценой — нажатие отправляет клиенту карточку товара
 * (он откроет её в WhatsApp); «Весь каталог» — ссылка на каталог магазина с превью.
 */
export function CatalogPicker({ conversationId, onClose, onSent }: { conversationId: string; onClose: () => void; onSent: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    let alive = true;
    chatProductsAction()
      .then((r) => {
        if (!alive) return;
        if (!r.ok) return setError(r.error);
        if (!r.enabled) return setError("Каталог в чатах выключен: «Интеграции» → «Мессенджеры» → «Каталог WhatsApp»");
        setItems(r.products);
      })
      .catch(() => alive && setError("Не удалось загрузить каталог"));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (items ?? []).filter((i) => !t || i.name.toLowerCase().includes(t));
  }, [items, q]);

  const send = (key: string, run: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) => {
    setSending(key);
    start(async () => {
      const r = await run().catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Не отправилось" }));
      setSending(null);
      if (!r.ok) return toast(r.error, "error");
      toast(done, "success");
      onSent();
      onClose();
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-[20px] bg-white shadow-lift sm:rounded-[20px]" role="dialog" aria-modal="true" aria-label="Товар из каталога" data-testid="catalog-picker">
        <div className="flex min-h-14 items-center gap-2 border-b border-line py-2 pr-2 pl-5">
          <h2 className="flex-1 text-[15px] font-semibold">Товар из каталога</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon btn-sm max-lg:size-11" aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>
        {error ? (
          <p className="p-5 text-sm text-danger">{error}</p>
        ) : !items ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Загружаем каталог…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <Search className="size-4 text-muted" aria-hidden />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти товар" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </div>
            <ul className="flex-1 divide-y divide-line overflow-y-auto">
              {shown.map((i) => (
                <li key={i.id}>
                  <button type="button" disabled={!!sending} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunken disabled:opacity-60" onClick={() => send(i.id, () => sendProductAction(conversationId, i.id), "Товар отправлен клиенту")}>
                    <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-sunken">
                      {i.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- обложка товара из копии каталога
                        <img src={`/api/admin/catalog/${i.id}/image`} alt="" className="size-full object-cover" loading="lazy" />
                      ) : (
                        <ShoppingBag className="m-3 size-6 text-muted" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{i.name}</span>
                      <span className="block text-xs text-muted">
                        {formatPrice(i.price, i.currency) || "Без цены"}
                        {i.hidden ? " · скрыт" : ""}
                      </span>
                    </span>
                    {sending === i.id ? <LoaderCircle className="size-4 animate-spin text-muted" aria-hidden /> : <span className="text-xs text-wine">Отправить</span>}
                  </button>
                </li>
              ))}
              {!shown.length ? <li className="p-5 text-sm text-muted">{items.length ? "Ничего не нашлось" : "В каталоге пока нет товаров — их добавляют в разделе «Каталог WhatsApp»."}</li> : null}
            </ul>
          </>
        )}
        <div className="border-t border-line px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4">
          <button type="button" className="btn btn-outline w-full" disabled={!!sending || !!error} onClick={() => send("all", () => sendCatalogLinkAction(conversationId), "Ссылка на каталог отправлена")}>
            {sending === "all" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Store className="size-4" aria-hidden />} Отправить весь каталог ссылкой
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
