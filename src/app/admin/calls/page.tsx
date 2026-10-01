import Link from "next/link";
import { and, desc, eq, gte, isNull, sql, type SQL } from "drizzle-orm";
import { PhoneIncoming, PhoneMissed, PhoneOutgoing, Settings } from "lucide-react";
import { db } from "@/lib/db";
import { crmCalls, crmDeals, users } from "@/lib/db/schema";
import { can, contactView, ownScope, requireStaff } from "@/server/access";
import { adminLabel, listAdmins } from "@/lib/crm";
import { formatPhone } from "@/lib/crm/phone";
import { telephonyProvider } from "@/lib/crm/telephony";
import { cn, formatDate } from "@/lib/utils";
import { CallRowActions } from "./CallActions";

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
  const w: SQL[] = [gte(crmCalls.startedAt, sql`now() - make_interval(days => ${days})`)];
  const scope = ownScope(staff, crmCalls.staffId);
  if (scope) w.push(scope);
  if (f === "missed") w.push(eq(crmCalls.status, "missed"), eq(crmCalls.direction, "in"), isNull(crmCalls.handledAt));
  if (f === "in") w.push(eq(crmCalls.direction, "in"));
  if (f === "out") w.push(eq(crmCalls.direction, "out"));
  if (f === "mine") w.push(eq(crmCalls.staffId, staff.user.id));

  const [rows, admins, provider, [stats]] = await Promise.all([
    db
      .select({ call: crmCalls, clientName: users.name, dealTitle: crmDeals.title, dealContact: crmDeals.contactName })
      .from(crmCalls)
      .leftJoin(users, eq(users.id, crmCalls.clientId))
      .leftJoin(crmDeals, eq(crmDeals.id, crmCalls.dealId))
      .where(and(...w))
      .orderBy(desc(crmCalls.startedAt))
      .limit(300),
    listAdmins(),
    telephonyProvider(),
    db
      .select({
        total: sql<number>`count(*)::int`,
        answered: sql<number>`count(*) filter (where ${crmCalls.status} = 'answered')::int`,
        missed: sql<number>`count(*) filter (where ${crmCalls.status} = 'missed' and ${crmCalls.direction} = 'in')::int`,
        talk: sql<number>`coalesce(sum(${crmCalls.durationSec}), 0)::int`,
      })
      .from(crmCalls)
      .where(and(gte(crmCalls.startedAt, sql`now() - make_interval(days => ${days})`), scope)),
  ]);
  const names = new Map(admins.map((a) => [a.id, adminLabel(a)]));
  const chip = (k: Filter) => cn("rounded-full px-3 py-1.5 text-sm", f === k ? "bg-ink text-white" : "bg-white text-ink-soft hover:bg-cream");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Звонки</h1>
        <span className="text-sm text-muted">
          за {days} дн.: {stats.total} звонков · {stats.answered} разговоров · {stats.missed} пропущено · {Math.round(stats.talk / 60)} мин на линии
        </span>
        {provider === "off" && can(staff, "settings.manage") ? (
          <Link href="/admin/settings" className="btn btn-outline btn-sm ml-auto">
            <Settings className="size-4" /> Подключить телефонию
          </Link>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(filters) as Filter[]).map((k) => (
          <Link key={k} href={`/admin/calls?f=${k}&days=${days}`} className={chip(k)}>
            {filters[k]}
          </Link>
        ))}
        <div className="ml-auto flex rounded-xl border border-line bg-white p-0.5 text-sm">
          {[1, 7, 14, 30, 90].map((d) => (
            <Link key={d} href={`/admin/calls?f=${f}&days=${d}`} className={cn("rounded-lg px-2.5 py-1", d === days ? "bg-ink text-white" : "text-ink-soft")}>
              {d === 1 ? "сегодня" : `${d} дн.`}
            </Link>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
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
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", c.status === "answered" ? "bg-emerald-100 text-emerald-800" : c.status === "missed" ? "bg-red-100 text-red-700" : "bg-cream text-ink-soft")}>
                      {statusLabel[c.status]}
                    </span>
                    {c.handledAt && c.status === "missed" ? <span className="ml-1 text-xs text-muted">обработан</span> : null}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{dur(c.durationSec)}</td>
                  <td className="px-4 py-2.5">
                    {c.hasRecording && can(staff, "calls.recordings") ? <audio controls preload="none" src={`/api/admin/calls/${c.id}/recording`} className="h-8 w-52" /> : <span className="text-muted">—</span>}
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
