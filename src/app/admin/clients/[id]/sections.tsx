import Link from "next/link";
import { Mail, MessageCircle, Phone } from "lucide-react";
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
import { orderStatusColors, orderStatusLabel, isPrintedPlan } from "@/modules/ordering/ui/status";
import type { clientScreen } from "@/modules/reporting/ui/client-screen";
import { formatPhone } from "@/shared/domain/phone";
import { ContactActions } from "@/components/admin/ContactActions";
import { ClientChannel, ClientLocale, ClientManager, ExtraPhones } from "./ClientControls";

type Screen = ReturnType<typeof clientScreen>;

/** Профиль клиента: имя, контакты (или маска), действия, доп. телефоны, ответственный, покупки, визит, канал, автописьма. */
export function ClientProfile({
  client,
  screen,
  contact,
  canEdit,
  can,
  managerOptions,
}: {
  client: { id: string; name: string | null; email: string; role: string; createdAt: Date; lastSeenAt: Date | null; extraPhones: string[]; managerId: string | null; source: Record<string, string> | null; emailOptOut: boolean; locale: "ru" | "kk" };
  screen: Screen;
  contact: { masked: boolean; phone?: string | null; email?: string | null };
  canEdit: boolean;
  can: (p: Permission) => boolean;
  managerOptions: { id: string; label: string }[];
}) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-full bg-ink text-lg font-semibold text-white uppercase">{(client.name || client.email).slice(0, 1)}</div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{client.name || client.email.split("@")[0]}</h1>
          <div className="text-xs text-muted">{client.role === "admin" ? "Администратор" : "Клиент"} с {formatDate(client.createdAt)}</div>
        </div>
      </div>
      <div className="mt-4 space-y-1.5 text-sm">
        {contact.masked ? (
          <>
            <div className="flex items-center gap-2 text-ink-soft" title="Контакты скрыты настройками вашей роли">
              <Mail className="size-4 text-muted" /> {contact.email}
            </div>
            {screen.phoneDigits ? (
              <div className="flex items-center gap-2 text-ink-soft tabular-nums">
                <Phone className="size-4 text-muted" /> {contact.phone}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <a href={`mailto:${client.email}`} className="flex items-center gap-2 hover:text-wine">
              <Mail className="size-4 text-muted" /> {client.email}
            </a>
            {screen.phoneDigits ? (
              <>
                <a href={`tel:+${screen.phoneDigits}`} className="flex items-center gap-2 hover:text-wine">
                  <Phone className="size-4 text-muted" /> {screen.rawPhone}
                </a>
                {!can("chats.send") ? (
                  <a href={`https://wa.me/${screen.phoneDigits}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-emerald-700 hover:underline">
                    <MessageCircle className="size-4" /> Написать в WhatsApp
                  </a>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>
      <ContactActions className="mt-3" target={{ clientId: client.id }} canCall={!!screen.phoneDigits && can("calls.make")} canChat={!!screen.phoneDigits && can("chats.send")} canEmail={can("chats.send")} />
      {!contact.masked && canEdit ? (
        <div className="mt-4">
          <div className="mb-1 text-xs text-muted">Доп. телефоны (через запятую)</div>
          <ExtraPhones clientId={client.id} value={client.extraPhones.map((p) => formatPhone(p)).join(", ")} />
        </div>
      ) : null}
      <div className="mt-4">
        <div className="mb-1 text-xs text-muted">Ответственный</div>
        <ClientManager clientId={client.id} value={client.managerId} options={managerOptions} disabled={!canEdit} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 text-center">
        <div className="col-span-2">
          <Stat label="сумма покупок (LTV)" value={formatPrice(screen.stats.ltv)} />
        </div>
        <Stat label="заказов" value={String(screen.stats.orders)} />
        <Stat label="книг" value={String(screen.stats.books)} />
      </div>
      <dl className="mt-4 space-y-1 text-xs text-muted">
        <div className="flex justify-between">
          <dt>Последний визит</dt>
          <dd className="text-ink">{client.lastSeenAt ? formatDate(client.lastSeenAt, true) : "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Канал</dt>
          <dd className="min-w-0 flex-1 text-right font-medium text-ink" title={client.source ? JSON.stringify(client.source) : ""} data-testid="client-channel">
            {canEdit ? (
              <ClientChannel clientId={client.id} value={screen.channel.value} auto={screen.channel.value === "auto" ? screen.channel.label : undefined} />
            ) : (
              <span className="truncate">{screen.channel.label}</span>
            )}
          </dd>
        </div>
        {screen.channel.details ? (
          <div className="flex justify-between gap-3">
            <dt>Метки</dt>
            <dd className="truncate text-right text-ink">
              {screen.channel.details}
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <dt>Язык кабинета и писем</dt>
          <dd className="text-ink" data-testid="client-locale">
            {canEdit ? <ClientLocale clientId={client.id} value={client.locale} /> : client.locale === "kk" ? "казахский" : "русский"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>Автописьма</dt>
          <dd className={client.emailOptOut ? "text-red-700" : "text-ink"}>{client.emailOptOut ? "отписан" : "получает"}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Средний чек</dt>
          <dd className="text-ink">{screen.stats.averageCheck !== null ? formatPrice(screen.stats.averageCheck) : "—"}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Сделки клиента; «Новая сделка» — с правом на правку сделок. */
export function ClientDeals({ clientId, deals, can }: { clientId: string; deals: { deal: { id: string; number: number; title: string; source: DealSource; createdAt: Date; amount: number }; stage: { name: string; color: string } }[]; can: (p: Permission) => boolean }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-semibold">Сделки</h2>
        {can("deals.edit") ? (
          <Link href={`/admin/deals/new?client=${clientId}`} className="btn btn-outline btn-sm">
            Новая сделка
          </Link>
        ) : null}
      </div>
      {deals.length === 0 ? <p className="px-5 py-6 text-sm text-muted">Сделок нет.</p> : null}
      <div className="divide-y divide-line">
        {deals.map(({ deal, stage }) => (
          <Link key={deal.id} href={`/admin/deals/${deal.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-cream/40">
            <span className="w-14 font-medium">№{deal.number}</span>
            <span className="min-w-0 flex-1 truncate">
              {deal.title} <span className="text-muted">· {dealSourceLabels[deal.source]} · {formatDate(deal.createdAt)}</span>
            </span>
            <span className="rounded-full px-2.5 py-1 text-xs text-white" style={{ background: stage.color }}>
              {stage.name}
            </span>
            <span className="w-24 text-right tabular-nums">{deal.amount ? formatPrice(deal.amount) : "—"}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Платежи менеджеру по сделкам клиента. */
export function ClientPayments({ payments }: { payments: { id: string; deal_id: string; amount: number; kind: string; number: number; title: string; paid_at: Date | string }[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white" data-testid="client-payments">
      <h2 className="border-b border-line px-5 py-3.5 font-semibold">Платежи менеджеру</h2>
      <div className="divide-y divide-line">
        {payments.map((p) => (
          <Link key={p.id} href={`/admin/deals/${p.deal_id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-cream/40">
            <span className={cn("w-24 font-medium tabular-nums", p.kind === "refund" && "text-red-700")}>{p.kind === "refund" ? "−" : ""}{formatPrice(p.amount)}</span>
            <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] text-ink-soft">{p.kind === "prepayment" ? "предоплата" : p.kind === "refund" ? "возврат" : "платёж"}</span>
            <span className="min-w-0 flex-1 truncate text-muted">
              сделка №{p.number} · {p.title}
            </span>
            <span className="text-xs text-muted">{formatDate(p.paid_at)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Книги клиента: прогресс, статус, макет и текст. */
export function ClientBooks({ books }: { books: { book: { id: string; title: string; theme: string; authorName: string; recipientName: string; recordedBy: string; updatedAt: Date; status: string }; answered: number; total: number; words: number; photos: number; letters: number }[] }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-4 font-semibold">Книги</h2>
      {books.length === 0 ? <p className="text-sm text-muted">Книг пока нет.</p> : null}
      <div className="space-y-3">
        {books.map(({ book, answered, total, words, photos: ph, letters }) => (
          <div key={book.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-line p-4">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{book.title}</div>
              <div className="text-xs text-muted">
                {bookLine({ theme: book.theme, themeShort: getTheme(book.theme).name, authorName: book.authorName, recipientName: book.recipientName })}
                {book.recordedBy ? ` · записано: ${book.recordedBy}` : ""} · изм. {formatDate(book.updatedAt)}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-cream">
                  <div className="h-full rounded-full bg-wine" style={{ width: `${progressRatio({ theme: book.theme, answered, total, words }) * 100}%` }} />
                </div>
                <span className="text-xs text-muted tabular-nums">
                  {progressText({ theme: book.theme, answered, total, words })} · {ph} фото{letters ? ` · ${letters} писем` : ""}
                </span>
              </div>
            </div>
            <span className={cn("rounded-full px-2.5 py-1 text-xs", book.status === "draft" ? "bg-cream text-ink-soft" : "bg-emerald-100 text-emerald-800")}>{book.status === "draft" ? "Пишется" : "Заказана"}</span>
            <div className="flex gap-2">
              <Link href={`/books/${book.id}/preview`} className="btn btn-outline btn-sm">
                Макет
              </Link>
              <a href={`/api/books/${book.id}/export`} className="btn btn-ghost btn-sm">
                Текст
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Заказы клиента. */
export function ClientOrders({ orders }: { orders: { id: string; number: number; createdAt: Date; plan: string; quantity: number; promoCode: string | null; status: OrderStatus; amount: number }[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white">
      <h2 className="border-b border-line px-5 py-4 font-semibold">Заказы</h2>
      {orders.length === 0 ? <p className="px-5 py-6 text-sm text-muted">Заказов нет.</p> : null}
      <div className="max-h-[420px] divide-y divide-line overflow-y-auto">
        {orders.map((o) => (
          <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-cream/40">
            <span className="w-14 font-medium">№{o.number}</span>
            <span className="min-w-0 flex-1 truncate text-muted">
              {formatDate(o.createdAt)} · {planName(o.plan)}
              {o.quantity > 1 ? ` × ${o.quantity}` : ""}
              {o.promoCode ? ` · ${o.promoCode}` : ""}
            </span>
            <span className={cn("rounded-full px-2.5 py-1 text-xs", orderStatusColors[o.status])}>{orderStatusLabel(o.status, "ru", isPrintedPlan(o.plan))}</span>
            <span className="w-24 text-right tabular-nums">{formatPrice(o.amount)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-cream/60 px-2 py-2.5">
      <div className="truncate text-sm font-semibold">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
