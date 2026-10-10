import Link from "next/link";
import { canAssignOthers, requireStaff, can } from "@/server/access";
import { staffOptions } from "@/modules/access/ui";
import { container } from "@/server/container";
import { NewClientForm } from "./NewClientForm";

export const metadata = { title: "Новый клиент" };

export default async function NewClientPage() {
  const staff = await requireStaff("clients.create");
  const [stages, pipelines, admins] = await Promise.all([container().sales.queries.listStages(), container().sales.queries.listPipelines(), container().access.queries.allStaff()]);
  const open = stages.filter((s) => s.kind === "open");
  const options = canAssignOthers(staff) ? staffOptions(admins) : staffOptions(admins).filter((a) => a.id === staff.user.id);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/admin/clients" className="text-sm text-muted hover:text-ink">
        ← Клиенты
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Новый клиент</h1>
        <p className="mt-1 text-sm text-muted">Заведите клиента с логином и паролем, укажите сумму договорённости и предоплату — сделка и задачи создадутся сами.</p>
      </div>
      <NewClientForm
        canDeal={can(staff, "deals.edit")}
        stages={open.map((s) => ({ id: s.id, name: pipelines.length > 1 ? `${pipelines.find((x) => x.id === s.pipelineId)?.name} · ${s.name}` : s.name }))}
        defaultStageId={open.find((s) => s.name === "Взяли в работу")?.id ?? open[0]?.id}
        admins={options}
        me={staff.user.id}
        canAssign={canAssignOthers(staff)}
      />
    </div>
  );
}
