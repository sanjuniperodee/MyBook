import Link from "next/link";
import { BookOpen, Handshake, Mail, MessageCircle, Package, Phone } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { StageLabel } from "@/app/admin/deals/StageLabel";
import type { Permission } from "@/shared/domain/permissions";
import type { OrderStatus } from "@/shared/domain/orders";
import type { DealSource } from "@/shared/domain/dealSources";
import { dealSourceLabels } from "@/shared/domain/dealSources";
import { planName } from "@/i18n/labels";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import { getTheme } from "@/lib/content/themes";
import { bookLine, progressRatio, progressText } from "@/lib/content/crm-labels";
import { formatPrice } from "@/config/site";
import type { ClientReferralsData } from "@/modules/reporting";
import { orderStatusColors, orderStatusLabel, isPrintedPlan } from "@/modules/ordering/ui/status";
import type { clientScreen } from "@/modules/reporting/ui/client-screen";
import { formatPhone, isPhoneStubEmail } from "@/shared/domain/phone";
import { ContactActions } from "@/components/admin/ContactActions";
import { NoMarketingToggle } from "@/components/admin/NoMarketingToggle";
import { ClientChannel, ClientLocale, ClientManager, ExtraPhones } from "./ClientControls";

type Screen = ReturnType<typeof clientScreen>;

type ClientRow = { id: string; name: string | null; email: string; role: string; createdAt: Date; lastSeenAt: Date | null; extraPhones: string[]; managerId: string | null; source: Record<string, string> | null; emailOptOut: boolean; locale: "ru" | "kk" };

/**
 * Сводка клиента под шапкой: как связаться (контакты или маска, звонок, WhatsApp, письмо) и цифры — сколько купил,
 * сколько заказов и книг, средний чек, когда заходил. Цифры — одной строкой листа, как «Сейчас» на обзоре.
 */
