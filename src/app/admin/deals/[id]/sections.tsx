import Link from "next/link";
import { ExternalLink, Package, PhoneIncoming, PhoneMissed, PhoneOutgoing, UserRound } from "lucide-react";
import type { Permission } from "@/shared/domain/permissions";
import { channelLabel } from "@/modules/messaging";
import { formatPrice } from "@/config/site";
import { orderStatusColors, orderStatusLabel, isPrintedPlan } from "@/modules/ordering/ui/status";
import type { NoteItem } from "@/components/admin/CrmWidgets";
import type { OrderStatus } from "@/shared/domain/orders";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import { getTheme } from "@/lib/content/themes";
import { bookKind } from "@/lib/content/kinds";
import { bookLine, progressRatio, progressText } from "@/lib/content/crm-labels";
import type { dealScreen } from "@/modules/reporting/ui/deal-screen";
import { DuplicateRow, LinkClient } from "./DealControls";

type Screen = ReturnType<typeof dealScreen>;
const callIcons = { out: PhoneOutgoing, missed: PhoneMissed, in: PhoneIncoming };

/** Другие сделки того же контакта — объединить, если это дубль. */
export function Duplicates({ dealId, duplicates, canMerge }: { dealId: string; duplicates: { deal: { id: string; number: number; title: string; createdAt: Date; assigneeId: string | null }; stage: { name: string; color: string } }[]; canMerge: (assigneeId: string | null) => boolean }) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4" data-testid="duplicates">
      <h2 className="text-sm font-semibold text-amber-900">Похоже на дубль: у этого контакта есть другие сделки</h2>
      <div className="mt-2 divide-y divide-amber-200/70">
        {duplicates.map(({ deal: d, stage: st }) => (
          <DuplicateRow
            key={d.id}
            targetId={dealId}
            other={{ id: d.id, number: d.number, title: d.title, stage: st.name, color: st.color, created: formatDate(d.createdAt) }}
            canMerge={canMerge(d.assigneeId)}
          />
        ))}
      </div>
    </section>
  );
}

/** Книги клиента по сделке: прогресс ответов и фото. */
export function DealBooks({ books, seen }: { books: { id: string; title: string | null; theme: string; authorName: string; recipientName: string | null; status: string; answered: number; total: number; words: number; photos: number; updatedAt: Date }[]; seen: Date | null }) {
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-white p-5 text-sm" data-testid="deal-books">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Книга клиента</h2>
        {seen ? <span className="text-xs text-muted">заходил {formatDate(seen, true)}</span> : null}
      </div>
      {books.map((b) => (
        <div key={b.id}>
          <div className="flex items-baseline justify-between gap-2">
            <Link href={`/books/${b.id}/preview`} className="truncate font-medium hover:text-wine">
              {b.title || (b.recipientName && bookKind(b.theme) !== "autobiography" ? `Для: ${b.recipientName}` : "Без названия")}
            </Link>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px]", b.status === "draft" ? "bg-cream text-ink-soft" : "bg-emerald-100 text-emerald-800")}>{b.status === "draft" ? "пишется" : "заказана"}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cream">
            <div className="h-full rounded-full bg-wine" style={{ width: `${Math.round(progressRatio(b) * 100)}%` }} />
          </div>
          <div className="text-xs text-muted">{bookLine({ theme: b.theme, themeShort: getTheme(b.theme).name, authorName: b.authorName, recipientName: b.recipientName ?? "" })}</div>
          <div className="mt-1 text-xs text-muted tabular-nums">
            {progressText(b)} · {b.photos} фото · изм. {formatDate(b.updatedAt)}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Связи сделки: канал привлечения, клиент (или предложить связать), заказ, переписки. */
export function DealLinks({
  dealId,
  channel,
  client,
  suggested,
  order,
  convs,
  canEdit,
  can,
  emailOf,
}: {
  dealId: string;
  channel: Screen["channel"];
  client: { id: string; name: string | null; email: string } | null;
  suggested: { id: string; name: string | null; email: string } | null;
  order: { id: string; number: number; amount: number; status: OrderStatus; plan: string } | null;
  convs: { id: string; channel: string; unread: number }[];
  canEdit: boolean;
  can: (p: Permission) => boolean;
  /** E-mail с учётом прав на контакты (маска). */
  emailOf: (email: string) => string;
}) {
  return (
    <section className="space-y-2 rounded-2xl border border-line bg-white p-5 text-sm">
      <h2 className="mb-1 font-semibold">Связи</h2>
      <div className="flex items-baseline justify-between gap-2" data-testid="deal-channel">
        <span className="text-muted">Канал</span>
        <span className="text-right">
          <span className="font-medium">{channel.label}</span>
          {channel.details ? <span className="block text-xs text-muted">{channel.details}</span> : null}
        </span>
      </div>
      {client && can("clients.view") ? (
        <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-2 hover:text-wine">
          <UserRound className="size-4 text-muted" /> {client.name || emailOf(client.email)}
          <ExternalLink className="ml-auto size-3.5 text-muted" />
        </Link>
      ) : suggested && canEdit && can("clients.view") ? (
        <LinkClient dealId={dealId} client={{ id: suggested.id, label: suggested.name || emailOf(suggested.email) }} />
      ) : (
        <p className="text-muted">Клиент ещё не зарегистрирован на сайте — свяжем автоматически по телефону, когда он оформит заказ.</p>
      )}
      {order && can("orders.view") ? (
        <Link href={`/admin/orders/${order.id}`} className="flex items-center gap-2 hover:text-wine">
          <Package className="size-4 text-muted" /> Заказ №{order.number} · {formatPrice(order.amount)}
          <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px]", orderStatusColors[order.status])}>{orderStatusLabel(order.status, "ru", isPrintedPlan(order.plan))}</span>
        </Link>
      ) : null}
      {convs.map((c) => (
        <Link key={c.id} href={`/admin/chats?c=${c.id}`} className="flex items-center gap-2 text-muted hover:text-wine">
          💬 {channelLabel(c.channel)} {c.unread ? <span className="rounded-full bg-emerald-600 px-1.5 text-[11px] text-white">{c.unread}</span> : null}
        </Link>
      ))}
    </section>
  );
}

/** Звонки по сделке, с записью — если есть право слушать. */
export function DealCalls({ calls, canListen }: { calls: Screen["calls"]; canListen: boolean }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-3 font-semibold">Звонки</h2>
      <ul className="divide-y divide-line text-sm">
        {calls.map((c) => {
          const Icon = callIcons[c.icon];
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <Icon className={cn("size-4", c.missed ? "text-red-600" : "text-muted")} />
              <span className="w-32 text-muted">{c.when}</span>
              <span className="flex-1">
                {c.label}
                {c.duration ? ` · ${c.duration}` : ""}
                {c.staff !== undefined ? <span className="text-muted"> · {c.staff}</span> : null}
              </span>
              {c.hasRecording && canListen ? <audio controls preload="none" src={`/api/admin/calls/${c.id}/recording`} className="h-8 w-56" /> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function NotesTimelineReadonly({ notes }: { notes: NoteItem[] }) {
  return (
    <ol className="space-y-3 text-sm">
      {notes.map((n) => (
        <li key={n.id}>
          <div className="text-xs text-muted">
            {n.author} · {n.dateLabel}
          </div>
          <p className="whitespace-pre-line">{n.text}</p>
        </li>
      ))}
      {notes.length === 0 ? <p className="text-muted">Записей нет.</p> : null}
    </ol>
  );
}
