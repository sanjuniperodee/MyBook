import Link from "next/link";
import { z } from "zod";
import { AlertTriangle, FileText } from "lucide-react";
import { container } from "@/server/container";
import { can, canSeeAssigned, requireStaff } from "@/server/access";
import { storeTimeZone } from "@/shared/domain/time";
import { formatPrice } from "@/config/site";
import { BarList, StatTile } from "@/components/admin/charts";
import { cn } from "@/lib/class-names";
import { financePeriod, financeScreen, REFUND_WINDOW_DAYS, type FinanceScreen } from "@/modules/reporting/ui/finance-screen";
import { FinanceColumns } from "./FinanceColumns";
import { ReviewButton } from "./ReviewButton";

export const metadata = { title: "Финансы" };

/** Параметры адреса: пресет периода и свои даты; мусор — период по умолчанию (текущий месяц). */
const query = z.object({ p: z.string().max(10).optional(), from: z.string().max(10).optional(), to: z.string().max(10).optional() }).catch({});

const PRESETS = [
  ["today", "Сегодня"],
  ["7d", "7 дней"],
  ["month", "Месяц"],
  ["prev", "Прошлый месяц"],
] as const;

/** Сколько строк показывать в длинных таблицах. */
const RECENT = 50;
const EXPECTED = 200;

