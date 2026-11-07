import Link from "next/link";
import { ChevronRight, Copy, MessageCircle, Package, PhoneIncoming, PhoneMissed, PhoneOutgoing, UserRound } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Facts } from "@/components/ui/Facts";
import { StageLabel } from "../StageLabel";
import type { Permission } from "@/shared/domain/permissions";
import { channelLabel } from "@/modules/messaging";
import { formatPrice } from "@/config/site";
import { orderStatusColors, orderStatusLabel, isPrintedPlan } from "@/modules/ordering/ui/status";
import { DraftActions, type NoteItem } from "@/components/admin/CrmWidgets";
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

type RelatedDeal = { deal: { id: string; number: number; title: string; amount: number; createdAt: Date; closedAt: Date | null; assigneeId: string | null }; stage: { name: string; color: string } };
/** merge — «Объединить сюда» доступно (null — нет: права или правило слияния); cancels — счета, которые слияние отменит. */
type OpenDeal = RelatedDeal & { merge: { cancels: string[] } | null };

/**
 * Другие открытые сделки того же контакта. Эта сделка открыта — «Похоже на дубль»: объединить, если это дубль. Закрыта —
 * «Текущие заявки контакта»: это новые продажи, их ведут отдельно, а не вливают в прошлую покупку (иначе заявка уйдёт из
 * работы, плана и воронки). «Объединить сюда» здесь — только у заявки той же покупки (успешная сделка с заказом, заявка
 * пришла рядом с ним — mergeRefusal), например переписки из WhatsApp о заказе с сайта.
 */
export function Duplicates({ dealId, closed, duplicates }: { dealId: string; closed: boolean; duplicates: OpenDeal[] }) {
  const rows = duplicates.map(({ deal: d, stage: st, merge }) => (
    <DuplicateRow key={d.id} targetId={dealId} intoClosed={closed} other={{ id: d.id, number: d.number, title: d.title, stage: st.name, color: st.color, created: formatDate(d.createdAt) }} merge={merge} />
  ));
  if (closed)
    return (
      <section className="panel px-4 py-3.5 sm:px-5" data-testid="current-deals">
        <h2 className="panel-title">Текущие заявки контакта</h2>
        <p className="mt-0.5 text-sm text-muted">
          Эта сделка закрыта. Новые заявки — новые продажи: ведите их отдельно.
          {duplicates.some((d) => d.merge) ? " Объединить можно только заявку той же покупки — пришедшую рядом с заказом этой сделки." : ""}
        </p>
        <div className="mt-1 divide-y divide-line">{rows}</div>
      </section>
    );
  return (
    <section className="rounded-[var(--r-panel)] border border-warning/30 bg-warning-bg px-4 py-3.5 sm:px-5" data-testid="duplicates">
      <h2 className="flex items-start gap-2 text-[15px] font-semibold text-warning">
        <Copy className="mt-0.5 size-4 shrink-0" aria-hidden /> Похоже на дубль: у этого контакта есть другие открытые сделки
      </h2>
      <div className="mt-1 divide-y divide-warning/20">{rows}</div>
    </section>
  );
}

/**
 * Закрытые сделки того же контакта (успех или отказ): прошлые покупки — для контекста, их не сливают. Только те, что
 * сотрудник видит (canSee — его ответственность или «все сделки»): у роли «только свои» название и сумма чужой сделки
 * не показываются, как и сама сделка по ссылке.
 */
