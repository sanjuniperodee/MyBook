import { container } from "@/server/container";
import { PageHeader } from "@/components/admin/PageHeader";
import { notFound } from "next/navigation";
import { canAssignOthers, canSeeAssigned, contactView, requireStaff } from "@/server/access";
import { uuid } from "@/server/input";
import { staffOptions } from "@/modules/access/ui";
import { NewDealForm } from "./NewDealForm";
import { discountLimit } from "@/server/discount";

export const metadata = { title: "Новая сделка" };

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ client?: string; p?: string }> }) {
  const staff = await requireStaff("deals.edit");
  const { client: clientParam, p } = await searchParams;
  const clientId = clientParam ? uuid.safeParse(clientParam) : null;
  if (clientId && !clientId.success) notFound();
  const [stages, admins, client, pipelines, maxDiscount] = await Promise.all([
    container().sales.queries.listStages(),
    container().access.queries.allStaff(),
    clientId?.success ? container().reporting.clientById(clientId.data) : null,
    container().sales.queries.listPipelines(),
    discountLimit(staff),
  ]);
  // Клиент сайта (не сотрудник), которого сотрудник видит: чужой клиент у роли «только свои» — как будто его нет.
  if (clientId && (!client || client.role !== "user" || !canSeeAssigned(staff, client.managerId))) notFound();
  // Номер — как везде в CRM: без права на контакты маской; тогда поля телефона в форме нет и номер сервер берёт у клиента.
  const contact = client ? contactView(staff, { phone: client.phone, email: client.email }) : null;
  const pipeline = pipelines.find((x) => x.id === p) ?? pipelines[0];
  const options = canAssignOthers(staff) ? staffOptions(admins) : staffOptions(admins).filter((a) => a.id === staff.user.id);
  return (
    <div className="flex w-full max-w-[40rem] flex-col gap-5">
      <PageHeader back={{ href: client ? `/admin/clients/${client.id}` : "/admin/deals", label: client ? (client.name || "Клиент") : "Сделки" }} title="Новая сделка">
        {client ? "Заявка для клиента сайта или сделка по договорённости — с тарифом, ценой и предоплатой." : "Заявка, которая пришла не с сайта: звонок, встреча, рекомендация. Заявки с сайта и из чатов заводятся сами."}
      </PageHeader>
      <NewDealForm
        stages={stages.filter((s) => s.kind === "open").map((s) => ({ id: s.id, name: pipelines.length > 1 ? `${pipelines.find((x) => x.id === s.pipelineId)?.name} · ${s.name}` : s.name }))}
        defaultStageId={stages.find((s) => s.kind === "open" && s.pipelineId === pipeline.id)?.id}
        admins={options}
        me={staff.user.id}
        canAssign={canAssignOthers(staff)}
        maxDiscountPercent={maxDiscount}
        client={client && contact ? { id: client.id, name: client.name || client.email.split("@")[0], phone: contact.phone, phoneMasked: contact.masked } : null}
      />
    </div>
  );
}
