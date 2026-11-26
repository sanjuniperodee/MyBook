import Link from "next/link";
import { CircleCheck, LifeBuoy, Plus, Mic, Paperclip, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Tabs } from "@/components/admin/Tabs";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/dates";
import { requireStaff } from "@/server/access";
import { container } from "@/server/container";
import { SUPPORT_KIND_LABELS, SUPPORT_STATUS_LABELS, SUPPORT_STATUSES, type SupportStatus } from "@/shared/domain/support";
import { phoneLabel, STATUS_TONE } from "./labels";
import { seesAllTickets } from "@/server/support-access";

export const metadata = { title: "Обращения" };

type Filter = SupportStatus | "open" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Открытые" },
  ...SUPPORT_STATUSES.map((s) => ({ key: s as Filter, label: SUPPORT_STATUS_LABELS[s] })),
  { key: "all", label: "Все" },
];

/** Обращения с формы /support: открытые — срочные и старые сверху; номер обращения называют Claude в чате. */
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ s?: string; q?: string }> }) {
  const staff = await requireStaff();
  const all = seesAllTickets(staff);
  const mine = all ? undefined : staff.user.id;
  const sp = await searchParams;
  const filter: Filter = FILTERS.some((f) => f.key === sp.s) ? (sp.s as Filter) : "open";
  const q = sp.q?.trim().slice(0, 100) ?? "";
  const tickets = container().support.tickets;
  const [list, counts] = await Promise.all([tickets.list({ status: filter, q, createdBy: mine, limit: 200 }), tickets.counts(mine)]);
  const open = counts.new + counts.in_progress + counts.waiting;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const href = (s: Filter) => `/admin/support${s === "open" ? "" : `?s=${s}`}`;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        title="Обращения"
        meta={<Badge tone={counts.new ? "accent" : "neutral"}>{counts.new ? `новых: ${counts.new}` : `открытых: ${open}`}</Badge>}
        actions={
          <Link href="/admin/support/new" className="btn btn-primary">
            <Plus className="size-4" aria-hidden /> Новое обращение
          </Link>
        }
      >
        {all
          ? "Проблемы клиентов и просьбы от команды: переписка клиента, голосовые с расшифровкой, скриншоты и видео. Коммит с «Обращение №N» после выкатки сам закрывает обращение и пишет автору в WhatsApp."
          : "Ваши обращения: что не работает у клиента или что нужно изменить. Когда исправят — придёт сообщение в WhatsApp."}
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          label="Статус обращений"
          className="min-w-0 flex-1"
          items={FILTERS.map((f) => ({
            key: f.key,
            label: f.label,
            href: href(f.key),
            active: f.key === filter,
            count: f.key === "all" ? total || null : f.key === "open" ? open || null : counts[f.key] || null,
            alert: f.key === "new" && counts.new > 0,
          }))}
        />
        <form role="search" action="/admin/support" className="relative w-full sm:w-72">
          {filter !== "open" ? <input type="hidden" name="s" value={filter} /> : null}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input name="q" type="search" defaultValue={q} placeholder="№, текст, имя, телефон" aria-label="Найти обращение" className="input pl-9" />
        </form>
      </div>

      {list.length ? (
        <ul className="panel divide-y divide-line overflow-hidden">
          {list.map((t) => {
            const voices = t.attachments.filter((a) => a.kind === "audio").length;
            const others = t.attachments.length - voices;
            const text = t.summary.split("\n")[0]?.replace(/^Суть:\s*/i, "") || t.description || "Без описания — смотрите вложения";
            return (
              <li key={t.id}>
                <Link href={`/admin/support/${t.number}`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-sunken/60 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
                  <div className="w-16 shrink-0 font-semibold tabular-nums">№{t.number}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge tone={STATUS_TONE[t.status]} dot>
                        {SUPPORT_STATUS_LABELS[t.status]}
                      </Badge>
                      {t.urgency === "urgent" ? <Badge tone="danger">срочно</Badge> : null}
                      <span className="text-xs text-muted">{SUPPORT_KIND_LABELS[t.kind]}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm">{text}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                      <span>{t.reporterName || phoneLabel(t.notifyPhone)}</span>
                      {t.clientPhone ? <span>клиент {phoneLabel(t.clientPhone)}</span> : null}
                      {voices ? (
                        <span className="inline-flex items-center gap-1">
                          <Mic className="size-3" aria-hidden /> {voices}
                        </span>
                      ) : null}
                      {others ? (
                        <span className="inline-flex items-center gap-1">
                          <Paperclip className="size-3" aria-hidden /> {others}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-muted tabular-nums">{formatDate(t.createdAt, true)}</div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="panel">
          <EmptyState icon={filter === "open" ? CircleCheck : LifeBuoy} title={q ? "Ничего не нашлось" : filter === "open" ? "Открытых обращений нет" : "Здесь пока пусто"}>
            {q ? "Попробуйте номер обращения или часть телефона." : "Проблема у клиента или нужно что-то изменить — «Новое обращение»: выберите чат клиента и его сообщения."}
          </EmptyState>
        </div>
      )}
    </div>
  );
}
