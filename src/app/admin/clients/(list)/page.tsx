import Link from "next/link";
import { MobileFilters } from "@/components/admin/MobileFilters";
import { channelLabel, channels, toAttribution } from "@/shared/domain/channels";
import { Download, UserPlus } from "lucide-react";
import { clientSegments, type ClientSegment } from "@/shared/domain/segments";
import { CLIENT_OCCASIONS, clientFiltersFrom, clientFiltersQuery, type ClientSort } from "@/modules/reporting";
import { messagesFor } from "@/i18n/messages";
import { formatPrice } from "@/config/site";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import { can, contactView, requireStaff } from "@/server/access";
import { staffLabel } from "@/shared/domain/staff";
import { container } from "@/server/container";
import { REPEAT_FORM, RepeatSale } from "./RepeatSale";

export const metadata = { title: "Клиенты" };
const PAGE = 50;
const occasionLabels = messagesFor("ru").common.occasions;
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

function relative(d: Date | null) {
  if (!d) return "—";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 30) return `${days} дн. назад`;
  return formatDate(d);
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ segment?: string; q?: string; tag?: string; sort?: string; page?: string; mine?: string; ch?: string; occ?: string; month?: string; from?: string; to?: string; noDeal?: string }> }) {
  const staff = await requireStaff("clients.view");
  const sp = await searchParams;
  const segment = (sp.segment && sp.segment in clientSegments ? sp.segment : "all") as ClientSegment;
  const sort = (["new", "ltv", "active"].includes(sp.sort ?? "") ? sp.sort : "new") as ClientSort;
  const page = Math.max(1, Number(sp.page) || 1);
  // Роль «только свои» видит своих клиентов и неразобранных (без ответственного).
  const scopeManagerId = staff.scope === "own" ? staff.user.id : null;
  const onlyMine = sp.mine === "1";
  // Ручная добивка к праздникам (contacts-13): повод, месяц повода, когда покупали, без открытой сделки.
  const filters = clientFiltersFrom((k) => sp[k as keyof typeof sp]);
  const filterQs = clientFiltersQuery(filters);
  const [{ rows, total }, counts, admins] = await Promise.all([
    container().reporting.clients({ segment, q: sp.q, tag: sp.tag, sort, channel: sp.ch, limit: PAGE, offset: (page - 1) * PAGE, scopeManagerId: scopeManagerId ?? (onlyMine ? staff.user.id : null), onlyMine, filters }),
    container().reporting.segmentCounts(scopeManagerId),
    container().access.queries.allStaff(),
  ]);
  const managerName = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ segment, q: sp.q, tag: sp.tag, sort, ch: sp.ch, mine: onlyMine ? "1" : undefined, ...filterQs, ...patch }).filter(([, v]) => v && v !== "all" && v !== "new") as [string, string][]);
    return `/admin/clients?${p}`;
  };
  const canRepeat = can(staff, "clients.edit", "deals.edit");
  const exportQs = new URLSearchParams(Object.entries({ segment, q: sp.q, tag: sp.tag, ...filterQs }).filter(([, v]) => v) as [string, string][]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Клиенты</h1>
          <p className="text-sm text-muted">Найдено {total}{sp.tag ? ` · тег «${sp.tag}»` : ""}</p>
        </div>
        <div className="flex items-center gap-2 max-lg:w-full max-lg:[&>*]:flex-1">
          {can(staff, "clients.export", "clients.contacts") ? (
            <a href={`/api/admin/export/clients?${exportQs}`} className="btn btn-outline btn-sm">
              <Download className="size-4" /> CSV
            </a>
          ) : null}
          {can(staff, "clients.create") ? (
            <Link href="/admin/clients/new" className="btn btn-primary btn-sm">
              <UserPlus className="size-4" /> Новый клиент
            </Link>
          ) : null}
        </div>
      </div>

      <div className="m-hscroll flex flex-wrap gap-1.5">
        {(Object.keys(clientSegments) as ClientSegment[]).map((s) => (
          <Link key={s} href={link({ segment: s, page: undefined })} className={cn("rounded-full px-3 py-1.5 text-sm whitespace-nowrap", segment === s ? "bg-ink text-white" : "bg-white text-ink-soft hover:bg-cream")}>
            {clientSegments[s]} <span className="opacity-60">{counts[s]}</span>
          </Link>
        ))}
      </div>

      <MobileFilters>
      <form className="flex flex-wrap gap-2 max-lg:[&>*]:w-full">
        <input type="hidden" name="segment" value={segment} />
        <input name="q" defaultValue={sp.q} placeholder="Имя, e-mail, телефон" className="input h-10 w-72 text-sm max-lg:w-full" />
        <select name="ch" defaultValue={sp.ch ?? ""} className="input h-10 w-48 text-sm max-lg:w-full" aria-label="Канал">
          <option value="">Все каналы</option>
          {(["instagram", "tiktok", "bloggers", "whatsapp", "telegram", "youtube", "vk", "call", "recommendation", "repeat", "offline", "other", "google_ads", "google", "yandex_ads", "yandex", "facebook", "direct"] as const).map((k) => (
            <option key={k} value={k}>
              {channels[k]}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} className="input h-10 w-56 text-sm max-lg:w-full">
          <option value="new">Сначала новые</option>
          <option value="ltv">По сумме покупок</option>
          <option value="active">По последнему визиту</option>
        </select>
        <label className="flex h-10 items-center gap-2 px-2 text-sm text-ink-soft">
          <input type="checkbox" name="mine" value="1" defaultChecked={onlyMine} className="accent-wine" /> Только мои
        </label>
        <div className="flex w-full flex-wrap items-center gap-2 max-lg:[&>*]:w-full" data-testid="clients-repeat-filters">
          <select name="occ" defaultValue={filters.occasion ?? ""} className="input h-10 w-44 text-sm" aria-label="Повод">
            <option value="">Любой повод</option>
            {CLIENT_OCCASIONS.map((o) => (
              <option key={o} value={o}>
                {occasionLabels[o].label}
              </option>
            ))}
          </select>
          <select name="month" defaultValue={filters.month ? String(filters.month) : ""} className="input h-10 w-40 text-sm" aria-label="Месяц повода">
            <option value="">Месяц повода</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted">покупали с</span>
          <input type="month" name="from" defaultValue={filters.boughtFrom} className="input h-10 w-40 text-sm" aria-label="Покупали с" />
          <span className="text-sm text-muted">по</span>
          <input type="month" name="to" defaultValue={filters.boughtTo} className="input h-10 w-40 text-sm" aria-label="Покупали по" />
          <label className="flex h-10 items-center gap-2 px-2 text-sm text-ink-soft">
            <input type="checkbox" name="noDeal" value="1" defaultChecked={!!filters.noOpenDeal} className="accent-wine" /> Без открытой сделки
          </label>
        </div>
        <button className="btn btn-dark btn-sm h-10">Найти</button>
      </form>
      </MobileFilters>

      <ul className="space-y-2.5 lg:hidden" data-testid="clients-cards">
        {rows.map((r) => {
          const c = contactView(staff, r.user);
          return (
            <li key={r.user.id}>
              <Link href={`/admin/clients/${r.user.id}`} className="m-card block rounded-2xl border border-line bg-white p-3.5 shadow-soft">
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-wine to-wine-dark text-base font-semibold text-white uppercase">{(r.user.name || r.user.email).slice(0, 1)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-semibold">{r.user.name || r.user.email.split("@")[0]}</div>
                    <div className="truncate text-sm text-muted">{c.phone || c.email}</div>
                    <div className="truncate text-xs text-muted">
                      {r.booksCount ? `Книги: ${r.booksCount} · ${r.bestAnswered} отв.` : "Книг нет"} · был {relative(r.user.lastSeenAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[15px] font-semibold whitespace-nowrap tabular-nums">{r.ltv ? formatPrice(r.ltv) : "—"}</div>
                    <div className="text-xs text-muted">{r.ordersCount ? `заказов: ${r.ordersCount}` : "без заказов"}</div>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded-md bg-cream px-2 py-1 text-ink-soft">{channelLabel(toAttribution(r.user.source))}</span>
                  {r.user.managerId ? <span className="rounded-md bg-cream px-2 py-1 text-ink-soft">👤 {managerName.get(r.user.managerId) ?? "—"}</span> : null}
                  {r.user.tags.slice(0, 3).map((t) => (
                    <span key={t} className="rounded-full bg-rose px-2 py-1 text-wine">
                      {t}
                    </span>
                  ))}
                  <span className="ml-auto text-muted">{formatDate(r.user.createdAt)}</span>
                </div>
              </Link>
            </li>
          );
        })}
        {rows.length === 0 ? <li className="rounded-2xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-muted">Никого не нашли</li> : null}
      </ul>

      {canRepeat && rows.length ? (
        <div className="max-lg:hidden">
          <RepeatSale occasionTitle={filters.occasion ? occasionLabels[filters.occasion].label : "праздник"} />
        </div>
      ) : null}

      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-white lg:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              {canRepeat ? <th className="w-8 px-3 py-3" aria-label="Выбор" /> : null}
              <th className="px-4 py-3 font-medium">Клиент</th>
              <th className="px-3 py-3 font-medium">Книги</th>
              <th className="px-3 py-3 text-right font-medium">Заказы</th>
              <th className="px-3 py-3 text-right font-medium">LTV</th>
              <th className="px-3 py-3 font-medium">Последний визит</th>
              <th className="px-3 py-3 font-medium">Регистрация</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.user.id} className="hover:bg-cream/40">
                {canRepeat ? (
                  <td className="px-3 py-3">
                    <input type="checkbox" name="ids" value={r.user.id} form={REPEAT_FORM} className="size-4 accent-wine" aria-label={`Выбрать ${r.user.name || r.user.email}`} />
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <Link href={`/admin/clients/${r.user.id}`} className="font-medium hover:text-wine hover:underline">
                    {r.user.name || r.user.email.split("@")[0]}
                  </Link>
                  {(() => {
                    const c = contactView(staff, r.user);
                    return (
                      <div className="text-xs text-muted">
                        {c.email}
                        {c.phone ? ` · ${c.phone}` : ""}
                        {r.user.managerId ? ` · 👤 ${managerName.get(r.user.managerId) ?? "—"}` : ""}
                        <span className="ml-1.5 rounded bg-cream px-1.5 py-0.5 text-[10px] text-ink-soft" title={r.user.source ? JSON.stringify(r.user.source) : ""}>
                          {channelLabel(toAttribution(r.user.source))}
                        </span>
                      </div>
                    );
                  })()}
                  {r.user.tags.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.user.tags.map((t) => (
                        <Link key={t} href={link({ tag: t, page: undefined })} className="rounded-full bg-rose px-2 py-0.5 text-[11px] text-wine">
                          {t}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  {r.booksCount ? (
                    <>
                      {r.booksCount} · {r.bestAnswered} отв.{r.bestWords ? ` · ${r.bestWords} сл.` : ""}
                      <div className="text-xs text-muted">изм. {relative(r.lastBookUpdate)}</div>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{r.ordersCount || "—"}</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">{r.ltv ? formatPrice(r.ltv) : "—"}</td>
                <td className="px-3 py-3 text-muted">{relative(r.user.lastSeenAt)}</td>
                <td className="px-3 py-3 text-muted">{formatDate(r.user.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="py-10 text-center text-muted">Никого не нашли</p> : null}
      </div>

      {total > PAGE ? (
        <div className="flex items-center justify-center gap-3 text-sm max-lg:pb-2">
          {page > 1 ? <Link className="btn btn-outline btn-sm" href={link({ page: String(page - 1) })}>← Назад</Link> : null}
          <span className="text-muted">
            {page} из {Math.ceil(total / PAGE)}
          </span>
          {page * PAGE < total ? <Link className="btn btn-outline btn-sm" href={link({ page: String(page + 1) })}>Дальше →</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
