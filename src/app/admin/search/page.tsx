import { planName } from "@/i18n/labels";
import Link from "next/link";
import { container } from "@/server/container";
import { formatPrice } from "@/config/site";
import { orderStatusColors, orderStatusLabel } from "@/modules/ordering/ui/status";
import { cn, formatDate } from "@/lib/utils";
import { can, contactView, requireStaff } from "@/server/access";
import { formatPhone } from "@/lib/crm/phone";
import { channelLabel } from "@/modules/messaging";

export const metadata = { title: "Поиск" };

export default async function AdminSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const staff = await requireStaff();
  const { q = "" } = await searchParams;
  const term = q.trim();
  if (!term) return <p className="text-muted">Введите запрос в строке поиска.</p>;
  const viewer = { userId: staff.user.id, seesAll: staff.scope === "all" };
  const { orderRows, clientRows, bookRows, dealRows, chatRows } = await container().reporting.search(term, viewer, {
    orders: can(staff, "orders.view"),
    clients: can(staff, "clients.view"),
    deals: can(staff, "deals.view"),
    chats: can(staff, "chats.view"),
  });
  const mask = (v: { phone?: string | null; email?: string | null }) => contactView(staff, v);
  const empty = !orderRows.length && !clientRows.length && !bookRows.length && !dealRows.length && !chatRows.length;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Поиск: «{term}»</h1>
      {empty ? <p className="text-muted">Ничего не найдено.</p> : null}
      {dealRows.length ? (
        <Section title={`Сделки · ${dealRows.length}`}>
          {dealRows.map(({ deal, stage }) => (
            <Link key={deal.id} href={`/admin/deals/${deal.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-cream/40">
              <span className="w-14 font-medium">№{deal.number}</span>
              <span className="min-w-0 flex-1 truncate">
                {deal.title}
                {deal.contactPhone ? <span className="text-muted"> · {mask({ phone: formatPhone(deal.contactPhone) }).phone}</span> : null}
              </span>
              <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: stage.color }}>
                {stage.name}
              </span>
              <span className="w-24 text-right tabular-nums">{deal.amount ? formatPrice(deal.amount) : "—"}</span>
            </Link>
          ))}
        </Section>
      ) : null}
      {chatRows.length ? (
        <Section title={`Чаты · ${chatRows.length}`}>
          {chatRows.map((c) => (
            <Link key={c.id} href={`/admin/chats?c=${c.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-cream/40">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{c.contactName || mask({ phone: formatPhone(c.chatId) }).phone || c.chatId}</span> <span className="text-muted">· {channelLabel(c.channel)} · {c.lastMessageText}</span>
              </span>
              {c.lastMessageAt ? <span className="text-xs text-muted">{formatDate(c.lastMessageAt, true)}</span> : null}
            </Link>
          ))}
        </Section>
      ) : null}
      {orderRows.length ? (
        <Section title={`Заказы · ${orderRows.length}`}>
          {orderRows.map((o) => (
            <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-cream/40">
              <span className="w-14 font-medium">№{o.number}</span>
              <span className="min-w-0 flex-1 truncate">
                {o.contactName} · {mask({ phone: o.contactPhone }).phone} · {planName(o.plan)}
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs", orderStatusColors[o.status])}>{orderStatusLabel(o.status)}</span>
              <span className="w-24 text-right tabular-nums">{formatPrice(o.amount)}</span>
            </Link>
          ))}
        </Section>
      ) : null}
      {clientRows.length ? (
        <Section title={`Клиенты · ${clientRows.length}`}>
          {clientRows.map((u) => (
            <Link key={u.id} href={`/admin/clients/${u.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-cream/40">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{u.name || "—"}</span> <span className="text-muted">· {mask({ email: u.email }).email}{u.phone ? ` · ${mask({ phone: u.phone }).phone}` : ""}</span>
              </span>
              <span className="text-xs text-muted">с {formatDate(u.createdAt)}</span>
            </Link>
          ))}
        </Section>
      ) : null}
      {bookRows.length ? (
        <Section title={`Книги · ${bookRows.length}`}>
          {bookRows.map((b) => (
            <Link key={b.id} href={`/admin/clients/${b.userId}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-cream/40">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{b.title}</span> <span className="text-muted">· {b.authorName} → {b.recipientName}</span>
              </span>
              <span className="text-xs text-muted">изм. {formatDate(b.updatedAt)}</span>
            </Link>
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">{title}</h2>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}
