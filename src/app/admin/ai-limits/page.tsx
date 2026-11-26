import Link from "next/link";
import { Search, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionHead } from "@/components/admin/SectionHead";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/dates";
import { requireStaff } from "@/server/access";
import { CLIENT_AI_TOOLS } from "@/server/clientAiLimits";
import {
  GlobalLimitsForm,
  UserLimitsForm,
  type ToolRow,
  type UserToolRow,
} from "./Forms";
import { CLIENT_AI_TOOL_LABELS, hoursLabel, minutesLabel } from "./labels";
import { crmRead } from "@/server/v1-local-bridge-crm";

export const metadata = { title: "Лимиты AI" };

const anchor = "scroll-mt-[calc(var(--topbar-h)+1rem)] space-y-3";

/**
 * Лимиты AI-помощников у клиента: общие окна и число запросов, свои лимиты отдельных клиентов (выдать больше, урезать,
 * закрыть) и сколько клиент потратил сейчас — с кнопкой «обнулить».
 */
export default async function AiLimitsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; user?: string }>;
}) {
  await requireStaff("settings.manage");
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 100) ?? "";
  const selectedId =
    sp.user && /^[0-9a-f-]{36}$/i.test(sp.user) ? sp.user : null;

  const { base, overrides, found, selected, ownUsers, usage } = await crmRead("pages.aiLimits", { q, selectedId });
  const rows: ToolRow[] = CLIENT_AI_TOOLS.map((tool) => ({
    tool,
    ...CLIENT_AI_TOOL_LABELS[tool],
    ...base[tool],
  }));
  const overrideIds = Object.keys(overrides);

  const resetLabel = (at: number | null) =>
    at ? `· обнулится ${formatDate(new Date(at), true)}` : "";
  const own = selected ? overrides[selected.id] : undefined;
  const userRows: UserToolRow[] | null =
    selected && usage
      ? rows.map((r) => {
          const u = usage[r.tool];
          return {
            ...r,
            ownShort: own?.tools[r.tool]?.short,
            ownLong: own?.tools[r.tool]?.long,
            usedShort: u.short.used,
            usedLong: u.long.used,
            shortReset: resetLabel(u.short.resetAt),
            longReset: resetLabel(u.long.resetAt),
            effShort: u.limit.short,
            effLong: u.limit.long,
          };
        })
      : null;

  const ownList = overrideIds
    .map((id, i) => ({ id, user: ownUsers[i], o: overrides[id] }))
    .filter((x) => x.user)
    .sort((a, b) => b.o.at.localeCompare(a.o.at));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Лимиты AI"
        meta={
          <Badge>
            {ownList.length
              ? `своих лимитов: ${ownList.length}`
              : "у всех общие"}
          </Badge>
        }
      >
        Сколько запросов к AI-помощникам клиент может сделать за короткое окно и
        за длинное. Окна меняются здесь же (10 минут → час), а отдельному
        клиенту можно выдать больше, урезать или закрыть помощник. Провайдеры и
        модели — в «Интеграциях» → AI; ИИ-дизайнер считает запросы по-своему —
        на странице «ИИ-дизайнер».
      </PageHeader>

      <section id="global" aria-labelledby="global-h" className={anchor}>
        <SectionHead
          id="global-h"
          title="Общие лимиты"
          meta="Для всех клиентов без своих лимитов"
        />
        <div className="panel p-4 sm:p-5">
          <GlobalLimitsForm rows={rows} />
        </div>
      </section>

      <section id="client" aria-labelledby="client-h" className={anchor}>
        <SectionHead
          id="client-h"
          title="Лимиты клиента"
          meta="Найдите клиента — увидите, сколько он потратил, и сможете выдать свои лимиты"
        />
        <div className="panel space-y-4 p-4 sm:p-5">
          <form
            role="search"
            className="flex flex-wrap items-center gap-2"
            action="/admin/ai-limits#client"
          >
            <div className="relative min-w-64 flex-1 sm:max-w-md">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Имя, e-mail, телефон"
                aria-label="Найти клиента: имя, e-mail, телефон"
                className="input pl-9"
              />
            </div>
            <button type="submit" className="btn btn-outline">
              Найти
            </button>
          </form>

          {found ? (
            found.rows.length ? (
              <ul className="divide-y divide-line rounded-[var(--r-ctl)] border border-line">
                {found.rows.map(({ user: u }) => (
                  <li key={u.id}>
                    <Link
                      href={`/admin/ai-limits?user=${u.id}#client`}
                      className={`flex flex-wrap items-baseline gap-x-3 px-3 py-2 text-sm hover:bg-sunken ${u.id === selectedId ? "bg-sunken" : ""}`}
                    >
                      <span className="font-medium">{u.name || u.email}</span>
                      <span className="text-xs text-muted">
                        {[u.email, u.phone].filter(Boolean).join(" · ")}
                      </span>
                      {overrides[u.id] ? (
                        <Badge tone="accent">свои лимиты</Badge>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Никого не нашли по «{q}».</p>
            )
          ) : null}

          {selected && userRows ? (
            <div className="space-y-3 border-t border-line pt-4">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <Link
                  href={`/admin/clients/${selected.id}`}
                  className="font-semibold text-wine hover:underline"
                >
                  {selected.name || selected.email}
                </Link>
                <span className="text-xs text-muted">
                  {[selected.email, selected.phone].filter(Boolean).join(" · ")}
                </span>
                {own ? (
                  <Badge tone="accent">свои лимиты</Badge>
                ) : (
                  <Badge>общие лимиты</Badge>
                )}
              </div>
              <UserLimitsForm
                key={`${selected.id}:${own?.at ?? ""}`}
                userId={selected.id}
                rows={userRows}
                note={own?.note ?? ""}
                hasOwn={!!own}
              />
            </div>
          ) : selectedId ? (
            <p className="text-sm text-muted">Клиент не найден.</p>
          ) : null}
        </div>
      </section>

      <section id="own" aria-labelledby="own-h" className={anchor}>
        <SectionHead
          id="own-h"
          title="Клиенты со своими лимитами"
          meta="Короткое окно / длинное; прочерк — общий"
        />
        <div className="panel overflow-hidden">
          {ownList.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Клиент</th>
                    {CLIENT_AI_TOOLS.map((t) => (
                      <th key={t}>
                        {CLIENT_AI_TOOL_LABELS[t].title}
                        <div className="text-xs font-normal text-muted">
                          {minutesLabel(base[t].shortMin)} /{" "}
                          {hoursLabel(base[t].longHours)}
                        </div>
                      </th>
                    ))}
                    <th>Заметка</th>
                    <th>Изменено</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ownList.map(({ id, user: u, o }) => (
                    <tr key={id}>
                      <td>
                        <Link
                          href={`/admin/clients/${id}`}
                          className="font-medium text-wine hover:underline"
                        >
                          {u!.name || u!.email}
                        </Link>
                        {u!.name ? (
                          <div className="text-xs text-muted">{u!.email}</div>
                        ) : null}
                      </td>
                      {CLIENT_AI_TOOLS.map((t) => {
                        const x = o.tools[t];
                        return (
                          <td
                            key={t}
                            className="whitespace-nowrap tabular-nums"
                          >
                            {x ? (
                              <>
                                {x.short ?? (
                                  <span className="text-muted">—</span>
                                )}{" "}
                                /{" "}
                                {x.long ?? (
                                  <span className="text-muted">—</span>
                                )}
                                {x.short === 0 || x.long === 0 ? (
                                  <Badge tone="danger" className="ml-2">
                                    закрыт
                                  </Badge>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-muted">общий</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="max-w-64 text-sm text-ink-soft">
                        {o.note ?? ""}
                      </td>
                      <td className="text-xs whitespace-nowrap text-muted">
                        {o.at ? formatDate(o.at, true) : ""}
                      </td>
                      <td>
                        <Link
                          href={`/admin/ai-limits?user=${id}#client`}
                          className="btn btn-outline btn-sm"
                        >
                          Изменить
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              compact
              icon={Users}
              title="Своих лимитов ни у кого нет"
            >
              Найдите клиента выше и впишите ему свои числа — он появится здесь.
            </EmptyState>
          )}
        </div>
      </section>
    </div>
  );
}
