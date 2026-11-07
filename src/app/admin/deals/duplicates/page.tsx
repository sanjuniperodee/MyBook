import { container } from "@/server/container";
import Link from "next/link";
import { CopyCheck, Mail, Phone } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ruCount } from "@/i18n/plural";
import { can, canSeeAssigned, contactView, requireStaff } from "@/server/access";
import { formatPhone } from "@/shared/domain/phone";
import { formatPrice } from "@/config/site";
import { staffLabel } from "@/shared/domain/staff";
import { mergeCancels } from "@/modules/ordering";
import { formatDate } from "@/lib/dates";
import { DuplicateCompare, type CompareDeal } from "./DuplicateCompare";

export const metadata = { title: "Дубли сделок" };

type Row = { key: string; kind: "phone" | "email"; deals: { id: string; number: number; title: string; stage: string; color: string; created: string; assignee: string | null }[] };
/** Групп на странице: у каждой подгружаются сделки и счета для сравнения. */
const LIMIT = 30;

/** Группы открытых сделок одного человека (по телефону или e-mail): сделки рядом, расходящееся выделено, действие — «Объединить». */
export default async function DuplicatesPage() {
  const staff = await requireStaff("deals.view", "deals.edit");
  const [found, admins] = await Promise.all([container().reporting.duplicateGroups(), container().access.queries.allStaff()]);
  const rows: Row[] = found;
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const all = rows.map((r) => ({ ...r, deals: r.deals.filter((d) => canSeeAssigned(staff, d.assignee)) })).filter((r) => r.deals.length > 1);
  const visible = all.slice(0, LIMIT);
  const allowed = can(staff, "deals.edit", "deals.delete");

  // Подробности каждой сделки (бюджет, контакт, теги) и её счета — для сравнения и перечня отменяемых счетов.
  const ids = [...new Set(visible.flatMap((g) => g.deals.map((d) => d.id)))];
  const details = new Map(
    await Promise.all(
      ids.map(async (id) => {
        const [deal, invoices] = await Promise.all([container().reporting.dealById(id), container().ordering.invoices.listFor(id)]);
        return [id, { deal, invoices }] as const;
      }),
    ),
  );

  const groups = visible.map((g) => {
    const deals: CompareDeal[] = g.deals.map((d) => {
      const x = details.get(d.id)?.deal;
      const contact = contactView(staff, { phone: x?.contactPhone ? formatPhone(x.contactPhone) : undefined, email: x?.contactEmail ?? undefined });
      return {
        id: d.id,
        number: d.number,
        title: d.title,
        stage: d.stage,
        color: d.color,
        created: formatDate(d.created),
        assignee: d.assignee ? (names.get(d.assignee) ?? null) : null,
        amount: x?.amount ? formatPrice(x.amount) : "",
        contactName: x?.contactName ?? "",
        phone: contact.phone ?? "",
        email: contact.email ?? "",
        tags: x?.tags.join(", ") ?? "",
        canMerge: allowed,
      };
    });
    // «оставляемая:вливаемая» → счета, которые слияние отменит (правило карточки сделки: mergeCancels).
    const cancels: Record<string, string[]> = {};
    for (const t of g.deals)
      for (const o of g.deals) {
        if (t.id === o.id) continue;
        const target = details.get(t.id);
        const list = mergeCancels([...(target?.invoices ?? []), ...(details.get(o.id)?.invoices ?? [])], o.id, !!target?.deal?.orderId);
        if (list.length) cancels[`${t.id}:${o.id}`] = list.map((i) => `${i.label} на ${formatPrice(i.snapshot().amount)}`);
      }
    return { ...g, compare: deals, cancels };
  });

  return (
    <div className="flex w-full max-w-5xl flex-col gap-5">
      <PageHeader back={{ href: "/admin/deals", label: "Сделки" }} title="Дубли сделок" meta={all.length ? <Badge tone="warning">{ruCount(all.length, "группа", "группы", "групп")}</Badge> : null}>
        Открытые сделки с одинаковым телефоном (включая дополнительные номера) или e-mail. Выберите, какую оставить, и нажмите «Объединить». Закрытые сделки — прошлые покупки и отказы — здесь не показываются: их не вливают в другие.
      </PageHeader>
      {groups.length === 0 ? (
        <div className="panel">
          <EmptyState icon={CopyCheck} title="Дублей нет" action={<Link href="/admin/deals" className="btn btn-outline btn-sm">К сделкам</Link>}>
            Здесь появятся открытые сделки одного человека — по телефону или e-mail, — чтобы объединить их в одну.
          </EmptyState>
        </div>
      ) : null}
      {groups.map((g) => (
        <Panel
          key={g.kind + g.key}
          flush
          className="overflow-hidden"
          title={
            <span className="flex items-center gap-2">
              {g.kind === "phone" ? <Phone className="size-4 text-muted" aria-hidden /> : <Mail className="size-4 text-muted" aria-hidden />}
              <span className="tabular-nums">{g.kind === "phone" ? contactView(staff, { phone: formatPhone(g.key) }).phone : contactView(staff, { email: g.key }).email}</span>
            </span>
          }
          actions={<span className="text-xs text-muted">{ruCount(g.deals.length, "сделка", "сделки", "сделок")}</span>}
        >
          <DuplicateCompare deals={g.compare} cancels={g.cancels} />
        </Panel>
      ))}
      {all.length > LIMIT ? <p className="text-center text-sm text-muted">Показаны первые {LIMIT} групп из {all.length}: объедините эти — остальные появятся следом.</p> : null}
    </div>
  );
}
