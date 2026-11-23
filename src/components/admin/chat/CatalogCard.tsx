"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, ShoppingBag, ShoppingCart, Store } from "lucide-react";
import { orderItemsAction } from "@/app/admin/catalog/actions";
import { toast } from "@/components/ui/overlays";
import { formatPrice, type MessageCard } from "@/modules/messaging/domain/catalog";

/**
 * Карточка WhatsApp в ленте чата (docs/whatsapp-catalog.md): товар из каталога (отправил менеджер или прислал клиент),
 * корзина клиента (состав — по кнопке, его отдаёт WhatsApp) или ссылка на весь каталог.
 */
export function CatalogCard({ card, image, messageId }: { card: MessageCard; image: string | null; messageId: string }) {
  if (card.kind === "product") return <ProductCardView card={card} image={image} />;
  if (card.kind === "order") return <OrderCardView card={card} messageId={messageId} />;
  return (
    <a href={card.url} target="_blank" rel="noopener noreferrer" className="mb-1 flex min-w-56 items-center gap-3 rounded-[10px] border border-line bg-white/70 p-2 hover:border-line-strong" data-testid="chat-card-catalog">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-soft">
        <Store className="size-5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">Каталог WhatsApp</span>
        <span className="block truncate text-xs text-muted">{card.url.replace("https://", "")}</span>
      </span>
    </a>
  );
}

function ProductCardView({ card, image }: { card: Extract<MessageCard, { kind: "product" }>; image: string | null }) {
  const [broken, setBroken] = useState(false);
  const src = image ?? `/api/admin/catalog/${card.productId}/image`;
  const price = formatPrice(card.price, card.currency);
  return (
    <div className="mb-1 w-64 max-w-full overflow-hidden rounded-[10px] border border-line bg-white/70" data-testid="chat-card-product">
      {!broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- фото товара: копия каталога у нас
        <img src={src} alt="" className="aspect-square w-full object-cover" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      ) : (
        <div className="flex aspect-[2/1] w-full items-center justify-center bg-sunken text-muted">
          <ShoppingBag className="size-8" strokeWidth={1.5} aria-hidden />
        </div>
      )}
      <div className="space-y-0.5 p-2.5">
        <div className="text-sm font-medium leading-snug">{card.name || "Товар"}</div>
        {price ? <div className="text-sm text-ink-soft">{price}</div> : null}
        {card.description ? <div className="line-clamp-2 text-xs text-muted">{card.description}</div> : null}
        <div className="pt-0.5 text-[11px] text-muted">Товар из каталога WhatsApp{card.retailerId ? ` · арт. ${card.retailerId}` : ""}</div>
      </div>
    </div>
  );
}

function OrderCardView({ card, messageId }: { card: Extract<MessageCard, { kind: "order" }>; messageId: string }) {
  const [items, setItems] = useState(card.items ?? null);
  const [pending, start] = useTransition();
  const total = formatPrice(card.total, card.currency);
  const load = () =>
    start(async () => {
      const r = await orderItemsAction(messageId);
      if (!r.ok) return toast(r.error, "error");
      setItems(r.items);
    });
  return (
    <div className="mb-1 w-64 max-w-full rounded-[10px] border border-line bg-white/70 p-2.5" data-testid="chat-card-order">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShoppingCart className="size-4 text-wine" aria-hidden /> Заказ из каталога
      </div>
      <div className="mt-0.5 text-xs text-muted">
        {card.itemCount ? `Товаров: ${card.itemCount}` : "Корзина"}
        {total ? ` · ${total}` : ""}
      </div>
      {items ? (
        <ul className="mt-2 space-y-1 border-t border-line pt-2 text-xs">
          {items.map((i, n) => (
            <li key={n} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">
                {i.name} × {i.quantity}
              </span>
              <span className="shrink-0 text-muted">{formatPrice(i.price, card.currency)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm mt-1 -ml-2" disabled={pending} onClick={load}>
          {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null} Показать состав
        </button>
      )}
    </div>
  );
}
