import Link from "next/link";
import { z } from "zod";
import { CircleCheck, Download, FileText, HandCoins, ReceiptText, ShieldCheck, Wallet } from "lucide-react";
import { container } from "@/server/container";
import { can, canWork, requireStaff } from "@/server/access";
import { storeTimeZone } from "@/shared/domain/time";
import { formatPrice } from "@/config/site";
import { BarList, StatRow, StatTile } from "@/components/admin/charts";
import { cn } from "@/lib/class-names";
import { Segmented } from "@/components/admin/Segmented";
import { PageHeader } from "@/components/admin/PageHeader";
import { Intro } from "@/components/admin/Intro";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
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

/** Отступы первой и последней колонки таблицы — по полям листа (как в обзоре). */
const EDGE = "[&_td:first-child]:pl-4 [&_th:first-child]:pl-4 sm:[&_td:first-child]:pl-5 sm:[&_th:first-child]:pl-5 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4 sm:[&_td:last-child]:pr-5 sm:[&_th:last-child]:pr-5";

/**
 * «Финансы»: сколько денег пришло за период, сколько ещё ждём (остатки договорённостей — особенно у тех, чья книга
 * готова, заказы на оплате, постоплаты), что нужно вернуть и какие ручные подтверждения не проверены.
 * Видят сотрудники с аналитикой (analytics.view; роль «только свои» — по своим сделкам и заказам), «Проверено» — руководитель (team.manage).
 *
 * Порядок экрана (DESIGN.md §7): период → пять сумм одной строкой → «Проверить», если есть что проверять → разделы.
 */