export function ClientSummary({ client, screen, contact, can }: { client: ClientRow; screen: Screen; contact: { masked: boolean; phone?: string | null; email?: string | null }; can: (p: Permission) => boolean }) {
  const stats = [
    { label: "Сумма покупок", value: formatPrice(screen.stats.ltv), strong: true },
    { label: "Заказов", value: String(screen.stats.orders) },
    { label: "Книг", value: String(screen.stats.books) },
    { label: "Средний чек", value: screen.stats.averageCheck !== null ? formatPrice(screen.stats.averageCheck) : "—" },
    { label: "Последний визит", value: client.lastSeenAt ? formatDate(client.lastSeenAt, true).replace(/ \d{4} г\./, "") : "—" },
  ];
  return (
    <section className="panel overflow-hidden" aria-label="Сводка клиента">
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1 text-sm">
          {contact.masked ? (
            <>
              {screen.phoneDigits ? (
                <div className="flex items-center gap-2 text-ink-soft tabular-nums" title="Контакты скрыты настройками вашей роли">
                  <Phone className="size-4 shrink-0 text-muted" aria-hidden /> {contact.phone}
                </div>
              ) : null}
              <div className="flex items-center gap-2 text-ink-soft" title="Контакты скрыты настройками вашей роли">
                <Mail className="size-4 shrink-0 text-muted" aria-hidden /> {contact.email}
              </div>
            </>
          ) : (
            <>
              {screen.phoneDigits ? (
                <a href={`tel:+${screen.phoneDigits}`} className="flex w-fit items-center gap-2 text-[15px] font-medium tabular-nums hover:text-wine">
                  <Phone className="size-4 shrink-0 text-muted" aria-hidden /> {screen.rawPhone}
                </a>
              ) : null}
              <a href={`mailto:${client.email}`} className="flex w-fit max-w-full items-center gap-2 text-ink-soft hover:text-wine">
                <Mail className="size-4 shrink-0 text-muted" aria-hidden /> <span className="truncate">{client.email}</span>
              </a>
              {screen.phoneDigits && !can("chats.send") ? (
                <a href={`https://wa.me/${screen.phoneDigits}`} target="_blank" rel="noopener noreferrer" className="flex w-fit items-center gap-2 text-success hover:underline">
                  <MessageCircle className="size-4" aria-hidden /> Написать в WhatsApp
                </a>
              ) : null}
            </>
          )}
        </div>
        <ContactActions className="lg:w-auto lg:min-w-96" target={{ clientId: client.id }} canCall={!!screen.phoneDigits && can("calls.make")} canChat={!!screen.phoneDigits && can("chats.send")} canEmail={can("chats.send")} />
      </div>
      <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-5">
        {stats.map((s, i) => (
          <div key={s.label} className={cn("min-w-0 bg-white px-4 py-2.5 sm:px-5 sm:py-3", i === 0 && "max-sm:col-span-2")}>
            <dt className="truncate text-xs text-muted">{s.label}</dt>
            <dd className={cn("mt-0.5 truncate tabular-nums", s.strong ? "text-lg font-semibold" : "text-[15px] font-medium")}>{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Профиль клиента: доп. телефоны, ответственный, канал, язык, автописьма, «не писать первым». */
export function ClientProfile({
  client,
  screen,
  contact,
  canEdit,
  managerOptions,
  noMarketing,
}: {
  client: ClientRow;
  /** Стоп-лист «Не писать первым». */
  noMarketing: boolean;
  screen: Screen;
  contact: { masked: boolean; phone?: string | null; email?: string | null };
  canEdit: boolean;
  managerOptions: { id: string; label: string }[];
}) {
  const row = "flex min-h-11 items-center justify-between gap-3 py-1.5";
  return (
    <Panel title="Профиль" className="text-sm">
      <div className="space-y-4">
        <div>
          <div className="label text-xs">Ответственный</div>
          <ClientManager clientId={client.id} value={client.managerId} options={managerOptions} disabled={!canEdit} />
        </div>
        {!contact.masked && canEdit ? (
          <div>
            <div className="label text-xs">Дополнительные телефоны</div>
            <ExtraPhones clientId={client.id} value={client.extraPhones.map((p) => formatPhone(p)).join(", ")} />
          </div>
        ) : null}
        <dl className="divide-y divide-line border-t border-line">
          <div className={row}>
            <dt className="shrink-0 text-muted">Канал</dt>
            <dd className="min-w-0 flex-1 text-right font-medium" title={client.source ? JSON.stringify(client.source) : ""} data-testid="client-channel">
              {canEdit ? <ClientChannel clientId={client.id} value={screen.channel.value} auto={screen.channel.value === "auto" ? screen.channel.label : undefined} /> : <span className="truncate">{screen.channel.label}</span>}
            </dd>
          </div>
          {screen.channel.details ? (
            <div className={row}>
              <dt className="shrink-0 text-muted">Метки</dt>
              <dd className="truncate text-right">{screen.channel.details}</dd>
            </div>
          ) : null}
          <div className={row}>
            <dt className="text-muted">Язык кабинета и писем</dt>
            <dd data-testid="client-locale">{canEdit ? <ClientLocale clientId={client.id} value={client.locale} /> : client.locale === "kk" ? "казахский" : "русский"}</dd>
          </div>
          <div className={row}>
            <dt className="text-muted">Автописьма</dt>
            <dd className={cn("text-right", client.emailOptOut ? "text-danger" : "text-ink")}>{isPhoneStubEmail(client.email) ? "нет почты — в WhatsApp" : client.emailOptOut ? "отписан" : "получает"}</dd>
          </div>
          <div className={row}>
            <dt className="text-muted" title="Клиент просил не писать: бот не напоминает о себе, правила автоматизаций не пишут. На его сообщения отвечать можно.">
              Писать первым
            </dt>
            <dd>
              <NoMarketingToggle target={{ clientId: client.id }} on={noMarketing} disabled={!canEdit} />
            </dd>
          </div>
        </dl>
      </div>
    </Panel>
  );
}

/** Сделки клиента; «Новая сделка» — с правом на правку сделок. */
export function ClientDeals({ clientId, deals, can }: { clientId: string; deals: { deal: { id: string; number: number; title: string; source: DealSource; createdAt: Date; amount: number }; stage: { name: string; color: string } }[]; can: (p: Permission) => boolean }) {
  return (
    <Panel
      flush
      title={
        <>
          Сделки {deals.length ? <span className="font-normal text-muted tabular-nums">{deals.length}</span> : null}
        </>
      }
    >
      {deals.length === 0 ? (
        <EmptyState compact icon={Handshake} title="Сделок пока нет" action={can("deals.edit") ? <Link href={`/admin/deals/new?client=${clientId}`} className="btn btn-outline btn-sm">Новая сделка</Link> : undefined}>
          Заведите сделку, когда клиент договорится о книге или оплатит.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {deals.map(({ deal, stage }) => (
            <li key={deal.id}>
              <Link href={`/admin/deals/${deal.id}`} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-sunken/60 sm:px-5">
                <span className="w-12 shrink-0 text-muted tabular-nums">№{deal.number}</span>
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block truncate font-medium">{deal.title}</span>
                  <span className="block text-xs text-muted">
                    {dealSourceLabels[deal.source]} · {formatDate(deal.createdAt)}
                  </span>
                </span>
                <StageLabel name={stage.name} color={stage.color} className="shrink-0" />
                <span className="w-24 shrink-0 text-right font-medium tabular-nums">{deal.amount ? formatPrice(deal.amount) : <span className="font-normal text-muted">—</span>}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Платежи менеджеру по сделкам клиента. */
export function ClientPayments({ payments }: { payments: { id: string; deal_id: string; amount: number; kind: string; number: number; title: string; paid_at: Date | string }[] }) {
  return (
    <Panel flush title="Платежи менеджеру">
      <ul className="divide-y divide-line" data-testid="client-payments">
        {payments.map((p) => (
          <li key={p.id}>
            <Link href={`/admin/deals/${p.deal_id}`} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-sunken/60 sm:px-5">
              <span className={cn("w-24 shrink-0 font-semibold tabular-nums", p.kind === "refund" && "text-danger")}>
                {p.kind === "refund" ? "−" : ""}
                {formatPrice(p.amount)}
              </span>
              <Badge tone={p.kind === "refund" ? "danger" : "neutral"}>{p.kind === "prepayment" ? "предоплата" : p.kind === "refund" ? "возврат" : "платёж"}</Badge>
              <span className="min-w-0 flex-1 truncate text-muted">
                сделка №{p.number} · {p.title}
              </span>
              <span className="text-xs text-muted tabular-nums">{formatDate(p.paid_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Приглашения (contacts-d7): код клиента для друзей, друзья с покупками и наградами, кто пригласил его самого. */
export function ClientReferrals({ data }: { data: ClientReferralsData }) {
  return (
    <section className="panel panel-body" data-testid="client-referrals">
      <h2 className="panel-title mb-3">Приглашения</h2>
      <dl className="space-y-1 text-sm">
        {data.invitedBy ? (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Пригласил(а)</dt>
            <dd>
              <Link href={`/admin/clients/${data.invitedBy.id}`} className="text-wine hover:underline">{data.invitedBy.name || "клиент"}</Link>
            </dd>
          </div>
        ) : null}
        {data.code ? (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Код для друзей</dt>
            <dd className={cn("rounded bg-sunken px-1.5 font-mono text-xs", !data.code.active && "text-muted line-through")}>{data.code.code}</dd>
          </div>
        ) : null}
      </dl>
      {data.friends.length ? (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-2 text-xs">
          {data.friends.map((f) => (
            <li key={`${f.kind}${f.refId}`} className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span>
                {f.friendId ? <Link href={`/admin/clients/${f.friendId}`} className="underline">{f.name || "друг"}</Link> : f.name || "друг"}
                {" · "}
                <Link href={f.kind === "order" ? `/admin/orders/${f.refId}` : `/admin/deals/${f.refId}`} className="underline">{f.kind === "order" ? `заказ №${f.number}` : `сделка №${f.number} (чат)`}</Link>
              </span>
              <span className="text-muted">{f.rewardCode ? `награда ${f.rewardCode}${f.rewardUsed ? " · использована" : ""}` : "награда не выдана"}</span>
            </li>
          ))}
        </ul>
      ) : data.code ? (
        <p className="mt-2 text-xs text-muted">По коду пока никто не купил.</p>
      ) : null}
    </section>
  );
}

/** Книги клиента: прогресс, статус, макет и текст. */
export function ClientBooks({ books }: { books: { book: { id: string; title: string; theme: string; authorName: string; recipientName: string; recordedBy: string; updatedAt: Date; status: string }; answered: number; total: number; words: number; photos: number; letters: number }[] }) {
  return (
    <Panel flush title="Книги">
      {books.length === 0 ? (
        <EmptyState compact icon={BookOpen} title="Книг пока нет">
          Книга появится, когда клиент начнёт её в кабинете.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {books.map(({ book, answered, total, words, photos: ph, letters }) => (
            <li key={book.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1 basis-60">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{book.title}</span>
                  <Badge tone={book.status === "draft" ? "neutral" : "success"} className="shrink-0">
                    {book.status === "draft" ? "пишется" : "заказана"}
                  </Badge>
                </div>
                <div className="truncate text-xs text-muted">
                  {bookLine({ theme: book.theme, themeShort: getTheme(book.theme).name, authorName: book.authorName, recipientName: book.recipientName })}
                  {book.recordedBy ? ` · записано: ${book.recordedBy}` : ""} · изм. {formatDate(book.updatedAt)}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-wine" style={{ width: `${progressRatio({ theme: book.theme, answered, total, words }) * 100}%` }} />
                  </div>
                  <span className="truncate text-xs text-muted tabular-nums">
                    {progressText({ theme: book.theme, answered, total, words })} · {ph} фото{letters ? ` · ${letters} писем` : ""}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Link href={`/books/${book.id}/preview`} className="btn btn-outline btn-sm">
                  Макет
                </Link>
                <a href={`/api/books/${book.id}/export`} className="btn btn-ghost btn-sm">
                  Текст
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Заказы клиента. */
export function ClientOrders({ orders }: { orders: { id: string; number: number; createdAt: Date; plan: string; quantity: number; promoCode: string | null; status: OrderStatus; amount: number }[] }) {
  return (
    <Panel flush title="Заказы">
      {orders.length === 0 ? (
        <EmptyState compact icon={Package} title="Заказов пока нет">
          Заказ появится, когда клиент оформит книгу на сайте.
        </EmptyState>
      ) : (
        <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/orders/${o.id}`} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-sunken/60 sm:px-5">
                <span className="w-12 shrink-0 text-muted tabular-nums">№{o.number}</span>
                <span className="min-w-0 flex-1 basis-40 truncate">
                  {planName(o.plan)}
                  {o.quantity > 1 ? ` × ${o.quantity}` : ""}
                  <span className="text-muted">
                    {" "}
                    · {formatDate(o.createdAt)}
                    {o.promoCode ? ` · ${o.promoCode}` : ""}
                  </span>
                </span>
                <span className={cn("badge shrink-0", orderStatusColors[o.status])}>{orderStatusLabel(o.status, "ru", isPrintedPlan(o.plan))}</span>
                <span className="w-24 shrink-0 text-right font-medium tabular-nums">{formatPrice(o.amount)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
