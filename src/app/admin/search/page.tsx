import { planName } from "@/i18n/labels";
import Link from "next/link";
import { Search, SearchX } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { container } from "@/server/container";
import { formatPrice } from "@/config/site";
import { orderStatusLabel, orderStatusTone, isPrintedPlan } from "@/modules/ordering/ui/status";
import { formatDate } from "@/lib/dates";
import { getTheme } from "@/lib/content/themes";
import { bookLine } from "@/lib/content/crm-labels";
import { can, contactView, requireStaff } from "@/server/access";
import { formatPhone } from "@/shared/domain/phone";
import { channelLabel } from "@/modules/messaging";

export const metadata = { title: "Поиск" };

export default async function AdminSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const staff = await requireStaff();
  const { q = "" } = await searchParams;
  const term = q.trim();
  if (!term)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Поиск" />
        <div className="panel">
          <EmptyState icon={Search} title="Что найти?" action={<SearchForm />}>
            Имя, телефон, e-mail, номер заказа или сделки, название книги.
          </EmptyState>
        </div>
      </div>
    );
  const viewer = { userId: staff.user.id, seesAll: staff.scope === "all" };
  const { orderRows, clientRows, bookRows, dealRows, chatRows } = await container().reporting.search(term, viewer, {
    orders: can(staff, "orders.view"),
    clients: can(staff, "clients.view"),
    deals: can(staff, "deals.view"),
    chats: can(staff, "chats.view"),
  });
  const mask = (v: { phone?: string | null; email?: string | null }) => contactView(staff, v);
  const sections = [
    { id: "deals", title: "Сделки", n: dealRows.length },
    { id: "chats", title: "Чаты", n: chatRows.length },
    { id: "orders", title: "Заказы", n: orderRows.length },
    { id: "clients", title: "Клиенты", n: clientRows.length },
    { id: "books", title: "Книги", n: bookRows.length },
  ].filter((x) => x.n);
  const total = sections.reduce((a, x) => a + x.n, 0);
  const row = "flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-sunken/60 sm:px-5";
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`«${term}»`}>{total ? `Найдено ${total}.` : "Поиск по сделкам, чатам, заказам, клиентам и книгам."}</PageHeader>
      {sections.length > 1 ? (
        <nav aria-label="Разделы результатов" className="m-hscroll flex flex-wrap gap-1.5">
          {sections.map((x) => (
            <a key={x.id} href={`#${x.id}`} className="chip max-lg:h-10">
              {x.title} <b className="font-semibold tabular-nums">{x.n}</b>
            </a>
          ))}
        </nav>
      ) : null}
      {!total ? (
        <div className="panel">
          <EmptyState icon={SearchX} title="Ничего не нашлось" action={<SearchForm term={term} />}>
            Проверьте написание или ищите по части: последние цифры телефона, фамилия, номер заказа.
          </EmptyState>
        </div>
      ) : null}
      {dealRows.length ? (
        <Section id="deals" title="Сделки" n={dealRows.length}>
          {dealRows.map(({ deal, stage }) => (
            <Link key={deal.id} href={`/admin/deals/${deal.id}`} className={row}>
              <span className="w-12 shrink-0 font-medium tabular-nums">№{deal.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{deal.title}</span>
                {deal.contactPhone ? <span className="block truncate text-xs text-muted">{mask({ phone: formatPhone(deal.contactPhone) }).phone}</span> : null}
                <span className="badge mt-1 sm:hidden">
                  <span className="size-1.5 rounded-full" style={{ background: stage.color }} aria-hidden />
                  {stage.name}
                </span>
              </span>
              <span className="badge max-sm:hidden">
                <span className="size-1.5 rounded-full" style={{ background: stage.color }} aria-hidden />
                {stage.name}
              </span>
              <span className="w-24 shrink-0 text-right tabular-nums">{deal.amount ? formatPrice(deal.amount) : "—"}</span>
            </Link>
          ))}
        </Section>
      ) : null}
      {chatRows.length ? (
        <Section id="chats" title="Чаты" n={chatRows.length}>
          {chatRows.map((c) => (
            <Link key={c.id} href={`/admin/chats?c=${c.id}`} className={row}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.contactName || mask({ phone: formatPhone(c.chatId) }).phone || c.chatId}</span>
                <span className="block truncate text-xs text-muted">
                  {channelLabel(c.channel)}: {c.lastMessageText}
                </span>
              </span>
              {c.lastMessageAt ? <span className="shrink-0 text-xs text-muted">{formatDate(c.lastMessageAt, true)}</span> : null}
            </Link>
          ))}
        </Section>
      ) : null}
      {orderRows.length ? (
        <Section id="orders" title="Заказы" n={orderRows.length}>
          {orderRows.map((o) => (
            <Link key={o.id} href={`/admin/orders/${o.id}`} className={row}>
              <span className="w-12 shrink-0 font-medium tabular-nums">№{o.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{o.contactName}</span>
                <span className="block truncate text-xs text-muted">{[mask({ phone: o.contactPhone }).phone, planName(o.plan)].filter(Boolean).join(", ")}</span>
                <Badge tone={orderStatusTone[o.status]} dot className="mt-1 sm:hidden">
                  {orderStatusLabel(o.status, "ru", isPrintedPlan(o.plan))}
                </Badge>
              </span>
              <Badge tone={orderStatusTone[o.status]} dot className="max-sm:hidden">
                {orderStatusLabel(o.status, "ru", isPrintedPlan(o.plan))}
              </Badge>
              <span className="w-24 shrink-0 text-right tabular-nums">{formatPrice(o.amount)}</span>
            </Link>
          ))}
        </Section>
      ) : null}
      {clientRows.length ? (
        <Section id="clients" title="Клиенты" n={clientRows.length}>
          {clientRows.map((u) => (
            <Link key={u.id} href={`/admin/clients/${u.id}`} className={row}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{u.name || "Без имени"}</span>
                <span className="block truncate text-xs text-muted">{[mask({ email: u.email }).email, u.phone ? mask({ phone: u.phone }).phone : null].filter(Boolean).join(", ")}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">с {formatDate(u.createdAt)}</span>
            </Link>
          ))}
        </Section>
      ) : null}
      {bookRows.length ? (
        <Section id="books" title="Книги" n={bookRows.length}>
          {bookRows.map((b) => (
            <Link key={b.id} href={`/admin/clients/${b.userId}`} className={row}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{b.title}</span>
                <span className="block truncate text-xs text-muted">{bookLine({ theme: b.theme, themeShort: getTheme(b.theme).short, authorName: b.authorName, recipientName: b.recipientName })}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">изм. {formatDate(b.updatedAt)}</span>
            </Link>
          ))}
        </Section>
      ) : null}
    </div>
  );
}

/** Строка поиска на пустой странице (та же, что в шапке CRM: /admin/search?q=…). */
function SearchForm({ term }: { term?: string }) {
  return (
    <form action="/admin/search" className="flex w-full max-w-md gap-2">
      <input name="q" defaultValue={term} type="search" placeholder="Имя, телефон, №" aria-label="Что найти" className="input h-10 flex-1 text-sm" />
      <button className="btn btn-dark btn-sm h-10">Найти</button>
    </form>
  );
}

function Section({ id, title, n, children }: { id: string; title: string; n: number; children: React.ReactNode }) {
  return (
    <Panel flush id={id} title={<>{title} <span className="font-normal text-muted tabular-nums">{n}</span></>}>
      <div className="divide-y divide-line">{children}</div>
    </Panel>
  );
}
