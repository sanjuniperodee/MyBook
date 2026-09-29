import Link from "next/link";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { books, orders, users } from "@/lib/db/schema";
import { formatPrice, getPlan } from "@/config/site";
import { orderStatusColors, orderStatusLabel } from "@/lib/orders-shared";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Поиск" };

export default async function AdminSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const term = q.trim();
  if (!term) return <p className="text-muted">Введите запрос в строке поиска.</p>;
  const like = `%${term}%`;
  const num = Number(term.replace(/[^\d]/g, ""));
  const digits = term.replace(/\D/g, "");
  const [orderRows, clientRows, bookRows] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(
        or(
          ilike(orders.contactName, like),
          ilike(orders.contactEmail, like),
          ilike(orders.address, like),
          digits.length >= 4 ? sql`regexp_replace(${orders.contactPhone}, '\\D', '', 'g') like ${"%" + digits + "%"}` : undefined,
          num && term.length < 8 ? eq(orders.number, num) : undefined,
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(20),
    db
      .select()
      .from(users)
      .where(
        or(
          ilike(users.name, like),
          ilike(users.email, like),
          digits.length >= 4 ? sql`regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g') like ${"%" + digits + "%"}` : undefined,
        ),
      )
      .limit(20),
    db
      .select({ id: books.id, title: books.title, authorName: books.authorName, recipientName: books.recipientName, userId: books.userId, updatedAt: books.updatedAt })
      .from(books)
      .where(or(ilike(books.title, like), ilike(books.authorName, like), ilike(books.recipientName, like)))
      .orderBy(desc(books.updatedAt))
      .limit(20),
  ]);
  const empty = !orderRows.length && !clientRows.length && !bookRows.length;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Поиск: «{term}»</h1>
      {empty ? <p className="text-muted">Ничего не найдено.</p> : null}
      {orderRows.length ? (
        <Section title={`Заказы · ${orderRows.length}`}>
          {orderRows.map((o) => (
            <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-cream/40">
              <span className="w-14 font-medium">№{o.number}</span>
              <span className="min-w-0 flex-1 truncate">
                {o.contactName} · {o.contactPhone} · {getPlan(o.plan)?.name}
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
                <span className="font-medium">{u.name || "—"}</span> <span className="text-muted">· {u.email}{u.phone ? ` · ${u.phone}` : ""}</span>
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