const plural = (n: number, forms: [string, string, string]) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? forms[0] : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? forms[1] : forms[2]}`;
const signed = (n: number) => (n < 0 ? `−${formatPrice(-n)}` : formatPrice(n));

/**
 * «Финансы»: сколько денег пришло за период, сколько ещё ждём (остатки договорённостей — особенно у тех, чья книга
 * готова, заказы на оплате, постоплаты), что нужно вернуть и какие ручные подтверждения не проверены.
 * Видят сотрудники с аналитикой (analytics.view; роль «только свои» — по своим сделкам и заказам), «Проверено» — руководитель (team.manage).
 */
export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff("analytics.view");
  const q = query.parse(await searchParams);
  const tz = storeTimeZone();
  const now = new Date();
  const period = financePeriod({ preset: q.p, from: q.from, to: q.to, now, tz });
  const [data, admins] = await Promise.all([container().reporting.finance({ from: period.prev.from, to: period.to }), container().access.queries.allStaff()]);
  const s = financeScreen({ period, ...data, staff: admins, visible: (id) => canSeeAssigned(staff, id), tz, now });
  const { totals: t } = s;
  // «Проверено»: руководитель; оплату заказа отмечает действие заказов — ему нужно ещё orders.edit.
  const canReview = { deal: can(staff, "team.manage"), order: can(staff, "team.manage", "orders.edit") };
  const own = staff.scope !== "all";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Финансы</h1>
          <p className="text-sm text-muted">
            {period.label} · по времени магазина ({tz}){own ? " · только ваши сделки и заказы" : ""}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="flex rounded-xl border border-line bg-white p-1 text-sm">
            {PRESETS.map(([key, label]) => (
              <Link key={key} href={`/admin/finance?p=${key}`} className={cn("rounded-lg px-3 py-1.5", period.preset === key ? "bg-ink text-white" : "text-ink-soft hover:bg-cream")}>
                {label}
              </Link>
            ))}
          </div>
          <form className={cn("flex w-full items-center gap-1.5 rounded-xl border bg-white p-1 text-sm sm:w-auto", period.preset === "custom" ? "border-ink" : "border-line")} action="/admin/finance">
            <input type="hidden" name="p" value="custom" />
            <input type="date" name="from" defaultValue={period.first} className="input h-8 min-w-0 flex-1 text-sm sm:w-36 sm:flex-none" aria-label="С даты" />
            <span className="text-muted">–</span>
            <input type="date" name="to" defaultValue={period.last} className="input h-8 min-w-0 flex-1 text-sm sm:w-36 sm:flex-none" aria-label="По дату" />
            <button className="btn btn-outline btn-sm h-8 shrink-0">Показать</button>
          </form>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" data-testid="finance-totals">
        <StatTile label="Пришло денег" value={signed(t.net)} delta={t.delta} hint={`онлайн ${formatPrice(t.online)} · вручную ${formatPrice(t.manual)}`} />
        <StatTile label="Возвраты клиентам" value={formatPrice(t.refunds)} hint={t.refundCount ? `${plural(t.refundCount, ["возврат", "возврата", "возвратов"])} за период` : "за период — нет"} />
        <StatTile label="Ожидается доплат" value={formatPrice(t.expected)} hint={`из них книга готова: ${formatPrice(t.expectedReady)}`} />
        <StatTile label="Постоплаты к получению" value={formatPrice(t.postpay)} hint={t.postpayCount ? `${plural(t.postpayCount, ["заказ", "заказа", "заказов"])} в печати и доставке` : "нет"} />
        <StatTile label="Переплаты — нужен возврат" value={formatPrice(t.overpaid)} hint={t.overpaidCount ? plural(t.overpaidCount, ["случай", "случая", "случаев"]) : "нет"} />
      </div>
      <p className="-mt-3 text-xs text-muted">
        Пришло — поступления минус возвраты: платежи по сделкам, оплаты заказов, сертификаты; заказ, оплаченный без записи оплаты, — суммой к оплате на дату оплаты. Каждая
        сумма — один раз: предоплата по договорённости уже вычтена из «к оплате» заказа. Изменение — к прошлому периоду (для месяца — те же числа прошлого месяца).
      </p>

      {t.review.count ? (
        <a href="#review" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900 hover:bg-amber-100/70" data-testid="finance-review-banner">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">
            Проверить: {plural(t.review.count, ["ручное подтверждение", "ручных подтверждения", "ручных подтверждений"])} на {formatPrice(t.review.sum)} — сверьте чеки с поступлениями на счёт.
          </span>
          <span className="text-xs underline">К списку</span>
        </a>
      ) : null}

      <Received s={s} />
      <Expected s={s} />
      <Issues s={s} />
      <Review s={s} canReview={canReview} />
    </div>
  );
}

function Section({ id, title, note, aside, children }: { id: string; title: string; note?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {aside}
      </div>
      {note ? <p className="-mt-2 text-xs text-muted">{note}</p> : null}
      {children}
    </section>
  );
}

function Card({ title, note, className, children }: { title: string; note?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-line bg-white p-5", className)}>
      <h3 className="font-semibold">{title}</h3>
      {note ? <p className="mt-0.5 text-xs text-muted">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Refs({ refs }: { refs: { label: string; href: string }[] }) {
  if (!refs.length) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-col">
      {refs.map((r) => (
        <Link key={r.label} href={r.href} className="whitespace-nowrap text-wine hover:underline">
          {r.label}
        </Link>
      ))}
    </span>
  );
}

function Receipt({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-wine hover:underline">
      <FileText className="size-3.5" /> чек
    </a>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-6 text-center text-sm text-muted">{children}</p>;

function Received({ s }: { s: FinanceScreen }) {
  const t = s.totals;
  return (
    <Section id="received" title="Пришло" aside={<span className="text-sm text-muted">поступило {formatPrice(t.incoming)} · {plural(t.count, ["поступление", "поступления", "поступлений"])}</span>}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="По дням" note="Поступления за день магазина; красная черта — в этот день был возврат.">
          <FinanceColumns data={s.byDay} />
        </Card>
        <Card title="По способам" note="Сертификаты — отдельно, каким бы способом их ни оплатили.">
          <BarList format={formatPrice} rows={s.byMethod.map((m) => ({ label: m.label, value: m.value, note: m.count ? `${m.count} шт.` : undefined }))} />
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="По менеджерам" note="По ответственному сделки, как в аналитике; заказ без сделки — по ответственному заказа. Возвраты вычтены.">
          {s.byManager.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="pb-2 font-medium">Ответственный</th>
                  <th className="pb-2 text-right font-medium">Поступлений</th>
                  <th className="pb-2 text-right font-medium">Пришло</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {s.byManager.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2">{m.label}</td>
                    <td className="py-2 text-right tabular-nums">{m.count}</td>
                    <td className={cn("py-2 text-right font-medium tabular-nums", m.value < 0 && "text-red-700")}>{signed(m.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>За период денег не было.</Empty>
          )}
        </Card>
        <Card title="Откуда" note="Сделки — деньги, принятые менеджерами и по счетам из чата; заказы — оплаты на сайте и в заказе.">
          <BarList format={formatPrice} rows={s.bySource.map((m) => ({ label: m.label, value: m.value, note: m.count ? `${m.count} шт.` : undefined }))} />
        </Card>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">Последние поступления</h3>
          {s.recent.length > RECENT ? <span className="text-xs text-muted">показаны {RECENT} из {s.recent.length}</span> : null}
        </div>
        {s.recent.length ? (
          <table className="w-full min-w-[960px] text-sm" data-testid="finance-recent">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pb-2 font-medium">Когда</th>
                <th className="pb-2 text-right font-medium">Сумма</th>
                <th className="pb-2 pl-4 font-medium">Способ</th>
                <th className="pb-2 font-medium">Что</th>
                <th className="pb-2 font-medium">Сделка / заказ</th>
                <th className="pb-2 font-medium">Клиент</th>
                <th className="pb-2 font-medium">Ответственный</th>
                <th className="pb-2 font-medium">Принял</th>
                <th className="pb-2 font-medium">Чек</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.recent.slice(0, RECENT).map((r) => (
                <tr key={r.key} className="align-top">
                  <td className="py-2 whitespace-nowrap text-muted">{r.dateLabel}</td>
                  <td className={cn("py-2 text-right font-medium whitespace-nowrap tabular-nums", r.refund && "text-red-700")}>{signed(r.amount)}</td>
                  <td className="py-2 pl-4 whitespace-nowrap">{r.method}</td>
                  <td className="py-2">{r.what}</td>
                  <td className="py-2">
                    <Refs refs={r.refs} />
                  </td>
                  <td className="py-2">{r.client || "—"}</td>
                  <td className="py-2">{r.manager}</td>
                  <td className="py-2">{r.acceptedBy}</td>
                  <td className="py-2 text-xs">
                    {r.receiptHref ? <Receipt href={r.receiptHref} /> : r.operation ? <span className="text-muted">операция {r.operation}</span> : <span className="text-muted">—</span>}
                    {r.check === "pending" ? <div className="text-amber-700">не проверено</div> : r.check === "reviewed" ? <div className="text-emerald-700">проверено</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>За период поступлений нет.</Empty>
        )}
      </div>
    </Section>
  );
}

function Expected({ s }: { s: FinanceScreen }) {
  const t = s.totals;
  const rows = s.expected.rows;
  return (
    <Section
      id="expected"
      title="Ожидается"
      note="Сколько клиенты ещё должны: остаток договорённости по сделкам без заказа (договорённость − оплачено), заказы, ждущие оплаты, и постоплаты. Открытый счёт из чата — часть остатка своей сделки и к итогу не прибавляется. Готовность книги — по ответам (своя книга — по словам) и вехам воронки."
      aside={
        <span className="text-sm">
          всего <b className="tabular-nums">{formatPrice(t.expectedAll)}</b> · из них книга готова <b className="tabular-nums">{formatPrice(t.expectedAllReady)}</b>
        </span>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {s.expected.groups.map((g) => (
          <div key={g.key} className={cn("rounded-2xl border p-4", g.key === "ready" ? "border-emerald-200 bg-emerald-50/60" : "border-line bg-white")}>
            <div className="text-xs text-muted">{g.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{formatPrice(g.value)}</div>
            <div className="text-xs text-muted">{plural(g.count, ["клиент", "клиента", "клиентов"])}</div>
          </div>
        ))}
        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="text-xs text-muted">Открытые счета из чата</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{formatPrice(s.expected.invoices.sum)}</div>
          <div className="text-xs text-muted">{plural(s.expected.invoices.count, ["счёт", "счёта", "счетов"])} · входят в остатки</div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white p-5">
        {rows.length ? (
          <table className="w-full min-w-[980px] text-sm" data-testid="finance-expected">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pb-2 font-medium">Клиент</th>
                <th className="pb-2 font-medium">Сделка / заказ</th>
                <th className="pb-2 font-medium">Ответственный</th>
                <th className="pb-2 text-right font-medium">Договорённость</th>
                <th className="pb-2 text-right font-medium">Оплачено</th>
                <th className="pb-2 text-right font-medium">Остаток</th>
                <th className="pb-2 pl-4 font-medium">Книга</th>
                <th className="pb-2 font-medium">Срок</th>
                <th className="pb-2 font-medium">Счёт и заметки</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.slice(0, EXPECTED).map((r) => (
                <tr key={r.key} className="align-top">
                  <td className="py-2">{r.client || "—"}</td>
                  <td className="py-2 whitespace-nowrap">
                    <Link href={r.href} className="text-wine hover:underline">
                      {r.ref}
                    </Link>
                  </td>
                  <td className="py-2">{r.manager}</td>
                  <td className="py-2 text-right tabular-nums">{formatPrice(r.total)}</td>
                  <td className="py-2 text-right tabular-nums">{formatPrice(r.paid)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{formatPrice(r.left)}</td>
                  <td className="py-2 pl-4">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs whitespace-nowrap", r.group === "ready" ? "bg-emerald-100 text-emerald-800" : r.group === "progress" ? "bg-amber-100 text-amber-800" : "bg-cream text-ink-soft")}>{r.bookLabel}</span>
                  </td>
                  <td className={cn("py-2 whitespace-nowrap", r.overdue ? "text-red-700" : "text-muted")}>{r.dueLabel ?? "—"}</td>
                  <td className="py-2 text-xs text-muted">{[r.invoice, r.note].filter(Boolean).join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Никто ничего не должен.</Empty>
        )}
        {rows.length > EXPECTED ? <p className="pt-3 text-xs text-muted">Показаны {EXPECTED} из {rows.length} — сначала те, у кого книга готова, по убыванию остатка.</p> : null}
      </div>
    </Section>
  );
}

function Issues({ s }: { s: FinanceScreen }) {
  return (
    <Section
      id="refunds"
      title="Переплаты и возвраты"
      note={`Деньги, которые нужно вернуть клиенту или зачесть: оплачено больше договорённости или заказа, сделка в отказе с деньгами, отменённый заказ с оплатой, оплата Kaspi по закрытому счёту, после заказа или с суммой не по счёту (последние ${REFUND_WINDOW_DAYS} дней). Переплата по сделке уходит из списка, когда в сделке записан возврат.`}
    >
      <div className="overflow-x-auto rounded-2xl border border-line bg-white p-5">
        {s.issues.length ? (
          <table className="w-full min-w-[860px] text-sm" data-testid="finance-issues">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pb-2 font-medium">Что случилось</th>
                <th className="pb-2 font-medium">Сделка / заказ</th>
                <th className="pb-2 font-medium">Клиент</th>
                <th className="pb-2 font-medium">Ответственный</th>
                <th className="pb-2 text-right font-medium">Сумма</th>
                <th className="pb-2 pl-4 font-medium">Подробности</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.issues.map((i) => (
                <tr key={i.key} className="align-top">
                  <td className="py-2 font-medium">{i.title}</td>
                  <td className="py-2 whitespace-nowrap">
                    {i.href ? (
                      <Link href={i.href} className="text-wine hover:underline">
                        {i.ref}
                      </Link>
                    ) : (
                      i.ref
                    )}
                  </td>
                  <td className="py-2">{i.client || "—"}</td>
                  <td className="py-2">{i.manager}</td>
                  <td className="py-2 text-right font-semibold whitespace-nowrap tabular-nums">{formatPrice(i.amount)}</td>
                  <td className="py-2 pl-4 text-xs text-muted">
                    {i.note}
                    {i.dateLabel ? ` · ${i.dateLabel}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Переплат нет.</Empty>
        )}
      </div>
      {s.refunds.length ? (
        <Card title="Возвраты за период" note="Записаны в сделках с чеком возврата; уже вычтены из «Пришло».">
          <ul className="divide-y divide-line text-sm">
            {s.refunds.map((r) => (
              <li key={r.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                <span className="w-32 text-muted">{r.dateLabel}</span>
                <span className="w-28 font-medium text-red-700 tabular-nums">{signed(r.amount)}</span>
                <Refs refs={r.refs} />
                <span className="min-w-0 flex-1 truncate">{r.client}</span>
                <span className="text-xs text-muted">принял {r.acceptedBy}</span>
                <Receipt href={r.receiptHref} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </Section>
  );
}

function Review({ s, canReview }: { s: FinanceScreen; canReview: { deal: boolean; order: boolean } }) {
  return (
    <Section
      id="review"
      title="Проверить"
      note="Деньги, которые записал сотрудник по чеку перевода. Откройте чек, сверьте с поступлением на счёт (Kaspi, банк) и отметьте «Проверено». Онлайн-оплаты подтверждает платёжная система — их проверять не нужно."
      aside={s.review.length ? <span className="text-sm text-muted">{plural(s.review.length, ["запись", "записи", "записей"])} на {formatPrice(s.totals.review.sum)}</span> : null}
    >
      <div className="overflow-x-auto rounded-2xl border border-line bg-white p-5">
        {s.review.length ? (
          <table className="w-full min-w-[860px] text-sm" data-testid="finance-review-list">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pb-2 font-medium">Когда</th>
                <th className="pb-2 text-right font-medium">Сумма</th>
                <th className="pb-2 pl-4 font-medium">Что</th>
                <th className="pb-2 font-medium">Сделка / заказ</th>
                <th className="pb-2 font-medium">Клиент</th>
                <th className="pb-2 font-medium">Принял</th>
                <th className="pb-2 font-medium">Чек</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.review.map((r) => (
                <tr key={r.key} className="align-top">
                  <td className="py-2 whitespace-nowrap text-muted">{r.dateLabel}</td>
                  <td className="py-2 text-right font-medium whitespace-nowrap tabular-nums">{formatPrice(r.amount)}</td>
                  <td className="py-2 pl-4">
                    {r.what}
                    {r.invoice ? <span className="text-muted"> · {r.invoice}</span> : null}
                    {r.note ? <div className="text-xs text-muted">{r.note}</div> : null}
                  </td>
                  <td className="py-2">
                    <Refs refs={r.refs} />
                  </td>
                  <td className="py-2">{r.client || "—"}</td>
                  <td className="py-2">{r.acceptedBy}</td>
                  <td className="py-2 text-xs">{r.receiptHref ? <Receipt href={r.receiptHref} /> : <span className="text-red-700">нет чека</span>}</td>
                  <td className="py-2 text-right">{canReview[r.kind] ? <ReviewButton kind={r.kind} id={r.id} /> : <span className="text-xs text-muted">проверяет руководитель</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Все ручные подтверждения проверены.</Empty>
        )}
      </div>
    </Section>
  );
}
