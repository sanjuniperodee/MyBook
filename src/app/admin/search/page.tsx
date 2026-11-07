import { planName } from "@/i18n/labels";
import Link from "next/link";
import { Search, SearchX } from "lucide-react";
import { cn } from "@/lib/class-names";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionHead } from "@/components/admin/SectionHead";
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
          <EmptyState icon={Search} title="Что найти?" action={<SearchForm large />}>
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
  const row = "flex min-h-11 items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-sunken/60 sm:px-5";
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`«${term}»`} meta={total ? <span className="text-[13px] text-muted tabular-nums">найдено {total}</span> : null}>
        {total ? "Сделки, чаты, заказы, клиенты и книги по этому запросу." : "Поиск по сделкам, чатам, заказам, клиентам и книгам."}
      </PageHeader>
      <SearchForm term={term} />
      {!total ? (
        <div className="panel">
          <EmptyState icon={SearchX} title="Ничего не нашлось">
            Проверьте написание или ищите по части: последние цифры телефона, фамилия, номер заказа.
          </EmptyState>
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-8">
          {/* Якоря типов: слева липкий указатель, на телефоне — лента чипов. */}
          <nav aria-label="Разделы результатов" className="m-hscroll flex flex-wrap gap-1.5 lg:sticky lg:top-[calc(var(--topbar-h)+1rem)] lg:flex-col lg:gap-0.5">
            {sections.map((x) => (
              <a key={x.id} href={`#${x.id}`} className="chip max-lg:h-10 lg:h-8 lg:justify-between lg:border-transparent lg:bg-transparent lg:px-2.5 lg:hover:bg-sunken">
                {x.title} <span className="count">{x.n}</span>
              </a>
            ))}
          </nav>
          <div className="min-w-0 space-y-6">
            {dealRows.length ? (
              <Section id="deals" title="Сделки" n={dealRows.length}>
                {dealRows.map(({ deal, stage }) => (
                  <Link key={deal.id} href={`/admin/deals/${deal.id}`} className={row}>
                    <span className="w-12 shrink-0 font-medium tabular-nums">№{deal.number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{deal.title}</span>
                      {deal.contactPhone ? <span className="block truncate text-xs text-muted tabular-nums">{mask({ phone: formatPhone(deal.contactPhone) }).phone}</span> : null}
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
                    {c.lastMessageAt ? <span className="shrink-0 text-xs text-muted tabular-nums">{formatDate(c.lastMessageAt, true)}</span> : null}
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
                      <span className="block truncate text-xs text-muted tabular-nums">{[mask({ phone: o.contactPhone }).phone, planName(o.plan)].filter(Boolean).join(", ")}</span>
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
                      <span className="block truncate text-xs text-muted tabular-nums">{[mask({ email: u.email }).email, u.phone ? mask({ phone: u.phone }).phone : null].filter(Boolean).join(", ")}</span>
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
        </div>
      )}
    </div>
  );
}

/** Строка поиска (та же, что в шапке CRM: /admin/search?q=…): на странице результатов — с запросом, чтобы уточнить его. */
function SearchForm({ term, large }: { term?: string; large?: boolean }) {
  return (
    <form action="/admin/search" className={cn("flex w-full max-w-xl gap-2", large && "max-w-md")} role="search">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input name="q" defaultValue={term} type="search" placeholder="Имя, телефон, №" aria-label="Что найти" className="input pl-9" />
      </div>
      <button className="btn btn-dark">Найти</button>
    </form>
  );
}

function Section({ id, title, n, children }: { id: string; title: string; n: number; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-[calc(var(--topbar-h)+1rem)] space-y-2">
      <SectionHead id={`${id}-h`} title={title} meta={<span className="tabular-nums">{n}</span>} />
      <div className="panel divide-y divide-line overflow-hidden">{children}</div>
    </section>
  );
}
