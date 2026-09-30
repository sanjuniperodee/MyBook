import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { crmDeals } from "@/lib/db/schema";
import { requireStaff } from "@/lib/crm/rbac";
import { listStages } from "@/lib/crm/deals";
import { StageRow, NewStage } from "./StageEditor";

export const metadata = { title: "Этапы воронки" };

export default async function StagesPage() {
  await requireStaff("settings.manage");
  const [stages, counts] = await Promise.all([listStages(), db.select({ stageId: crmDeals.stageId, n: sql<number>`count(*)::int` }).from(crmDeals).groupBy(crmDeals.stageId)]);
  const byStage = new Map(counts.map((c) => [c.stageId, c.n]));
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/admin/deals" className="text-sm text-muted hover:text-ink">
        ← Сделки
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Этапы воронки</h1>
        <p className="mt-1 text-sm text-muted">Этапы «в работе» можно переименовывать, менять местами и удалять. «Успех» и «Отказ» закрывают сделку — их можно только переименовать. «Авто» — сделка сама переходит на этап, когда клиент делает это на сайте (только вперёд по воронке).</p>
      </div>
      <div className="divide-y divide-line rounded-2xl border border-line bg-white">
        {stages.map((s, i) => (
          <StageRow
            key={s.id}
            stage={{ id: s.id, name: s.name, color: s.color, kind: s.kind, milestone: s.milestone }}
            deals={byStage.get(s.id) ?? 0}
            canUp={s.kind === "open" && i > 0 && stages[i - 1].kind === "open"}
            canDown={s.kind === "open" && stages[i + 1]?.kind === "open"}
          />
        ))}
      </div>
      <NewStage />
    </div>
  );
}
