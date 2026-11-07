import { container } from "@/server/container";
import Link from "next/link";
import { PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing, Settings } from "lucide-react";
import { can, contactView, requireStaff } from "@/server/access";
import { staffLabel } from "@/shared/domain/staff";
import { formatPhone } from "@/shared/domain/phone";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/admin/PageHeader";
import { Segmented } from "@/components/admin/Segmented";
import { StatRow, StatTile } from "@/components/admin/charts";
import { Panel } from "@/components/ui/Panel";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CallRowActions } from "./CallActions";
import { RecordingPlayer } from "./RecordingPlayer";
import { LiveCalls } from "./LiveCalls";

export const metadata = { title: "Звонки" };

const filters = {
  all: "Все",
  missed: "Перезвонить",
  in: "Входящие",
  out: "Исходящие",
  mine: "Мои",
} as const;
type Filter = keyof typeof filters;
const PERIODS = [1, 7, 14, 30, 90] as const;
const status: Record<string, { label: string; tone: BadgeTone }> = {
  ringing: { label: "идёт", tone: "info" },
  answered: { label: "разговор", tone: "success" },
  missed: { label: "пропущен", tone: "danger" },
  busy: { label: "занято", tone: "warning" },
  failed: { label: "не дозвонились", tone: "neutral" },
};
/** «7 нояб., 11:55» без года — в журнале за 90 дней год лишний. */
const when = (d: Date | string) => formatDate(d, true).replace(/ \d{4} г\./, "");
const dur = (s: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "—");

/**
 * «Звонки»: сначала — кто ждёт перезвона (пропущенные без отметки «обработан»), потом идущие разговоры с прослушкой,
 * итоги периода и журнал. На ноутбуке журнал — таблица, на телефоне — список карточек с теми же действиями.
 */
