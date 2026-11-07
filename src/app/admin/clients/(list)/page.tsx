import { AutoApply } from "@/components/admin/AutoApply";
import Link from "next/link";
import { MobileFilters } from "@/components/admin/MobileFilters";
import { channelLabel, channels, toAttribution } from "@/shared/domain/channels";
import { CalendarHeart, ChevronDown, ChevronLeft, ChevronRight, Contact, Download, Search, SearchX, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { ActionMenu, MenuLink, MenuSeparator } from "@/components/admin/ActionMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChatAvatar } from "@/components/admin/chat/Inbox";
import { ruCount } from "@/i18n/plural";
import { clientSegments, type ClientSegment } from "@/shared/domain/segments";
import { CLIENT_OCCASIONS, clientFiltersFrom, clientFiltersQuery, type ClientSort } from "@/modules/reporting";
import { messagesFor } from "@/i18n/messages";
import { formatPrice } from "@/config/site";
import { cn } from "@/lib/class-names";
import { formatDate, nowMs } from "@/lib/dates";
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
  const [{ rows, total }, counts, admins, phoneHolder] = await Promise.all([
    container().reporting.clients({ segment, q: sp.q, tag: sp.tag, sort, channel: sp.ch, limit: PAGE, offset: (page - 1) * PAGE, scopeManagerId: scopeManagerId ?? (onlyMine ? staff.user.id : null), onlyMine, filters }),
    container().reporting.segmentCounts(scopeManagerId),
    container().access.queries.allStaff(),
    container().messaging.phoneHolder(),
  ]);
  // Контакты для адресной книги телефона магазина (contacts-10) — тому, у кого сейчас телефон, и руководителю.
  const canVcard = can(staff, "clients.export", "clients.contacts") && (phoneHolder?.id === staff.user.id || can(staff, "team.manage"));
  const weekAgo = new Date(nowMs() - 7 * 86_400_000).toISOString().slice(0, 10);
  const managerName = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ segment, q: sp.q, tag: sp.tag, sort, ch: sp.ch, mine: onlyMine ? "1" : undefined, ...filterQs, ...patch }).filter(([, v]) => v && v !== "all" && v !== "new") as [string, string][]);
    return `/admin/clients?${p}`;
  };
  const canRepeat = can(staff, "clients.edit", "deals.edit");
  // Выгрузка — по тем же фильтрам, что на экране, включая канал и «Только мои».
  const exportQs = new URLSearchParams(Object.entries({ segment, q: sp.q, tag: sp.tag, ch: sp.ch, mine: onlyMine ? "1" : undefined, ...filterQs }).filter(([, v]) => v) as [string, string][]);

  const moreActive = !!(filters.occasion || filters.month || filters.boughtFrom || filters.boughtTo || filters.noOpenDeal);
  const filtered = !!(sp.q || sp.tag || sp.ch || onlyMine || moreActive || segment !== "all");
  const pages = Math.ceil(total / PAGE);
  const name = (u: { name: string | null; email: string }) => u.name || u.email.split("@")[0];

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        title="Клиенты"
        meta={
          <span className="text-sm text-muted tabular-nums">
            {ruCount(total, "клиент", "клиента", "клиентов")}
            {sp.tag ? `, тег «${sp.tag}»` : ""}
          </span>
        }
        actions={
          <>
            {can(staff, "clients.export", "clients.contacts") ? (
              <ActionMenu className="max-lg:order-last" label="Выгрузить">
                <MenuLink external href={`/api/admin/export/clients?${exportQs}`} icon={<Download />}>
                  CSV по текущим фильтрам
                </MenuLink>
                {canVcard ? (
                  <>
                    <MenuSeparator />
                    <MenuLink external href="/api/admin/export/vcard" icon={<Contact />} title="Файл .vcf для контактов телефона магазина: WhatsApp покажет имя, номер сделки и повод вместо номера">
                      Контакты для телефона
                    </MenuLink>
                    <MenuLink external href={`/api/admin/export/vcard?since=${weekAgo}`} icon={<Contact />} title="Только клиенты, изменённые за 7 дней">
                      Контакты: новые за неделю
                    </MenuLink>
                  </>
                ) : null}
              </ActionMenu>
            ) : null}
            {can(staff, "clients.create") ? (
              <Link href="/admin/clients/new" className="btn btn-primary btn-sm">
                <UserPlus className="size-4" aria-hidden /> Новый клиент
              </Link>
            ) : null}
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <nav className="m-hscroll flex flex-wrap gap-2" aria-label="Сегменты">
          {(Object.keys(clientSegments) as ClientSegment[]).map((s) => (
            <Link key={s} href={link({ segment: s, page: undefined })} aria-current={segment === s ? "true" : undefined} className={cn("chip max-lg:h-10", segment === s && "chip-on")}>
              {clientSegments[s]} <span className="tabular-nums opacity-60">{counts[s]}</span>
            </Link>
          ))}
        </nav>

        <form className="flex flex-wrap items-center gap-2" role="search">
          <AutoApply />
          <input type="hidden" name="segment" value={segment} />
          <label className="relative min-w-0 flex-1 lg:max-w-80">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input name="q" type="search" defaultValue={sp.q} placeholder="Имя, e-mail, телефон" aria-label="Поиск клиентов: имя, e-mail, телефон" className="input pl-9" />
          </label>
          <MobileFilters compact active={!!(sp.ch || onlyMine || moreActive || sort !== "new")}>
            <div className="flex flex-wrap items-center gap-2 max-lg:mt-1 max-lg:flex-col max-lg:items-stretch lg:contents">
              <select name="ch" defaultValue={sp.ch ?? ""} className="input lg:w-44" aria-label="Канал">
                <option value="">Все каналы</option>
                {(["instagram", "tiktok", "bloggers", "whatsapp", "telegram", "youtube", "vk", "call", "recommendation", "repeat", "offline", "other", "google_ads", "google", "yandex_ads", "yandex", "facebook", "direct"] as const).map((k) => (
                  <option key={k} value={k}>
                    {channels[k]}
                  </option>
                ))}
              </select>
              <select name="sort" defaultValue={sort} className="input lg:w-52" aria-label="Сортировка">
                <option value="new">Сначала новые</option>
                <option value="ltv">По сумме покупок</option>
                <option value="active">По последнему визиту</option>
              </select>
              <label className="flex h-[var(--ctl-h)] items-center gap-2 px-1 text-sm whitespace-nowrap text-ink-soft">
                <input type="checkbox" name="mine" value="1" defaultChecked={onlyMine} className="size-4 accent-wine" /> Только мои
              </label>
              {/* Добивка к праздникам (contacts-13) — реже нужна: свёрнута, раскрыта, если такой фильтр уже стоит. */}
              <details className="group w-full lg:order-last" open={moreActive}>
                <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-sm text-wine hover:underline max-lg:min-h-11 [&::-webkit-details-marker]:hidden">
                  <CalendarHeart className="size-4" aria-hidden /> Повод и покупки
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[var(--r-ctl)] bg-sunken/70 p-2.5 max-lg:flex-col max-lg:items-stretch" data-testid="clients-repeat-filters">
                  <select name="occ" defaultValue={filters.occasion ?? ""} className="input lg:w-44" aria-label="Повод">
                    <option value="">Любой повод</option>
                    {CLIENT_OCCASIONS.map((o) => (
                      <option key={o} value={o}>
                        {occasionLabels[o].label}
                      </option>
                    ))}
                  </select>
                  <select name="month" defaultValue={filters.month ? String(filters.month) : ""} className="input lg:w-40" aria-label="Месяц повода">
                    <option value="">Месяц повода</option>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <span className="flex items-center gap-2 text-sm text-muted">
                    покупали с
                    <input type="month" name="from" defaultValue={filters.boughtFrom} className="input min-w-0 flex-1 lg:w-40" aria-label="Покупали с" />
                  </span>
                  <span className="flex items-center gap-2 text-sm text-muted">
                    по
                    <input type="month" name="to" defaultValue={filters.boughtTo} className="input min-w-0 flex-1 lg:w-40" aria-label="Покупали по" />
                  </span>
                  <label className="flex h-[var(--ctl-h)] items-center gap-2 px-1 text-sm whitespace-nowrap text-ink-soft">
                    <input type="checkbox" name="noDeal" value="1" defaultChecked={!!filters.noOpenDeal} className="size-4 accent-wine" /> Без открытой сделки
                  </label>
                </div>
              </details>
            </div>
          </MobileFilters>
          {/* Фильтры применяются сразу (AutoApply); кнопка — для Enter и без JS. */}
          <button className="sr-only">Найти</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="panel">
          {filtered ? (
            <EmptyState icon={SearchX} title="Никого не нашли" action={<Link href="/admin/clients" className="btn btn-outline btn-sm">Сбросить фильтры</Link>}>
              Проверьте написание имени или номера, смените сегмент или канал.
            </EmptyState>
          ) : (
            <EmptyState icon={Users} title="Клиентов пока нет" action={can(staff, "clients.create") ? <Link href="/admin/clients/new" className="btn btn-dark btn-sm">Новый клиент</Link> : undefined}>
              Клиенты появятся, когда зарегистрируются на сайте или вы заведёте их вручную.
            </EmptyState>
          )}
        </div>
      ) : (
        <div className="panel overflow-hidden" data-testid="clients-sheet">
          {/* Телефон: записи строками на всю ширину листа, без отдельных карточек. */}
          <ul className="divide-y divide-line lg:hidden" data-testid="clients-cards">
            {rows.map((r) => {
              const c = contactView(staff, r.user);
              return (
                <li key={r.user.id}>
                  <Link href={`/admin/clients/${r.user.id}`} className="m-card block px-4 py-3">
                    <div className="flex items-start gap-3">
                      <ChatAvatar name={name(r.user)} url={null} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold">{name(r.user)}</div>
                        <div className="truncate text-sm text-muted tabular-nums">{c.phone || c.email}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[15px] font-semibold whitespace-nowrap tabular-nums">{r.ltv ? formatPrice(r.ltv) : "—"}</div>
                        <div className="text-xs text-muted">{r.ordersCount ? ruCount(r.ordersCount, "заказ", "заказа", "заказов") : "без заказов"}</div>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-[52px] text-xs text-muted">
                      <span>{channelLabel(toAttribution(r.user.source))}</span>
                      {r.user.managerId ? <span>{managerName.get(r.user.managerId) ?? "—"}</span> : null}
                      {r.user.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-wine">
                          {t}
                        </span>
                      ))}
                      <span className="ml-auto">{r.booksCount ? `книг: ${r.booksCount}` : "без книги"}, был {relative(r.user.lastSeenAt)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="max-lg:hidden">
            {canRepeat ? (
              <div className="border-b border-line bg-sunken/40 px-5 py-2.5">
                <RepeatSale occasionTitle={filters.occasion ? occasionLabels[filters.occasion].label : "праздник"} />
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="table min-w-[900px]">
                <thead>
                  <tr>
                    {canRepeat ? <th className="w-10" aria-label="Выбор" /> : null}
                    <th>Клиент</th>
                    <th>Канал</th>
                    <th>Книги</th>
                    <th className="num">Заказы</th>
                    <th className="num">Сумма покупок</th>
                    <th>Последний визит</th>
                    <th>Регистрация</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const c = contactView(staff, r.user);
                    return (
                      <tr key={r.user.id}>
                        {canRepeat ? (
                          <td>
                            <input type="checkbox" name="ids" value={r.user.id} form={REPEAT_FORM} className="size-4 align-middle accent-wine" aria-label={`Выбрать ${r.user.name || r.user.email}`} />
                          </td>
                        ) : null}
                        <td className="max-w-96">
                          <div className="flex items-center gap-3">
                            <ChatAvatar name={name(r.user)} url={null} size={40} />
                            <div className="min-w-0">
                              <Link href={`/admin/clients/${r.user.id}`} className="block truncate font-medium hover:text-wine">
                                {name(r.user)}
                              </Link>
                              <div className="truncate text-xs text-muted">
                                <span className="tabular-nums">{c.phone || c.email}</span>
                                {c.phone && c.email ? ` · ${c.email}` : ""}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-56">
                          <span className="block truncate text-ink-soft" title={r.user.source ? JSON.stringify(r.user.source) : ""}>
                            {channelLabel(toAttribution(r.user.source))}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                            {r.user.managerId ? (
                              <span title="Ответственный">
                                <span className="sr-only">Ответственный:</span> {managerName.get(r.user.managerId) ?? "—"}
                              </span>
                            ) : null}
                            {r.user.tags.map((t) => (
                              <Link key={t} href={link({ tag: t, page: undefined })} className="text-wine hover:underline">
                                {t}
                              </Link>
                            ))}
                          </span>
                        </td>
                        <td>
                          {r.booksCount ? (
                            <>
                              <span className="tabular-nums">
                                {r.booksCount} · {r.bestAnswered} отв.{r.bestWords ? ` · ${r.bestWords} сл.` : ""}
                              </span>
                              <div className="text-xs text-muted">изм. {relative(r.lastBookUpdate)}</div>
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="num">{r.ordersCount || <span className="text-muted">—</span>}</td>
                        <td className="num font-medium">{r.ltv ? formatPrice(r.ltv) : <span className="font-normal text-muted">—</span>}</td>
                        <td className="whitespace-nowrap text-muted">{relative(r.user.lastSeenAt)}</td>
                        <td className="whitespace-nowrap text-muted">{formatDate(r.user.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line bg-sunken/40 px-4 py-2.5 text-sm sm:px-5">
            <span className="text-muted tabular-nums">{pages > 1 ? `Клиенты ${(page - 1) * PAGE + 1}–${(page - 1) * PAGE + rows.length} из ${total}` : `Всего: ${ruCount(total, "клиент", "клиента", "клиентов")}`}</span>
            {pages > 1 ? (
              <nav className="flex items-center gap-2" aria-label="Страницы">
                {page > 1 ? (
                  <Link className="btn btn-outline btn-sm" href={link({ page: String(page - 1) })}>
                    <ChevronLeft className="size-4" aria-hidden /> Назад
                  </Link>
                ) : null}
                <span className="text-muted tabular-nums">
                  {page} из {pages}
                </span>
                {page * PAGE < total ? (
                  <Link className="btn btn-outline btn-sm" href={link({ page: String(page + 1) })}>
                    Дальше <ChevronRight className="size-4" aria-hidden />
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
