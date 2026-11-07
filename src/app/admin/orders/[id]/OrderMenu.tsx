"use client";

import Link from "next/link";
import { ClipboardList, Eye, Handshake, MessageCircle, UserRound } from "lucide-react";
import { ActionMenu, menuItemClass } from "@/components/admin/ActionMenu";

/**
 * «Ещё» в шапке заказа: переходы к связанному — клиент, сделка, чат, макет книги — и упаковочный лист (печатный вид, в новой
 * вкладке). Главное действие по статусу (NextStep) остаётся отдельной кнопкой; здесь — то, что нужно реже.
 */
export function OrderMenu({ clientHref, dealHref, dealLabel, chatHref, previewHref, printHref }: { clientHref?: string; dealHref?: string; dealLabel?: string; chatHref?: string; previewHref: string; printHref?: string }) {
  return (
    <ActionMenu>
      {clientHref ? (
        <Link href={clientHref} role="menuitem" className={menuItemClass}>
          <UserRound aria-hidden /> Карточка клиента
        </Link>
      ) : null}
      {dealHref ? (
        <Link href={dealHref} role="menuitem" className={menuItemClass}>
          <Handshake aria-hidden /> {dealLabel ?? "Сделка"}
        </Link>
      ) : null}
      {chatHref ? (
        <Link href={chatHref} role="menuitem" className={menuItemClass}>
          <MessageCircle aria-hidden /> Чат с клиентом
        </Link>
      ) : null}
      <Link href={previewHref} role="menuitem" className={menuItemClass}>
        <Eye aria-hidden /> Предпросмотр книги
      </Link>
      {printHref ? (
        <a href={printHref} target="_blank" rel="noopener" role="menuitem" className={menuItemClass}>
          <ClipboardList aria-hidden /> Упаковочный лист
        </a>
      ) : null}
    </ActionMenu>
  );
}
