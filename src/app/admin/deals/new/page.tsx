import { container } from "@/server/container";
import Link from "next/link";
import { canAssignOthers, requireStaff } from "@/server/access";
import { listAdmins, staffOptions } from "@/lib/crm";
import { NewDealForm } from "./NewDealForm";

export const metadata = { title: "Новая сделка" };

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ client?: string; p?: string }> }) {
  const staff = await requireStaff("deals.edit");
  const { client: clientId, p } = await searchParams;
  const [stages, admins, client, pipelines] = await Promise.all([
    container().sales.queries.listStages(),
    listAdmins(),
    clientId ? container().clients.clients.find(clientId) : null,
    container().sales.queries.listPipelines(),
  ]);
  const pipeline = pipelines.find((x) => x.id === p) ?? pipelines[0];
  const options = canAssignOthers(staff) ? staffOptions(admins) : staffOptions(admins).filter((a) => a.id === staff.user.id);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/admin/deals" className="text-sm text-muted hover:text-ink">
        ← Сделки
      </Link>
      <h1 className="text-2xl font-semibold">Новая сделка</h1>
      <NewDealForm
        stages={stages.filter((s) => s.kind === "open").map((s) => ({ id: s.id, name: pipelines.length > 1 ? `${pipelines.find((x) => x.id === s.pipelineId)?.name} · ${s.name}` : s.name }))}
        defaultStageId={stages.find((s) => s.kind === "open" && s.pipelineId === pipeline.id)?.id}
        admins={options}
        me={staff.user.id}
        client={client ? { id: client.id, name: client.name || client.email.split("@")[0], phone: client.phone ?? "" } : null}
      />
    </div>
  );
}