export function PastDeals({ deals, canSee }: { deals: RelatedDeal[]; canSee: (assigneeId: string | null) => boolean }) {
  const visible = deals.filter((r) => canSee(r.deal.assigneeId));
  if (!visible.length) return null;
  return (
    <Panel flush title="Прошлые сделки контакта" className="text-sm" id="past-deals">
      <ul className="divide-y divide-line" data-testid="past-deals">
        {visible.map(({ deal: d, stage: st }) => (
          <li key={d.id}>
            <Link href={`/admin/deals/${d.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-sunken/60 sm:px-5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  №{d.number} {d.title}
                </span>
                <span className="text-xs text-muted tabular-nums">
                  {formatDate(d.closedAt ?? d.createdAt)}
                  {d.amount ? ` · ${formatPrice(d.amount)}` : ""}
                </span>
              </span>
              <StageLabel name={st.name} color={st.color} className="shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Книги клиента по сделке: прогресс ответов и фото. */
export function DealBooks({ books, seen }: { books: { id: string; title: string | null; theme: string; authorName: string; recipientName: string | null; status: string; answered: number; total: number; words: number; photos: number; updatedAt: Date }[]; seen: Date | null }) {
  return (
    <Panel title="Книга клиента" description={seen ? `Клиент заходил ${formatDate(seen, true)}` : undefined} className="text-sm">
      <ul className="space-y-4" data-testid="deal-books">
        {books.map((b) => (
          <li key={b.id}>
            <div className="flex items-start justify-between gap-2">
              <Link href={`/books/${b.id}/preview`} className="min-w-0 truncate font-medium hover:text-wine">
                {b.title || (b.recipientName && bookKind(b.theme) !== "autobiography" ? `Для: ${b.recipientName}` : "Без названия")}
              </Link>
              <Badge tone={b.status === "draft" ? "neutral" : "success"} className="shrink-0">
                {b.status === "draft" ? "пишется" : "заказана"}
              </Badge>
            </div>
            <div className="text-xs text-muted">{bookLine({ theme: b.theme, themeShort: getTheme(b.theme).name, authorName: b.authorName, recipientName: b.recipientName ?? "" })}</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-wine" style={{ width: `${Math.round(progressRatio(b) * 100)}%` }} />
            </div>
            <div className="mt-1 text-xs text-muted tabular-nums">
              {progressText(b)} · {b.photos} фото · изм. {formatDate(b.updatedAt)}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * Контакт и связи сделки одним листом «подпись — значение»: телефон и почта (или маска), ответственный, «писать первым»,
 * клиент (или предложить связать), заказ, переписки и канал привлечения. Ответственного и переключатель передаёт страница.
 */
export function DealContact({
  dealId,
  extraPhones,
  assignee,
  noMarketing,
  channel,
  client,
  suggested,
  order,
  convs,
  canEdit,
  can,
  emailOf,
  actions,
  children,
}: {
  dealId: string;
  extraPhones: string[];
  assignee: React.ReactNode;
  noMarketing: React.ReactNode;
  channel: Screen["channel"];
  client: { id: string; name: string | null; email: string } | null;
  suggested: { id: string; name: string | null; email: string } | null;
  order: { id: string; number: number; amount: number; status: OrderStatus; plan: string } | null;
  convs: { id: string; channel: string; unread: number }[];
  canEdit: boolean;
  can: (p: Permission) => boolean;
  /** E-mail с учётом прав на контакты (маска). */
  emailOf: (email: string) => string;
  /** Верх листа: ссылка «Карточка клиента». */
  actions?: React.ReactNode;
  /** Скрытый контакт или обычные телефон и почта — как их показывает страница. */
  children?: React.ReactNode;
}) {
  const link = "inline-flex min-h-8 max-w-full items-center gap-1.5 hover:text-wine";
  return (
    <Panel title="Контакт и связи" actions={actions}>
      <Facts
        items={[
          { label: "Контакт", value: children },
          { label: "Ответственный", value: assignee },
          { label: "Писать первым", value: noMarketing },
          {
            label: "Клиент",
            value:
              client && can("clients.view") ? (
                <Link href={`/admin/clients/${client.id}`} className={link}>
                  <UserRound className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="truncate font-medium">{client.name || emailOf(client.email)}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              ) : suggested && canEdit && can("clients.view") ? (
                <LinkClient dealId={dealId} client={{ id: suggested.id, label: suggested.name || emailOf(suggested.email) }} />
              ) : (
                <span className="text-muted">Ещё не зарегистрирован на сайте — свяжем по телефону, когда оформит заказ.</span>
              ),
          },
          {
            label: "Заказ",
            hidden: !(order && can("orders.view")),
            value: order ? (
              <Link href={`/admin/orders/${order.id}`} className={link}>
                <Package className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="truncate">
                  №{order.number} · <span className="tabular-nums">{formatPrice(order.amount)}</span>
                </span>
                <span className={cn("badge shrink-0", orderStatusColors[order.status])}>{orderStatusLabel(order.status, "ru", isPrintedPlan(order.plan))}</span>
              </Link>
            ) : null,
          },
          {
            label: "Переписка",
            hidden: convs.length === 0,
            value: (
              <span className="flex flex-col">
                {convs.map((c) => (
                  <Link key={c.id} href={`/admin/chats?c=${c.id}`} className={link}>
                    <MessageCircle className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="truncate">{channelLabel(c.channel)}</span>
                    {c.unread ? (
                      <span className="count count-alert" title={`Непрочитанных сообщений: ${c.unread}`}>
                        {c.unread}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </span>
            ),
          },
          {
            label: "Канал",
            value: (
              <span data-testid="deal-channel">
                <span className="font-medium">{channel.label}</span>
                {channel.details ? <span className="block truncate text-xs text-muted">{channel.details}</span> : null}
              </span>
            ),
          },
        ]}
      />
      {extraPhones.length ? <p className="mt-2 text-xs text-muted tabular-nums">Ещё телефоны: {extraPhones.join(", ")}</p> : null}
    </Panel>
  );
}

/** Звонки по сделке, с записью — если есть право слушать. */
export function DealCalls({ calls, canListen }: { calls: Screen["calls"]; canListen: boolean }) {
  return (
    <ul className="divide-y divide-line overflow-y-auto text-sm">
      {calls.map((c) => {
        const Icon = callIcons[c.icon];
        return (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <Icon className={cn("size-4 shrink-0", c.missed ? "text-danger" : "text-muted")} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className={cn("block", c.missed && "text-danger")}>
                {c.label}
                {c.duration ? <span className="text-muted tabular-nums"> · {c.duration}</span> : null}
              </span>
              <span className="block text-xs text-muted">
                {c.when}
                {c.staff !== undefined ? ` · ${c.staff}` : ""}
              </span>
            </span>
            {c.hasRecording && canListen ? <audio controls preload="none" src={`/api/admin/calls/${c.id}/recording`} className="h-9 w-full" /> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function NotesTimelineReadonly({ notes, whatsappTo }: { notes: NoteItem[]; whatsappTo?: string | null }) {
  return (
    <ol className="space-y-4 text-sm">
      {notes.map((n) => (
        <li key={n.id}>
          <div className="text-xs text-muted">
            {n.author} · {n.dateLabel}
          </div>
          <p className="mt-0.5 whitespace-pre-line">{n.text}</p>
          {n.kind === "system" ? <DraftActions note={n.text} whatsappTo={whatsappTo} /> : null}
        </li>
      ))}
      {notes.length === 0 ? <p className="text-muted">Записей пока нет.</p> : null}
    </ol>
  );
}