export default async function CallsPage({ searchParams }: { searchParams: Promise<{ f?: string; days?: string }> }) {
  const staff = await requireStaff("calls.view");
  const sp = await searchParams;
  const f: Filter = sp.f && sp.f in filters ? (sp.f as Filter) : "all";
  const days = Math.min(90, Math.max(1, Number(sp.days) || 14));
  const [{ rows, stats }, admins, provider] = await Promise.all([
    container().reporting.callJournal({ userId: staff.user.id, seesAll: staff.scope === "all" }, f, days),
    container().access.queries.allStaff(),
    container().telephony.phone.currentProvider(),
  ]);
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const recordings = can(staff, "calls.recordings");
  const period = days === 1 ? "сегодня" : `за ${days} дн.`;
  const url = (p: { f?: Filter; days?: number }) => `/admin/calls?f=${p.f ?? f}&days=${p.days ?? days}`;

  const view = rows.map(({ call: c, clientName, dealTitle, dealContact }) => {
    const phone = contactView(staff, { phone: formatPhone(c.clientPhone) }).phone || "скрытый номер";
    const who = clientName || dealContact;
    const open = c.status === "missed" && !c.handledAt && c.direction === "in";
    const st = status[c.status] ?? {
      label: c.status,
      tone: "neutral" as BadgeTone,
    };
    return {
      c,
      open,
      who: who || phone,
      sub: who ? phone : dealTitle || null,
      href: c.dealId ? `/admin/deals/${c.dealId}` : c.clientId ? `/admin/clients/${c.clientId}` : null,
      Icon: c.direction === "out" ? PhoneOutgoing : c.status === "missed" ? PhoneMissed : PhoneIncoming,
      dirLabel: c.direction === "out" ? "Исходящий" : "Входящий",
      badge: (
        <Badge tone={c.handledAt && c.status === "missed" ? "neutral" : st.tone} title={c.handledAt && c.status === "missed" ? "Пропущенный, отмечен как обработанный" : undefined}>
          {st.label}
          {c.handledAt && c.status === "missed" ? ", обработан" : ""}
        </Badge>
      ),
      staffName: c.staffId ? (names.get(c.staffId) ?? "") : "",
      recording: c.hasRecording && recordings,
      actions: <CallRowActions callId={c.id} canCall={can(staff, "calls.make") && !!c.clientPhone} canHandle={open} />,
    };
  });

  const empty = (
    <EmptyState
      icon={PhoneCall}
      title={provider === "off" ? "Телефония не подключена" : f === "missed" ? "Перезванивать некому" : "Звонков за период нет"}
      action={
        provider === "off" && can(staff, "settings.manage") ? (
          <Link href="/admin/settings?tab=telephony" className="btn btn-outline btn-sm">
            <Settings className="size-4" /> Подключить телефонию
          </Link>
        ) : f !== "all" || days < 90 ? (
          <Link href={url({ f: "all", days: 90 })} className="btn btn-outline btn-sm">
            Показать все за 90 дней
          </Link>
        ) : null
      }
    >
      {provider === "off"
        ? "Подключите АТС или звонки WhatsApp — входящие и исходящие появятся здесь с записями разговоров."
        : f === "missed"
          ? "Все пропущенные обработаны. Новые появятся здесь сразу."
          : "Попробуйте другой период или фильтр."}
    </EmptyState>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Звонки"
        actions={
          provider === "off" && can(staff, "settings.manage") && view.length ? (
            <Link href="/admin/settings?tab=telephony" className="btn btn-outline btn-sm">
              <Settings className="size-4" /> Подключить телефонию
            </Link>
          ) : null
        }
      >
        Журнал входящих и исходящих через АТС и WhatsApp: перезвонить, отметить обработанным, послушать запись.
      </PageHeader>

      {recordings ? <LiveCalls /> : null}

      {stats.total ? (
        <section aria-label={`Итоги ${period}`}>
          <p className="text-sm text-ink-soft lg:hidden">
            {period[0].toUpperCase() + period.slice(1)}: звонков {stats.total}, разговоров {stats.answered}, {Math.round(stats.talk / 60)} мин на линии.{" "}
            {stats.missed ? (
              <Link href={url({ f: "missed" })} className="font-medium text-danger underline-offset-2 hover:underline">
                Пропущено {stats.missed}
              </Link>
            ) : null}
          </p>
          <StatRow className="max-lg:hidden">
            <StatTile bare label="Звонков" value={String(stats.total)} hint={period} />
            <StatTile bare label="Разговоров" value={String(stats.answered)} hint={stats.total ? `${Math.round((stats.answered / stats.total) * 100)}% звонков` : period} />
            <StatTile bare label="Пропущено" value={String(stats.missed)} hint={stats.missed ? "открыть, кому перезвонить" : "никто не ждёт"} href={stats.missed ? url({ f: "missed" }) : undefined} />
            <StatTile bare label="Минут на линии" value={String(Math.round(stats.talk / 60))} hint={stats.answered ? `в среднем ${dur(Math.round(stats.talk / stats.answered))} на разговор` : period} />
          </StatRow>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <nav className="m-hscroll flex flex-wrap items-center gap-1.5" aria-label="Фильтр звонков">
          {(Object.keys(filters) as Filter[]).map((k) => (
            <Link key={k} href={url({ f: k })} aria-current={f === k ? "page" : undefined} className={cn("chip max-lg:h-10", f === k && "chip-on")}>
              {filters[k]}
            </Link>
          ))}
        </nav>
        <Segmented
          className="lg:ml-auto"
          label="Период"
          items={PERIODS.map((d) => ({
            key: String(d),
            label: d === 1 ? "Сегодня" : `${d} дн.`,
            href: url({ days: d }),
            active: d === days,
          }))}
        />
      </div>

      <Panel
        flush
        title={
          <>
            Журнал <span className="font-normal text-muted tabular-nums">{rows.length}</span>
          </>
        }
        description={`${filters[f]}, ${period}`}
      >
        {view.length === 0 ? (
          empty
        ) : (
          <>
            <ul className="divide-y divide-line lg:hidden" data-testid="calls-cards">
              {view.map((r) => {
                const head = (
                  <div className="flex items-start gap-3">
                    <DirectionIcon Icon={r.Icon} missed={r.c.status === "missed"} label={r.dirLabel} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{r.who}</span>
                        <span className="shrink-0 text-xs text-muted tabular-nums">{dur(r.c.durationSec)}</span>
                      </div>
                      {r.sub ? <div className="truncate text-[13px] text-muted tabular-nums">{r.sub}</div> : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        {r.badge}
                        <span className="tabular-nums">{when(r.c.startedAt)}</span>
                        {r.staffName ? <span>{r.staffName}</span> : null}
                        {r.c.provider === "whatsapp" ? <Badge tone="success">WhatsApp</Badge> : null}
                      </div>
                    </div>
                  </div>
                );
                return (
                  <li key={r.c.id} className={cn("px-4 py-3", r.open && "bg-danger-bg/40")}>
                    {r.href ? (
                      <Link href={r.href} className="m-card -mx-2 -my-1 block rounded-[10px] px-2 py-1">
                        {head}
                      </Link>
                    ) : (
                      head
                    )}
                    {r.recording ? <RecordingPlayer callId={r.c.id} durationSec={r.c.durationSec} ext={r.c.provider === "whatsapp" ? "m4a" : "mp3"} className="mt-2.5 pl-12" /> : null}
                    <div className="mt-1 -mr-2 flex justify-end">{r.actions}</div>
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto lg:block">
              <table className="table min-w-[920px] [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
                <thead>
                  <tr>
                    <th>Клиент</th>
                    <th>Итог</th>
                    <th>Сотрудник</th>
                    <th>Когда</th>
                    <th className="text-right">Длит.</th>
                    <th>Запись</th>
                    <th>
                      <span className="sr-only">Действия</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.map((r) => (
                    <tr key={r.c.id} className={cn(r.open && "[&>td]:bg-danger-bg/40")}>
                      <td>
                        <div className="flex items-center gap-3">
                          <DirectionIcon Icon={r.Icon} missed={r.c.status === "missed"} label={r.dirLabel} />
                          <div className="min-w-0">
                            {r.href ? (
                              <Link href={r.href} className="font-medium whitespace-nowrap hover:text-wine">
                                {r.who}
                              </Link>
                            ) : (
                              <span className="font-medium whitespace-nowrap tabular-nums">{r.who}</span>
                            )}
                            {r.sub ? <div className="max-w-56 truncate text-xs text-muted tabular-nums">{r.sub}</div> : null}
                          </div>
                        </div>
                      </td>
                      <td>{r.badge}</td>
                      <td>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {r.staffName ? <span className="whitespace-nowrap">{r.staffName}</span> : <span className="text-muted">—</span>}
                          {r.c.extension ? <span className="text-xs text-muted tabular-nums">доб. {r.c.extension}</span> : null}
                          {r.c.provider === "whatsapp" ? <Badge tone="success">WhatsApp</Badge> : null}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-ink-soft tabular-nums">{when(r.c.startedAt)}</td>
                      <td className="text-right tabular-nums">{dur(r.c.durationSec)}</td>
                      <td>{r.recording ? <RecordingPlayer callId={r.c.id} durationSec={r.c.durationSec} ext={r.c.provider === "whatsapp" ? "m4a" : "mp3"} className="w-56" /> : <span className="text-muted">—</span>}</td>
                      <td className="text-right">{r.actions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

/** Направление звонка значком: пропущенный — красным; подпись для экранного диктора. */
function DirectionIcon({ Icon, missed, label }: { Icon: typeof PhoneIncoming; missed: boolean; label: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", missed ? "bg-danger-bg text-danger" : "bg-sunken text-ink-soft")} title={label}>
      <Icon className="size-4" strokeWidth={1.8} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
