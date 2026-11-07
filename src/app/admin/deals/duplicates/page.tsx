import { container } from "@/server/container";
import Link from "next/link";
import { ChevronRight, CopyCheck, Mail, Phone } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ruCount } from "@/i18n/plural";
import { StageLabel } from "../StageLabel";
import { canSeeAssigned, contactView, requireStaff } from "@/server/access";
import { formatPhone } from "@/shared/domain/phone";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Дубли сделок" };

type Row = { key: string; kind: "phone" | "email"; deals: { id: string; number: number; title: string; stage: string; color: string; created: string; assignee: string | null }[] };

/** Группы открытых сделок одного человека (по телефону или e-mail) — чтобы объединить их в одну. */
export default async function DuplicatesPage() {
  const staff = await requireStaff("deals.view", "deals.edit");
  const rows: Row[] = await container().reporting.duplicateGroups();
  const visible = rows.map((r) => ({ ...r, deals: r.deals.filter((d) => canSeeAssigned(staff, d.assignee)) })).filter((r) => r.deals.length > 1);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader back={{ href: "/admin/deals", label: "Сделки" }} title="Дубли сделок" meta={visible.length ? <Badge tone="warning">{ruCount(visible.length, "группа", "группы", "групп")}</Badge> : null}>
        Открытые сделки с одинаковым телефоном (включая дополнительные номера) или e-mail. Откройте основную сделку и нажмите «Объединить сюда» у лишней. Закрытые сделки — прошлые покупки и отказы — здесь не показываются: их не вливают в другие.
      </PageHeader>
      {visible.length === 0 ? (
        <div className="panel">
          <EmptyState icon={CopyCheck} title="Дублей нет" action={<Link href="/admin/deals" className="btn btn-outline btn-sm">К сделкам</Link>}>
            Здесь появятся открытые сделки одного человека — по телефону или e-mail, — чтобы объединить их в одну.
          </EmptyState>
        </div>
      ) : null}
      {visible.map((g) => (
        <Panel
          key={g.kind + g.key}
          flush
          title={
            <span className="flex items-center gap-2">
              {g.kind === "phone" ? <Phone className="size-4 text-muted" aria-hidden /> : <Mail className="size-4 text-muted" aria-hidden />}
              <span className="tabular-nums">{g.kind === "phone" ? contactView(staff, { phone: formatPhone(g.key) }).phone : contactView(staff, { email: g.key }).email}</span>
            </span>
          }
          actions={<span className="text-xs text-muted">{ruCount(g.deals.length, "сделка", "сделки", "сделок")}</span>}
        >
          <ul className="divide-y divide-line">
            {g.deals.map((d) => (
              <li key={d.id}>
                <Link href={`/admin/deals/${d.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm hover:bg-sunken/60 sm:px-5">
                  <span className="w-12 shrink-0 text-muted tabular-nums">№{d.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{d.title}</span>
                    <span className="block text-xs text-muted sm:hidden">{formatDate(d.created)}</span>
                  </span>
                  <StageLabel name={d.stage} color={d.color} className="shrink-0" />
                  <span className="hidden w-28 shrink-0 text-right text-xs text-muted sm:block">{formatDate(d.created)}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
