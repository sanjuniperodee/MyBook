import Link from "next/link";
import { z } from "zod";
import { CircleCheck, Download, FileText, HandCoins, ShieldCheck, Wallet } from "lucide-react";
import { container } from "@/server/container";
import { can, canWork, requireStaff } from "@/server/access";
import { storeTimeZone } from "@/shared/domain/time";
import { formatPrice } from "@/config/site";
import { BarList, StatRow, StatTile } from "@/components/admin/charts";
import { cn } from "@/lib/class-names";
import { Segmented } from "@/components/admin/Segmented";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionHead } from "@/components/admin/SectionHead";
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
 * «Финансы» — «Очередь + показатели» (DESIGN.md §7.2): сверху то, что требует действия — «Проверить»: ручные подтверждения
 * оплат (сверить чек со счётом, нажать «Проверено») и деньги, которые нужно вернуть или зачесть; затем сколько пришло за
 * период одной строкой цифр, график по дням и «по способам», затем ведомости: последние поступления, кто ещё должен, возвраты.
 * Видят сотрудники с аналитикой (analytics.view; роль «только свои» — по своим сделкам и заказам), «Проверено» — руководитель (team.manage).
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
    <div className="flex flex-col gap-5 lg:gap-6">
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

      <Queue s={s} canReview={canReview} />

      <section aria-label="Итоги периода" className="space-y-3" data-testid="finance-totals">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Период" items={PRESETS.map(([key, label]) => ({ key, label, href: `/admin/finance?p=${key}`, active: period.preset === key }))} />
          <form action="/admin/finance" className={cn("flex w-full flex-wrap items-center gap-1.5 rounded-[var(--r-ctl)] border bg-white p-0.5 text-sm sm:w-auto sm:flex-nowrap", period.preset === "custom" ? "border-ink" : "border-line")} aria-label="Свой период">
            <input type="hidden" name="p" value="custom" />
            <input type="date" name="from" defaultValue={period.first} className="input min-w-0 flex-1 border-0 px-2.5 text-sm sm:h-[calc(var(--ctl-h-sm)-4px)] sm:w-36 sm:flex-none" aria-label="С даты" />
            <span className="text-muted" aria-hidden>
              –
            </span>
            <input type="date" name="to" defaultValue={period.last} className="input min-w-0 flex-1 border-0 px-2.5 text-sm sm:h-[calc(var(--ctl-h-sm)-4px)] sm:w-36 sm:flex-none" aria-label="По дату" />
            {/* На телефоне — отдельной строкой: датам нужна вся ширина, иначе год обрезается. */}
            <button className="btn btn-ghost btn-sm shrink-0 max-sm:w-full">Показать</button>
          </form>
        </div>

        {badPeriod ? <Alert kind="warning">Даты не подошли (начало позже конца, будущее или период длиннее года) — показан текущий месяц.</Alert> : null}

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

      <Received s={s} />
      <Expected s={s} />
      <Reports s={s} />
    </div>
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

