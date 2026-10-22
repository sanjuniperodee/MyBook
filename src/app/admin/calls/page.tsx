import { container } from "@/server/container";
import Link from "next/link";
import { PhoneIncoming, PhoneMissed, PhoneOutgoing, Settings } from "lucide-react";
import { can, contactView, requireStaff } from "@/server/access";
import { staffLabel } from "@/shared/domain/staff";
import { formatPhone } from "@/shared/domain/phone";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import { CallRowActions } from "./CallActions";
import { RecordingPlayer } from "./RecordingPlayer";

export const metadata = { title: "Звонки" };

const filters = { all: "Все", missed: "Перезвонить", in: "Входящие", out: "Исходящие", mine: "Мои" } as const;
type Filter = keyof typeof filters;
const statusLabel = { ringing: "идёт", answered: "разговор", missed: "пропущен", busy: "занято", failed: "не дозвонились" } as const;
const dur = (s: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "—");

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
  const chip = (k: Filter) => cn("rounded-full px-3 py-1.5 text-sm", f === k ? "bg-ink text-white" : "bg-white text-ink-soft hover:bg-cream");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Звонки</h1>
        <span className="w-full text-sm text-muted">
          за {days} дн.: {stats.total} звонков · {stats.answered} разговоров · {stats.missed} пропущено · {Math.round(stats.talk / 60)} мин на линии
        </span>
        {provider === "off" && can(staff, "settings.manage") ? (
          <Link href="/admin/settings?tab=telephony" className="btn btn-outline btn-sm ml-auto">
            <Settings className="size-4" /> Подключить телефонию
          </Link>
        ) : null}
      </div>
      <div className="m-hscroll flex flex-wrap items-center gap-2">
        {(Object.keys(filters) as Filter[]).map((k) => (
          <Link key={k} href={`/admin/calls?f=${k}&days=${days}`} className={chip(k)}>
            {filters[k]}
          </Link>
        ))}
        <div className="ml-auto flex shrink-0 rounded-xl border border-line bg-white p-0.5 text-sm">
          {[1, 7, 14, 30, 90].map((d) => (
            <Link key={d} href={`/admin/calls?f=${f}&days=${d}`} className={cn("rounded-lg px-2.5 py-1 max-lg:flex max-lg:min-h-9 max-lg:items-center", d === days ? "bg-ink text-white" : "text-ink-soft")}>
              {d === 1 ? "сегодня" : `${d} дн.`}
            </Link>
          ))}
        </div>
      </div>
      <ul className="space-y-2.5 lg:hidden" data-testid="calls-cards">
        {rows.map(({ call: c, clientName, dealTitle, dealContact }) => {
          const Icon = c.direction === "out" ? PhoneOutgoing : c.status === "missed" ? PhoneMissed : PhoneIncoming;
          const phone = contactView(staff, { phone: formatPhone(c.clientPhone) }).phone || "скрытый номер";
          const who = clientName || dealContact;
          const href = c.dealId ? `/admin/deals/${c.dealId}` : c.clientId ? `/admin/clients/${c.clientId}` : null;
          const open = c.status === "missed" && !c.handledAt && c.direction === "in";
          const body = (
            <div className="flex items-start gap-3">
              <span className={cn("mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full", c.status === "missed" ? "bg-red-50 text-red-600" : c.direction === "out" ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700")}>
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-semibold">{who || phone}</div>
                <div className="truncate text-sm text-muted tabular-nums">{who ? phone : dealTitle}</div>
                <div className="truncate text-xs text-muted">
                  {formatDate(c.startedAt, true)}
                  {c.staffId ? ` · ${names.get(c.staffId) ?? ""}` : ""}
                  {c.provider === "whatsapp" ? " · WhatsApp" : ""}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 text-xs">
                <span className={cn("rounded-full px-2.5 py-1 font-medium whitespace-nowrap", c.status === "answered" ? "bg-emerald-100 text-emerald-800" : c.status === "missed" ? "bg-red-100 text-red-700" : "bg-cream text-ink-soft")}>{statusLabel[c.status]}</span>
                <span className="text-muted tabular-nums">{dur(c.durationSec)}</span>
              </div>
            </div>
          );
          return (
            <li key={c.id} className={cn("rounded-2xl border border-line bg-white p-3.5 shadow-soft", open && "border-red-200")}>
              {href ? (
                <Link href={href} className="m-card -m-1 block rounded-xl p-1">
                  {body}
                </Link>
              ) : (
                body
              )}
              {c.hasRecording && can(staff, "calls.recordings") ? <RecordingPlayer callId={c.id} durationSec={c.durationSec} ext={c.provider === "whatsapp" ? "m4a" : "mp3"} className="mt-2.5" /> : null}
              <div className="mt-1 flex justify-end">
                <CallRowActions callId={c.id} canCall={can(staff, "calls.make") && !!c.clientPhone} canHandle={c.status === "missed" && c.direction === "in" && !c.handledAt} />
              </div>
            </li>
          );
        })}
        {rows.length === 0 ? <li className="rounded-2xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-muted">{provider === "off" ? "Телефония не подключена — звонки появятся здесь после настройки АТС." : "Звонков за период нет."}</li> : null}
      </ul>
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-white lg:block">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Когда</th>
              <th className="px-4 py-3 font-medium">Клиент</th>
              <th className="px-4 py-3 font-medium">Сотрудник</th>
              <th className="px-4 py-3 font-medium">Итог</th>
              <th className="px-4 py-3 font-medium">Длит.</th>
              <th className="px-4 py-3 font-medium">Запись</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ call: c, clientName, dealTitle, dealContact }) => {
              const Icon = c.direction === "out" ? PhoneOutgoing : c.status === "missed" ? PhoneMissed : PhoneIncoming;
              const phone = contactView(staff, { phone: formatPhone(c.clientPhone) }).phone || "скрытый номер";
              const who = clientName || dealContact;
              return (
                <tr key={c.id} className={cn(c.status === "missed" && !c.handledAt && c.direction === "in" && "bg-red-50/50")}>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      <Icon className={cn("size-4", c.status === "missed" ? "text-red-600" : c.direction === "out" ? "text-sky-700" : "text-emerald-700")} />
                      {formatDate(c.startedAt, true)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {c.dealId ? (
                      <Link href={`/admin/deals/${c.dealId}`} className="hover:text-wine">
                        {who || phone}
                      </Link>
                    ) : c.clientId ? (
                      <Link href={`/admin/clients/${c.clientId}`} className="hover:text-wine">
                        {who || phone}
                      </Link>
                    ) : (
                      phone
                    )}
                    {who ? <div className="text-xs text-muted tabular-nums">{phone}</div> : dealTitle ? <div className="text-xs text-muted">{dealTitle}</div> : null}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.staffId ? names.get(c.staffId) : <span className="text-muted">—</span>}
                    {c.extension ? <span className="ml-1 text-xs text-muted">({c.extension})</span> : null}
                    {c.provider === "whatsapp" ? <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">WhatsApp</span> : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", c.status === "answered" ? "bg-emerald-100 text-emerald-800" : c.status === "missed" ? "bg-red-100 text-red-700" : "bg-cream text-ink-soft")}>
                      {statusLabel[c.status]}
                    </span>
                    {c.handledAt && c.status === "missed" ? <span className="ml-1 text-xs text-muted">обработан</span> : null}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{dur(c.durationSec)}</td>
                  <td className="px-4 py-2.5">
                    {c.hasRecording && can(staff, "calls.recordings") ? <RecordingPlayer callId={c.id} durationSec={c.durationSec} ext={c.provider === "whatsapp" ? "m4a" : "mp3"} className="w-60" /> : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <CallRowActions callId={c.id} canCall={can(staff, "calls.make") && !!c.clientPhone} canHandle={c.status === "missed" && c.direction === "in" && !c.handledAt} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-6 text-center text-sm text-muted">{provider === "off" ? "Телефония не подключена — звонки появятся здесь после настройки АТС." : "Звонков за период нет."}</p> : null}
      </div>
    </div>
  );
}
