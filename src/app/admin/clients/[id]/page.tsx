import { nowMs } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { db } from "@/lib/db";
import { bookLetters, bookQuestions, books, crmNotes, crmTasks, orders, photos, users } from "@/lib/db/schema";
import { adminLabel, listAdmins } from "@/lib/crm";
import { REMINDER_COOLDOWN_DAYS } from "@/lib/crm-reminders";
import { getTheme } from "@/lib/content/themes";
import { formatPrice, getPlan } from "@/config/site";
import { orderStatusColors, orderStatusLabel } from "@/lib/orders-shared";
import { NotesTimeline, TaskList, type NoteItem, type TaskItem } from "@/components/admin/CrmWidgets";
import { cn, formatDate } from "@/lib/utils";
import { RemindButton, RoleToggle, TagEditor } from "./ClientControls";

export const metadata = { title: "Клиент" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const client = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!client) notFound();

  const [bookRows, orderRows, taskRows, noteRows, admins] = await Promise.all([
    db
      .select({
        book: books,
        answered: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${books.id} and length(trim(q.answer)) > 0)`,
        total: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${books.id})`,
        photos: sql<number>`(select count(*)::int from ${photos} p where p.book_id = ${books.id})`,
        letters: sql<number>`(select count(*)::int from ${bookLetters} l where l.book_id = ${books.id})`,
      })
      .from(books)
      .where(eq(books.userId, id))
      .orderBy(desc(books.updatedAt)),
    db.select().from(orders).where(eq(orders.userId, id)).orderBy(desc(orders.createdAt)),
    db.select().from(crmTasks).where(eq(crmTasks.clientId, id)).orderBy(sql`${crmTasks.doneAt} nulls first`, asc(crmTasks.dueAt)),
    db.select().from(crmNotes).where(eq(crmNotes.clientId, id)).orderBy(desc(crmNotes.createdAt)).limit(100),
    listAdmins(),
  ]);

  const adminOptions = admins.map((a) => ({ id: a.id, label: adminLabel(a) }));
  const adminName = new Map(adminOptions.map((a) => [a.id, a.label]));
  const orderNumber = new Map(orderRows.map((o) => [o.id, o.number]));
  const paid = orderRows.filter((o) => o.paidAt && o.status !== "cancelled");
  const ltv = paid.reduce((s, o) => s + o.amount, 0);
  const now = new Date();
  const tasks: TaskItem[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    dueLabel: t.dueAt ? `до ${formatDate(t.dueAt)}` : null,
    overdue: !!t.dueAt && t.dueAt < now,
    done: !!t.doneAt,
    assignee: t.assigneeId ? (adminName.get(t.assigneeId) ?? null) : null,
    context: t.orderId && orderNumber.has(t.orderId) ? { label: `заказ №${orderNumber.get(t.orderId)}`, href: `/admin/orders/${t.orderId}` } : null,
  }));
  const notes: NoteItem[] = noteRows.map((n) => ({
    id: n.id,
    kind: n.kind,
    text: n.text,
    author: n.authorId ? (adminName.get(n.authorId) ?? "—") : "система",
    dateLabel: formatDate(n.createdAt, true),
    orderLabel: n.orderId && orderNumber.has(n.orderId) ? `заказ №${orderNumber.get(n.orderId)}` : null,
  }));
  const phoneDigits = (client.phone ?? orderRows[0]?.contactPhone ?? "").replace(/\D/g, "");
  const hasDraft = bookRows.some((b) => b.book.status === "draft");
  const cooldown = client.remindedAt && nowMs() - client.remindedAt.getTime() < REMINDER_COOLDOWN_DAYS * 86_400_000;
  const remindHint = !hasDraft
    ? "Нет незавершённых книг"
    : client.remindedAt
      ? `Последнее напоминание: ${formatDate(client.remindedAt, true)}`
      : "Письмо со ссылкой на следующий вопрос";

  return (
    <div className="space-y-6">
      <Link href="/admin/clients" className="text-sm text-muted hover:text-ink">
        ← Клиенты
      </Link>
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Профиль */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-line bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-ink text-lg font-semibold text-white uppercase">{(client.name || client.email).slice(0, 1)}</div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold">{client.name || client.email.split("@")[0]}</h1>
                <div className="text-xs text-muted">{client.role === "admin" ? "Администратор" : "Клиент"} с {formatDate(client.createdAt)}</div>
              </div>
            </div>
            <div className="mt-4 space-y-1.5 text-sm">
              <a href={`mailto:${client.email}`} className="flex items-center gap-2 hover:text-wine">
                <Mail className="size-4 text-muted" /> {client.email}
              </a>
              {phoneDigits ? (
                <>
                  <a href={`tel:+${phoneDigits}`} className="flex items-center gap-2 hover:text-wine">
                    <Phone className="size-4 text-muted" /> {client.phone ?? orderRows[0]?.contactPhone}
                  </a>
                  <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-emerald-700 hover:underline">
                    <MessageCircle className="size-4" /> Написать в WhatsApp
                  </a>
                </>
              ) : null}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 text-center">
              <div className="col-span-2">
                <Stat label="сумма покупок (LTV)" value={formatPrice(ltv)} />
              </div>
              <Stat label="заказов" value={String(orderRows.filter((o) => o.status !== "cancelled").length)} />
              <Stat label="книг" value={String(bookRows.length)} />
            </div>
            <dl className="mt-4 space-y-1 text-xs text-muted">
              <div className="flex justify-between">
                <dt>Последний визит</dt>
                <dd className="text-ink">{client.lastSeenAt ? formatDate(client.lastSeenAt, true) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Источник</dt>
                <dd className="truncate text-right text-ink" title={client.source ? JSON.stringify(client.source) : ""}>
                  {client.source ? [client.source.source, client.source.medium, client.source.campaign].filter(Boolean).join(" / ") || client.source.referrer || "прямой заход" : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Автописьма</dt>
                <dd className={client.emailOptOut ? "text-red-700" : "text-ink"}>{client.emailOptOut ? "отписан" : "получает"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Средний чек</dt>
                <dd className="text-ink">{paid.length ? formatPrice(Math.round(ltv / paid.length)) : "—"}</dd>
              </div>
            </dl>
          </section>
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold">Теги</h2>
            <TagEditor clientId={client.id} tags={client.tags} />
          </section>
          <section className="space-y-3 rounded-2xl border border-line bg-white p-5">
            <RemindButton clientId={client.id} disabled={!hasDraft || !!cooldown} hint={remindHint} />
            <RoleToggle clientId={client.id} role={client.role} />
          </section>
        </aside>

        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">Книги</h2>
            {bookRows.length === 0 ? <p className="text-sm text-muted">Книг пока нет.</p> : null}
            <div className="space-y-3">
              {bookRows.map(({ book, answered, total, photos: ph, letters }) => (
                <div key={book.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-line p-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{book.title}</div>
                    <div className="text-xs text-muted">
                      {getTheme(book.theme).name} · {book.authorName} → {book.recipientName} · изм. {formatDate(book.updatedAt)}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-cream">
                        <div className="h-full rounded-full bg-wine" style={{ width: `${total ? (answered / total) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs text-muted tabular-nums">
                        {answered}/{total} ответов · {ph} фото{letters ? ` · ${letters} писем` : ""}
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

          <section className="overflow-hidden rounded-2xl border border-line bg-white">
            <h2 className="border-b border-line px-5 py-4 font-semibold">Заказы</h2>
            {orderRows.length === 0 ? <p className="px-5 py-6 text-sm text-muted">Заказов нет.</p> : null}
            <div className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {orderRows.map((o) => (
                <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-cream/40">
                  <span className="w-14 font-medium">№{o.number}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {formatDate(o.createdAt)} · {getPlan(o.plan)?.name}
                    {o.quantity > 1 ? ` × ${o.quantity}` : ""}
                    {o.promoCode ? ` · ${o.promoCode}` : ""}
                  </span>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs", orderStatusColors[o.status])}>{orderStatusLabel(o.status)}</span>
                  <span className="w-24 text-right tabular-nums">{formatPrice(o.amount)}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-2 font-semibold">Задачи</h2>
            <TaskList tasks={tasks} admins={adminOptions} clientId={client.id} />
          </section>

          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">История общения</h2>
            <NotesTimeline notes={notes} clientId={client.id} />
          </section>
        </div>
      </div>
    </div>
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