export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff("analytics.view");
  const q = query.parse(await searchParams);
  const tz = storeTimeZone();
  const now = new Date();
  const period = financePeriod({ preset: q.p, from: q.from, to: q.to, now, tz });
  const [data, admins] = await Promise.all([container().reporting.finance({ from: period.prev.from, to: period.to }), container().access.queries.allStaff()]);
  // Роль «только свои» — строго свои деньги: ничьи заказы, сертификаты и пакеты с сайта — деньги магазина, их видит руководство.
  const s = financeScreen({ period, ...data, staff: admins, visible: (id) => canWork(staff, id), viewerId: staff.context.isOwner ? null : staff.user.id, tz, now });
  const badPeriod = q.p === "custom" && period.preset !== "custom";
  const { totals: t } = s;
  // «Проверено»: руководитель; оплату заказа отмечает действие заказов — ему нужно ещё orders.edit.
  const canReview = { deal: can(staff, "team.manage"), order: can(staff, "team.manage", "orders.edit") };
  const own = staff.scope !== "all";
  const exportHref = `/api/admin/export/finance?${new URLSearchParams(period.preset === "custom" ? { p: "custom", from: period.first, to: period.last } : { p: period.preset })}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Финансы"
        actions={
          s.recent.length ? (
            <a href={exportHref} className="btn btn-outline btn-sm" data-testid="finance-export">
              <Download className="size-4" strokeWidth={1.8} aria-hidden /> Скачать CSV
            </a>
          ) : null
        }
      >
        {period.label}, по времени магазина ({tz}){own ? ". Только ваши сделки и заказы" : ""}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Период" items={PRESETS.map(([key, label]) => ({ key, label, href: `/admin/finance?p=${key}`, active: period.preset === key }))} />
        <form action="/admin/finance" className={cn("flex w-full items-center gap-1.5 rounded-xl border bg-white p-1 text-sm sm:w-auto", period.preset === "custom" ? "border-ink" : "border-line")} aria-label="Свой период">
          <input type="hidden" name="p" value="custom" />
          <input type="date" name="from" defaultValue={period.first} className="input h-10 min-w-0 flex-1 px-2.5 text-sm sm:w-36 sm:flex-none lg:h-8" aria-label="С даты" />
          <span className="text-muted" aria-hidden>
            –
          </span>
          <input type="date" name="to" defaultValue={period.last} className="input h-10 min-w-0 flex-1 px-2.5 text-sm sm:w-36 sm:flex-none lg:h-8" aria-label="По дату" />
          <button className="btn btn-ghost btn-sm shrink-0 lg:h-8">Показать</button>
        </form>
      </div>

      {badPeriod ? <Alert kind="warning">Даты не подошли (начало позже конца, будущее или период длиннее года) — показан текущий месяц.</Alert> : null}

      <section aria-label="Итоги периода" className="space-y-2" data-testid="finance-totals">
        <StatRow cols={5} className="max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:max-xl:[&>*:last-child]:col-span-2">
          <StatTile bare label="Пришло денег" value={signed(t.net)} delta={t.delta} hint={`онлайн ${formatPrice(t.online)}, вручную ${formatPrice(t.manual)}`} />
          <StatTile bare label="Возвраты клиентам" value={formatPrice(t.refunds)} hint={t.refundCount ? `${plural(t.refundCount, ["возврат", "возврата", "возвратов"])} за период` : "за период — нет"} />
          <StatTile bare label="Ожидается доплат" value={formatPrice(t.expected)} hint={`книга готова: ${formatPrice(t.expectedReady)}`} href="#expected" />
          <StatTile bare label="Постоплаты к получению" value={formatPrice(t.postpay)} hint={t.postpayCount ? `${plural(t.postpayCount, ["заказ", "заказа", "заказов"])} в печати и доставке` : "нет"} />
          <StatTile bare label="Нужно вернуть" value={formatPrice(t.overpaid)} hint={t.overpaidCount ? `переплаты: ${plural(t.overpaidCount, ["случай", "случая", "случаев"])}` : "переплат нет"} href={t.overpaidCount ? "#refunds" : undefined} />
        </StatRow>
        <Intro small>
          Пришло — поступления минус возвраты: платежи по сделкам, оплаты заказов, сертификаты, пакеты ИИ-дизайнера и минут видео; заказ, оплаченный без записи оплаты, — суммой к оплате на дату оплаты. Каждая сумма — один раз:
          предоплата по договорённости уже вычтена из «к оплате» заказа. Изменение — к прошлому периоду (для месяца — те же числа прошлого месяца). «Выручка» на обзоре считается иначе — по продажам: успешная сделка без денег
          входит суммой договорённости, сертификаты и пакеты — нет; поэтому цифры могут не совпадать.
        </Intro>
      </section>

      {t.review.count ? (
        <div className="flex flex-col gap-3 rounded-[14px] border border-warning/30 bg-warning-bg px-4 py-3.5 text-warning sm:flex-row sm:items-center sm:px-5" data-testid="finance-review-banner">
          <ShieldCheck className="size-5 shrink-0 max-sm:hidden" strokeWidth={1.8} aria-hidden />
          <p className="flex-1 text-sm">
            <span className="font-semibold">
              Проверить: {plural(t.review.count, ["ручное подтверждение", "ручных подтверждения", "ручных подтверждений"])} на {formatPrice(t.review.sum)}.
            </span>{" "}
            Сверьте чеки с поступлениями на счёт.
          </p>
          <a href="#review" className="btn btn-dark btn-sm shrink-0">
            Проверить
          </a>
        </div>
      ) : null}

      <nav aria-label="Разделы финансов" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {[
          ["#received", "Пришло", formatPrice(t.incoming)],
          ["#expected", "Ожидается", formatPrice(t.expectedAll)],
          ["#refunds", "Переплаты и возвраты", s.issues.length ? String(s.issues.length) : null],
          ["#review", "Проверить", s.review.length ? String(s.review.length) : null],
        ].map(([href, label, note]) => (
          <a key={href} href={href!} className="chip h-10 shrink-0 lg:h-8">
            {label}
            {note ? <span className="text-xs text-muted tabular-nums">{note}</span> : null}
          </a>
        ))}
      </nav>

      <Received s={s} />
      <Expected s={s} />
      <Issues s={s} />
      <Review s={s} canReview={canReview} />
    </div>
  );
}

/** Раздел страницы: заголовок, сводка справа, пояснение в две строки. */
function Part({ id, title, note, aside, children }: { id: string; title: string; note?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-[calc(var(--topbar-h)+1rem)] space-y-3">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id={`${id}-h`} className="text-lg font-semibold">
            {title}
          </h2>
          {aside ? <div className="text-sm text-muted tabular-nums">{aside}</div> : null}
        </div>
        {note ? <Intro small className="mt-0.5 max-w-3xl">{note}</Intro> : null}
      </div>
      {children}
    </section>
  );
}

function Refs({ refs }: { refs: { label: string; href: string }[] }) {
  if (!refs.length) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-x-2">
      {refs.map((r) => (
        <Link key={r.label} href={r.href} className="font-medium whitespace-nowrap text-wine hover:underline">
          {r.label}
        </Link>
      ))}
    </span>
  );
}

function Receipt({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 text-wine hover:underline">
      <FileText className="size-3.5" strokeWidth={1.8} aria-hidden /> чек
    </a>
  );
}

/** Отметка проверки ручного подтверждения: цвет и текст вместе. */
function Check({ check }: { check: string | null | undefined }) {
  if (check === "pending") return <Badge tone="warning">не проверено</Badge>;
  if (check === "reviewed") return <Badge tone="success">проверено</Badge>;
  return null;
}

/** Карточка строки на телефоне: сверху — главное и сумма, ниже — подписи и значения в две колонки. */
function MobileCard({ top, amount, amountClass, children }: { top: React.ReactNode; amount: React.ReactNode; amountClass?: string; children: React.ReactNode }) {
  return (
    <li className="space-y-2 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 text-sm">{top}</div>
        <div className={cn("shrink-0 text-[15px] font-semibold whitespace-nowrap tabular-nums", amountClass)}>{amount}</div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">{children}</dl>
    </li>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function Received({ s }: { s: FinanceScreen }) {
  const t = s.totals;
  const recent = s.recent.slice(0, RECENT);
  return (
    <Part id="received" title="Пришло" aside={<>поступило {formatPrice(t.incoming)}, {plural(t.count, ["поступление", "поступления", "поступлений"])}</>}>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="По дням" description="Поступления за день магазина; красная черта внизу — в этот день был возврат">
          {s.byDay.some((d) => d.incoming || d.refunds) ? (
            <FinanceColumns data={s.byDay} />
          ) : (
            <EmptyState compact icon={Wallet} title="За период денег не было">
              Столбцы по дням появятся с первым поступлением.
            </EmptyState>
          )}
        </Panel>
        <Panel title="По способам" description="Сертификаты — отдельно, каким бы способом их ни оплатили">
          <BarList format={formatPrice} rows={s.byMethod.map((m) => ({ label: m.label, value: m.value, note: m.count ? `${m.count} шт.` : undefined }))} />
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel flush title="По менеджерам" description="По ответственному сделки; заказ без сделки — по ответственному заказа. Возвраты вычтены">
          {s.byManager.length ? (
            <table className={cn("table", EDGE)}>
              <thead>
                <tr>
                  <th>Ответственный</th>
                  <th className="text-right">Поступлений</th>
                  <th className="text-right">Пришло</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {s.byManager.map((m) => (
                  <tr key={m.id}>
                    <td className="font-medium">{m.label}</td>
                    <td className="text-right text-muted">{m.count}</td>
                    <td className={cn("text-right font-medium", m.value < 0 && "text-danger")}>{signed(m.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState compact icon={Wallet} title="За период денег не было">
              Платежи по сделкам и оплаты заказов появятся здесь по ответственным.
            </EmptyState>
          )}
        </Panel>
        <Panel title="Откуда" description="Сделки — деньги менеджеров и счета из чата; заказы — оплаты на сайте и в заказе">
          <BarList format={formatPrice} rows={s.bySource.map((m) => ({ label: m.label, value: m.value, note: m.count ? `${m.count} шт.` : undefined }))} />
        </Panel>
      </div>
      <Panel flush title="Последние поступления" description={s.recent.length > RECENT ? `Показаны ${RECENT} из ${s.recent.length} — все строки в «Скачать CSV»` : undefined}>
        {recent.length ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className={cn("table min-w-[960px]", EDGE)} data-testid="finance-recent">
                <thead>
                  <tr>
                    <th>Когда</th>
                    <th className="text-right">Сумма</th>
                    <th>Способ</th>
                    <th>Что</th>
                    <th>Сделка / заказ</th>
                    <th>Клиент</th>
                    <th>Ответственный</th>
                    <th>Принял</th>
                    <th>Чек</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.key}>
                      <td className="whitespace-nowrap text-muted">{r.dateLabel}</td>
                      <td className={cn("text-right font-medium whitespace-nowrap tabular-nums", r.refund && "text-danger")}>{signed(r.amount)}</td>
                      <td className="whitespace-nowrap">{r.method}</td>
                      <td>{r.what}</td>
                      <td>
                        <Refs refs={r.refs} />
                      </td>
                      <td>{r.client || "—"}</td>
                      <td>{r.manager}</td>
                      <td>{r.acceptedBy}</td>
                      <td className="text-xs">
                        <span className="flex flex-col items-start gap-1">
                          {r.receiptHref ? <Receipt href={r.receiptHref} /> : r.operation ? <span className="text-muted">операция {r.operation}</span> : <span className="text-muted">—</span>}
                          <Check check={r.check} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line lg:hidden">
              {recent.map((r) => (
                <MobileCard key={r.key} top={<span className="text-muted">{r.dateLabel}</span>} amount={signed(r.amount)} amountClass={r.refund ? "text-danger" : undefined}>
                  <Row label="Что">
                    {r.what}, {r.method}
                  </Row>
                  {r.refs.length ? (
                    <Row label="Где">
                      <Refs refs={r.refs} />
                    </Row>
                  ) : null}
                  {r.client ? <Row label="Клиент">{r.client}</Row> : null}
                  <Row label="Принял">{r.acceptedBy}</Row>
                  {r.receiptHref || r.operation || r.check ? (
                    <Row label="Чек">
                      <span className="flex flex-wrap items-center gap-2">
                        {r.receiptHref ? <Receipt href={r.receiptHref} /> : r.operation ? <span className="text-muted">операция {r.operation}</span> : null}
                        <Check check={r.check} />
                      </span>
                    </Row>
                  ) : null}
                </MobileCard>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState compact icon={Wallet} title="За период поступлений нет">
            Выберите другой период или примите оплату в сделке.
          </EmptyState>
        )}
      </Panel>
    </Part>
  );
}

const BOOK_TONE = { ready: "success", progress: "warning", none: "neutral" } as const;

function Expected({ s }: { s: FinanceScreen }) {
  const t = s.totals;
  const rows = s.expected.rows.slice(0, EXPECTED);
  return (
    <Part
      id="expected"
      title="Ожидается"
      note="Сколько клиенты ещё должны: остаток договорённости по сделкам без заказа (договорённость − оплачено), заказы, ждущие оплаты, и постоплаты. Открытый счёт из чата — часть остатка своей сделки и к итогу не прибавляется. Готовность книги — по ответам (своя книга — по словам) и вехам воронки."
      aside={
        <>
          всего <b className="font-semibold text-ink">{formatPrice(t.expectedAll)}</b>, книга готова <b className="font-semibold text-ink">{formatPrice(t.expectedAllReady)}</b>
        </>
      }
    >
      <StatRow cols={s.expected.groups.length + 1 >= 5 ? 5 : 4}>
        {s.expected.groups.map((g) => (
          <div key={g.key} className="bg-white p-4">
            <div className="flex items-center gap-1.5 text-sm text-muted">
              {g.key === "ready" ? <span className="size-2 rounded-full bg-success" aria-hidden /> : null}
              {g.label}
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{formatPrice(g.value)}</div>
            <div className="text-xs text-muted">{plural(g.count, ["клиент", "клиента", "клиентов"])}</div>
          </div>
        ))}
        <div className="bg-white p-4">
          <div className="text-sm text-muted">Открытые счета из чата</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{formatPrice(s.expected.invoices.sum)}</div>
          <div className="text-xs text-muted">{plural(s.expected.invoices.count, ["счёт", "счёта", "счетов"])}, входят в остатки</div>
        </div>
      </StatRow>
      <Panel flush title="Кто должен" description={s.expected.rows.length > EXPECTED ? `Показаны ${EXPECTED} из ${s.expected.rows.length} — сначала те, у кого книга готова, по убыванию остатка` : "Сначала те, у кого книга готова, по убыванию остатка"}>
        {rows.length ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className={cn("table min-w-[980px]", EDGE)} data-testid="finance-expected">
                <thead>
                  <tr>
                    <th>Клиент</th>
                    <th>Сделка / заказ</th>
                    <th>Ответственный</th>
                    <th className="text-right">Договорённость</th>
                    <th className="text-right">Оплачено</th>
                    <th className="text-right">Остаток</th>
                    <th>Книга</th>
                    <th>Срок</th>
                    <th>Счёт и заметки</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td className="font-medium">{r.client || "—"}</td>
                      <td className="whitespace-nowrap">
                        <Link href={r.href} className="font-medium text-wine hover:underline">
                          {r.ref}
                        </Link>
                      </td>
                      <td>{r.manager}</td>
                      <td className="text-right text-muted tabular-nums">{formatPrice(r.total)}</td>
                      <td className="text-right text-muted tabular-nums">{formatPrice(r.paid)}</td>
                      <td className="text-right font-semibold tabular-nums">{formatPrice(r.left)}</td>
                      <td>
                        <Badge tone={BOOK_TONE[r.group]}>{r.bookLabel}</Badge>
                      </td>
                      <td className={cn("whitespace-nowrap", r.overdue ? "font-medium text-danger" : "text-muted")}>{r.dueLabel ?? "—"}</td>
                      <td className="text-xs text-muted">{[r.invoice, r.note].filter(Boolean).join("; ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line lg:hidden">
              {rows.map((r) => (
                <MobileCard
                  key={r.key}
                  top={
                    <span className="flex flex-col">
                      <span className="truncate font-medium">{r.client || "—"}</span>
                      <Link href={r.href} className="text-wine hover:underline">
                        {r.ref}
                      </Link>
                    </span>
                  }
                  amount={formatPrice(r.left)}
                >
                  <Row label="Книга">
                    <Badge tone={BOOK_TONE[r.group]}>{r.bookLabel}</Badge>
                  </Row>
                  <Row label="Оплачено">
                    <span className="tabular-nums">
                      {formatPrice(r.paid)} из {formatPrice(r.total)}
                    </span>
                  </Row>
                  {r.dueLabel ? (
                    <Row label="Срок">
                      <span className={r.overdue ? "font-medium text-danger" : undefined}>{r.dueLabel}</span>
                    </Row>
                  ) : null}
                  <Row label="Ведёт">{r.manager}</Row>
                  {r.invoice || r.note ? <Row label="Заметки">{[r.invoice, r.note].filter(Boolean).join("; ")}</Row> : null}
                </MobileCard>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState compact icon={HandCoins} title="Никто ничего не должен">
            Остатки по договорённостям, заказы на оплате и постоплаты появятся здесь.
          </EmptyState>
        )}
      </Panel>
    </Part>
  );
}

function Issues({ s }: { s: FinanceScreen }) {
  return (
    <Part
      id="refunds"
      title="Переплаты и возвраты"
      note={`Деньги, которые нужно вернуть клиенту или зачесть: оплачено больше договорённости или заказа, сделка в отказе с деньгами, отменённый заказ с оплатой, оплата Kaspi по закрытому счёту, после заказа или с суммой не по счёту (последние ${REFUND_WINDOW_DAYS} дней). Деньги по сделке (переплата, отказ, лишнее после заказа, отменённый заказ) уходят из списка, когда в сделке оформлен возврат с чеком.`}
      aside={s.issues.length ? plural(s.issues.length, ["случай", "случая", "случаев"]) : null}
    >
      <Panel flush title="Нужно вернуть или зачесть">
        {s.issues.length ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className={cn("table min-w-[860px]", EDGE)} data-testid="finance-issues">
                <thead>
                  <tr>
                    <th>Что случилось</th>
                    <th>Сделка / заказ</th>
                    <th>Клиент</th>
                    <th>Ответственный</th>
                    <th className="text-right">Сумма</th>
                    <th>Подробности</th>
                  </tr>
                </thead>
                <tbody>
                  {s.issues.map((i) => (
                    <tr key={i.key}>
                      <td className="font-medium">{i.title}</td>
                      <td className="whitespace-nowrap">
                        {i.href ? (
                          <Link href={i.href} className="font-medium text-wine hover:underline">
                            {i.ref}
                          </Link>
                        ) : (
                          i.ref
                        )}
                      </td>
                      <td>{i.client || "—"}</td>
                      <td>{i.manager}</td>
                      <td className="text-right font-semibold whitespace-nowrap tabular-nums">{formatPrice(i.amount)}</td>
                      <td className="text-xs text-muted">
                        {i.note}
                        {i.dateLabel ? `, ${i.dateLabel}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line lg:hidden">
              {s.issues.map((i) => (
                <MobileCard key={i.key} top={<span className="font-medium">{i.title}</span>} amount={formatPrice(i.amount)}>
                  <Row label="Где">
                    {i.href ? (
                      <Link href={i.href} className="text-wine hover:underline">
                        {i.ref}
                      </Link>
                    ) : (
                      i.ref
                    )}
                  </Row>
                  {i.client ? <Row label="Клиент">{i.client}</Row> : null}
                  <Row label="Ведёт">{i.manager}</Row>
                  {i.note || i.dateLabel ? <Row label="Подробно">{[i.note, i.dateLabel].filter(Boolean).join(", ")}</Row> : null}
                </MobileCard>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState compact icon={CircleCheck} title="Переплат нет">
            Если клиент заплатит больше договорённости или сделка уйдёт в отказ с деньгами, она появится здесь.
          </EmptyState>
        )}
      </Panel>
      {s.refunds.length ? (
        <Panel flush title="Возвраты за период" description="Записаны в сделках с чеком возврата; уже вычтены из «Пришло»">
          <ul className="divide-y divide-line text-sm">
            {s.refunds.map((r) => (
              <li key={r.key} className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5">
                <span className="w-28 shrink-0 font-semibold text-danger tabular-nums">{signed(r.amount)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.client || "—"}</span>
                  <span className="block text-xs text-muted">
                    {r.dateLabel}, принял {r.acceptedBy}
                  </span>
                </span>
                <Refs refs={r.refs} />
                <Receipt href={r.receiptHref} />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </Part>
  );
}

function Review({ s, canReview }: { s: FinanceScreen; canReview: { deal: boolean; order: boolean } }) {
  const action = (r: FinanceScreen["review"][number]) =>
    !canReview[r.kind] ? <span className="text-xs text-muted">проверяет руководитель</span> : r.mine ? <span className="text-xs text-muted">ваша запись — проверяет другой сотрудник</span> : <ReviewButton kind={r.kind} id={r.id} />;
  return (
    <Part
      id="review"
      title="Проверить"
      note="Деньги и возвраты, которые записал сотрудник по чеку перевода. Откройте чек, сверьте с поступлением на счёт (Kaspi, банк) и отметьте «Проверено». Онлайн-оплаты подтверждает платёжная система — их проверять не нужно."
      aside={s.review.length ? <>{plural(s.review.length, ["запись", "записи", "записей"])} на {formatPrice(s.totals.review.sum)}</> : null}
    >
      <Panel flush>
        {s.review.length ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className={cn("table min-w-[860px]", EDGE)} data-testid="finance-review-list">
                <thead>
                  <tr>
                    <th>Когда</th>
                    <th className="text-right">Сумма</th>
                    <th>Что</th>
                    <th>Сделка / заказ</th>
                    <th>Клиент</th>
                    <th>Принял</th>
                    <th>Чек</th>
                    <th>
                      <span className="sr-only">Действие</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {s.review.map((r) => (
                    <tr key={r.key}>
                      <td className="whitespace-nowrap text-muted">{r.dateLabel}</td>
                      <td className={cn("text-right font-semibold whitespace-nowrap tabular-nums", r.refund && "text-danger")}>{r.refund ? signed(-r.amount) : formatPrice(r.amount)}</td>
                      <td>
                        {r.what}
                        {r.invoice ? <span className="text-muted">, {r.invoice}</span> : null}
                        {r.note ? <div className="text-xs text-muted">{r.note}</div> : null}
                      </td>
                      <td>
                        <Refs refs={r.refs} />
                      </td>
                      <td>{r.client || "—"}</td>
                      <td>{r.acceptedBy}</td>
                      <td className="text-xs">{r.receiptHref ? <Receipt href={r.receiptHref} /> : <Badge tone="danger">нет чека</Badge>}</td>
                      <td className="text-right">{action(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line lg:hidden">
              {s.review.map((r) => (
                <MobileCard key={r.key} top={<span className="text-muted">{r.dateLabel}</span>} amount={r.refund ? signed(-r.amount) : formatPrice(r.amount)} amountClass={r.refund ? "text-danger" : undefined}>
                  <Row label="Что">
                    {r.what}
                    {r.invoice ? `, ${r.invoice}` : ""}
                    {r.note ? <span className="block text-xs text-muted">{r.note}</span> : null}
                  </Row>
                  {r.refs.length ? (
                    <Row label="Где">
                      <Refs refs={r.refs} />
                    </Row>
                  ) : null}
                  {r.client ? <Row label="Клиент">{r.client}</Row> : null}
                  <Row label="Принял">{r.acceptedBy}</Row>
                  <Row label="Чек">{r.receiptHref ? <Receipt href={r.receiptHref} /> : <Badge tone="danger">нет чека</Badge>}</Row>
                  <dd className="col-span-2 pt-1.5 [&_.btn]:w-full [&>span]:w-full [&>span]:items-stretch">{action(r)}</dd>
                </MobileCard>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState compact icon={ReceiptText} title="Всё проверено">
            Ручные подтверждения оплат с чеками появятся здесь, когда их запишут сотрудники.
          </EmptyState>
        )}
      </Panel>
    </Part>
  );
}