/** Подзаголовок группы внутри очереди: на подложке, число записей и сумма справа. */
function QueueGroup({ id, title, meta, children }: { id?: string; title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-[calc(var(--topbar-h)+1rem)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line bg-sunken/70 px-4 py-2 text-xs sm:px-5">
        <h3 className="font-semibold text-ink-soft">{title}</h3>
        {meta ? <span className="text-muted tabular-nums">{meta}</span> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Очередь «Проверить»: сверху страницы то, что ждёт человека. Ручные подтверждения — строкой с кнопкой «Проверено» (чек
 * открывается в строке), деньги к возврату или зачёту — строкой со ссылкой на сделку или заказ. Когда проверять нечего —
 * одна спокойная строка. id review и refunds — якоря для плиток показателей и ссылок из других экранов.
 */
function Queue({ s, canReview }: { s: FinanceScreen; canReview: { deal: boolean; order: boolean } }) {
  const total = s.review.length + s.issues.length;
  if (!total)
    return (
      <div className="panel flex items-center gap-3 px-4 py-3 sm:px-5" data-testid="finance-queue-empty">
        <CircleCheck className="size-5 shrink-0 text-success" strokeWidth={1.8} aria-hidden />
        <p id="review" className="scroll-mt-[calc(var(--topbar-h)+1rem)] text-sm">
          <span id="refunds" className="font-medium">
            Проверять нечего.
          </span>{" "}
          <span className="text-muted">Ручные подтверждения оплат сверены, переплат и возвратов к оформлению нет.</span>
        </p>
      </div>
    );
  const action = (r: FinanceScreen["review"][number]) =>
    !canReview[r.kind] ? <span className="text-xs text-muted">проверяет руководитель</span> : r.mine ? <span className="text-xs text-muted">ваша запись — проверяет другой сотрудник</span> : <ReviewButton kind={r.kind} id={r.id} />;
  return (
    <section aria-label="Очередь на проверку" className="panel overflow-hidden" data-testid={s.review.length ? "finance-review-banner" : undefined}>
      <header className="panel-head">
        <div className="flex min-w-0 items-center gap-2.5">
          <ShieldCheck className="size-4 shrink-0 text-wine" strokeWidth={1.8} aria-hidden />
          <h2 className="panel-title">Проверить</h2>
          <span className="count count-alert" aria-label={`${total} в очереди`}>
            {total}
          </span>
        </div>
        <p className="text-xs text-muted">Онлайн-оплаты подтверждает платёжная система — их проверять не нужно.</p>
      </header>

      {s.review.length ? (
        <QueueGroup id="review" title="Ручные подтверждения" meta={<>{plural(s.review.length, ["запись", "записи", "записей"])} на {formatPrice(s.totals.review.sum)}</>}>
          <ul className="divide-y divide-line" data-testid="finance-review-list">
            {s.review.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1 basis-72">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium">
                      {r.what}
                      {r.invoice ? <span className="font-normal text-muted">, {r.invoice}</span> : null}
                    </span>
                    {r.refund ? <span className="text-xs font-medium text-danger">возврат</span> : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span>{r.dateLabel}</span>
                    {r.client ? <span>{r.client}</span> : null}
                    <Refs refs={r.refs} />
                    <span>принял {r.acceptedBy}</span>
                    {r.note ? <span>{r.note}</span> : null}
                  </div>
                </div>
                <div className="flex w-full items-center gap-x-4 max-sm:justify-between sm:w-auto">
                  <span className={cn("text-[15px] font-semibold whitespace-nowrap tabular-nums", r.refund && "text-danger")}>{r.refund ? signed(-r.amount) : formatPrice(r.amount)}</span>
                  <span className="min-w-20 text-xs">{r.receiptHref ? <Receipt href={r.receiptHref} /> : <Badge tone="danger">нет чека</Badge>}</span>
                  <span className="ml-auto sm:ml-0 [&_.btn]:max-sm:min-w-32">{action(r)}</span>
                </div>
              </li>
            ))}
          </ul>
        </QueueGroup>
      ) : null}

      {s.issues.length ? (
        <QueueGroup id="refunds" title="Нужно вернуть или зачесть" meta={plural(s.issues.length, ["случай", "случая", "случаев"])}>
          <ul className="divide-y divide-line" data-testid="finance-issues">
            {s.issues.map((i) => (
              <li key={i.key} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1 basis-72">
                  <div className="text-sm font-medium">{i.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    {i.client ? <span>{i.client}</span> : null}
                    <span>{i.ref}</span>
                    <span>ведёт {i.manager}</span>
                    {i.dateLabel ? <span>{i.dateLabel}</span> : null}
                  </div>
                  {i.note ? <div className="mt-0.5 text-xs text-muted">{i.note}</div> : null}
                </div>
                <div className="flex w-full items-center justify-between gap-x-4 sm:w-auto">
                  <span className="text-[15px] font-semibold whitespace-nowrap tabular-nums">{formatPrice(i.amount)}</span>
                  {i.href ? (
                    <Link href={i.href} className="btn btn-outline btn-sm">
                      Открыть
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <Intro small className="border-t border-line px-4 py-2.5 sm:px-5">
            {`Деньги, которые нужно вернуть клиенту или зачесть: оплачено больше договорённости или заказа, сделка в отказе с деньгами, отменённый заказ с оплатой, оплата Kaspi по закрытому счёту, после заказа или с суммой не по счёту (последние ${REFUND_WINDOW_DAYS} дней). Деньги по сделке (переплата, отказ, лишнее после заказа, отменённый заказ) уходят из списка, когда в сделке оформлен возврат с чеком.`}
          </Intro>
        </QueueGroup>
      ) : null}
      {s.review.length ? (
        <Intro small className="border-t border-line px-4 py-2.5 sm:px-5">
          Деньги и возвраты, которые записал сотрудник по чеку перевода. Откройте чек, сверьте с поступлением на счёт (Kaspi, банк) и отметьте «Проверено».
        </Intro>
      ) : null}
    </section>
  );
}

/** «Пришло»: график по дням и «по способам» одним листом; ниже — последние поступления ведомостью. */
function Received({ s }: { s: FinanceScreen }) {
  const t = s.totals;
  const recent = s.recent.slice(0, RECENT);
  return (
    <section id="received" aria-labelledby="received-h" className="scroll-mt-[calc(var(--topbar-h)+1rem)] space-y-4">
      <SectionHead id="received-h" title="Пришло" meta={<span>поступило {formatPrice(t.incoming)}, {plural(t.count, ["поступление", "поступления", "поступлений"])}</span>} />
      <div className="panel grid overflow-hidden xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="p-4 sm:p-5">
          <h3 className="panel-title">По дням</h3>
          <p className="mt-0.5 text-xs text-muted">Поступления за день магазина; красная черта внизу — в этот день был возврат</p>
          {s.byDay.some((d) => d.incoming || d.refunds) ? (
            <FinanceColumns data={s.byDay} />
          ) : (
            <EmptyState compact icon={Wallet} title="За период денег не было">
              Столбцы по дням появятся с первым поступлением.
            </EmptyState>
          )}
        </div>
        <div className="border-t border-line p-4 sm:p-5 xl:border-t-0 xl:border-l">
          <h3 className="panel-title">По способам</h3>
          <p className="mt-0.5 mb-4 text-xs text-muted">Сертификаты — отдельно, каким бы способом их ни оплатили</p>
          <BarList format={formatPrice} rows={s.byMethod.map((m) => ({ label: m.label, value: m.value, note: m.count ? `${m.count} шт.` : undefined }))} />
        </div>
      </div>

      <Panel flush title="Последние поступления" description={s.recent.length > RECENT ? `Показаны ${RECENT} из ${s.recent.length} — все строки в «Скачать CSV»` : undefined}>
        {recent.length ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className={cn("table min-w-[960px]", EDGE)} data-testid="finance-recent">
                <thead>
                  <tr>
                    <th>Когда</th>
                    <th className="num">Сумма</th>
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
                      <td className={cn("num font-medium whitespace-nowrap", r.refund && "text-danger")}>{signed(r.amount)}</td>
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
    </section>
  );
}

const BOOK_TONE = { ready: "success", progress: "warning", none: "neutral" } as const;

/** «Ожидается»: остатки по группам одной строкой цифр и ведомость «Кто должен» — сначала те, у кого книга готова. */
function Expected({ s }: { s: FinanceScreen }) {
  const t = s.totals;
  const rows = s.expected.rows.slice(0, EXPECTED);
  return (
    <section id="expected" aria-labelledby="expected-h" className="scroll-mt-[calc(var(--topbar-h)+1rem)] space-y-3">
      <SectionHead
        id="expected-h"
        title="Ожидается"
        meta={
          <span>
            всего <b className="font-semibold text-ink">{formatPrice(t.expectedAll)}</b>, книга готова <b className="font-semibold text-ink">{formatPrice(t.expectedAllReady)}</b>
          </span>
        }
      />
      <Intro small className="max-w-3xl">
        Сколько клиенты ещё должны: остаток договорённости по сделкам без заказа (договорённость − оплачено), заказы, ждущие оплаты, и постоплаты. Открытый счёт из чата — часть остатка своей сделки и к итогу не прибавляется. Готовность
        книги — по ответам (своя книга — по словам) и вехам воронки.
      </Intro>
      <StatRow cols={s.expected.groups.length + 1 >= 5 ? 5 : 4}>
        {s.expected.groups.map((g) => (
          <StatTile key={g.key} bare label={g.label} value={formatPrice(g.value)} hint={plural(g.count, ["клиент", "клиента", "клиентов"])} />
        ))}
        <StatTile bare label="Открытые счета из чата" value={formatPrice(s.expected.invoices.sum)} hint={`${plural(s.expected.invoices.count, ["счёт", "счёта", "счетов"])}, входят в остатки`} />
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
                    <th className="num">Договорённость</th>
                    <th className="num">Оплачено</th>
                    <th className="num">Остаток</th>
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
                      <td className="num text-muted">{formatPrice(r.total)}</td>
                      <td className="num text-muted">{formatPrice(r.paid)}</td>
                      <td className="num font-semibold">{formatPrice(r.left)}</td>
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
    </section>
  );
}

/** Разрезы и возвраты: по менеджерам, откуда пришли деньги, оформленные возвраты. */
function Reports({ s }: { s: FinanceScreen }) {
  return (
    <section aria-label="Разрезы" className="space-y-4">
      <SectionHead title="Разрезы" meta="по ответственным и источникам" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel flush title="По менеджерам" description="По ответственному сделки; заказ без сделки — по ответственному заказа. Возвраты вычтены">
          {s.byManager.length ? (
            <table className={cn("table", EDGE)}>
              <thead>
                <tr>
                  <th>Ответственный</th>
                  <th className="num">Поступлений</th>
                  <th className="num">Пришло</th>
                </tr>
              </thead>
              <tbody>
                {s.byManager.map((m) => (
                  <tr key={m.id}>
                    <td className="font-medium">{m.label}</td>
                    <td className="num text-muted">{m.count}</td>
                    <td className={cn("num font-medium", m.value < 0 && "text-danger")}>{signed(m.value)}</td>
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
    </section>
  );
}
