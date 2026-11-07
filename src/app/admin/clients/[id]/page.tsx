import { listFields } from "@/modules/workspace";
import { nowMs } from "@/lib/dates";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { ChatAvatar } from "@/components/admin/chat/Inbox";
import { formatDate } from "@/lib/dates";
import { notFound } from "next/navigation";
import { container } from "@/server/container";
import { staffOptions } from "@/modules/access/ui";
import { canRemind } from "@/modules/notifications";
import { NotesTimeline, TaskList } from "@/components/admin/CrmWidgets";
import { clientScreen } from "@/modules/reporting/ui/client-screen";
import { ClientFields, RemindButton, TagEditor } from "./ClientControls";
import { ClientBooks, ClientDeals, ClientOrders, ClientPayments, ClientProfile, ClientReferrals, ClientSummary } from "./sections";
import { ClientAccess } from "./ClientAccess";
import { staffLogin } from "@/app/admin/clients/new/access-message";
import { isPhoneEmail } from "@/modules/identity/domain";
import { can, canAssignOthers, canSeeAssigned, contactView, requireStaff, canSeeClientRecords } from "@/server/access";
import { pageId } from "@/server/input";

export const metadata = { title: "Клиент" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("clients.view");
  const id = pageId((await params).id);
  const client = await container().reporting.clientById(id);
  if (!client || !canSeeAssigned(staff, client.managerId)) notFound();

  const [{ bookRows, orderRows, taskRows, noteRows, dealRows, paymentRows, money }, admins, clientFields, noMarketing, referrals] = await Promise.all([
    container().reporting.clientCard(id, { deals: can(staff, "deals.view") }),
    container().access.queries.allStaff(),
    listFields("client"),
    container().messaging.chats.noMarketingFor({ clientId: client.id, phones: [client.phone, ...client.extraPhones] }),
    container().reporting.clientReferrals(id),
  ]);

  const adminOptions = staffOptions(admins);
  // Неразобранный клиент виден роли «только свои», но его книги и заказы — только своим клиентам.
  const ownRecords = canSeeClientRecords(staff, client.managerId);
  // Заказ виден и ответственному за него; книги — только у своего клиента (как canSeeOrder / canSeeBook).
  const orders = orderRows.filter((o) => canSeeClientRecords(staff, client.managerId, o.assigneeId));
  const books = ownRecords ? bookRows : [];
  // Сделки и платежи — только свои и ничьи: у неразобранного клиента могут быть сделки других менеджеров.
  const deals = dealRows.filter((r) => canSeeAssigned(staff, r.deal.assigneeId));
  const payments = paymentRows.filter((p) => canSeeAssigned(staff, p.deal_assignee_id));
  const screen = clientScreen({ client, staff: admins, tasks: taskRows, notes: noteRows, orders, books, money, remindAllowed: canRemind(client.remindedAt, new Date(nowMs())), now: new Date() });
  const { tasks, notes } = screen;
  const contact = contactView(staff, { phone: screen.rawPhone, email: client.email });
  const canEdit = can(staff, "clients.edit");
  // «Только свои» может взять неразобранного клиента себе, но не отдать другому.
  const managerOptions = canAssignOthers(staff) ? adminOptions : adminOptions.filter((a) => a.id === staff.user.id || a.id === client.managerId);

  const displayName = client.name || client.email.split("@")[0];

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        back={{ href: "/admin/clients", label: "Клиенты" }}
        title={
          <span className="flex min-w-0 items-center gap-3">
            <ChatAvatar name={displayName} url={null} size={48} />
            <span className="min-w-0 break-words">{displayName}</span>
          </span>
        }
        meta={
          <>
            <Badge>
              {client.role === "admin" ? "Администратор" : "Клиент"} с {formatDate(client.createdAt)}
            </Badge>
            {client.tags.slice(0, 3).map((t) => (
              <Badge key={t} tone="accent">
                {t}
              </Badge>
            ))}
          </>
        }
        actions={
          can(staff, "deals.edit") ? (
            <Link href={`/admin/deals/new?client=${client.id}`} className="btn btn-primary btn-sm">
              <Plus className="size-4" aria-hidden /> Новая сделка
            </Link>
          ) : undefined
        }
      />

      <ClientSummary client={client} screen={screen} contact={contact} can={(p) => can(staff, p)} />

      <div className="grid gap-4 lg:gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          {can(staff, "deals.view") ? <ClientDeals clientId={client.id} deals={deals} can={(p) => can(staff, p)} /> : null}

          <Panel
            title={
              <>
                Задачи {tasks.filter((t) => !t.done).length ? <span className="font-normal text-muted tabular-nums">{tasks.filter((t) => !t.done).length}</span> : null}
              </>
            }
          >
            <TaskList tasks={tasks} admins={adminOptions} clientId={client.id} emptyText="Задач нет — запланируйте следующий шаг" />
          </Panel>

          <ClientBooks books={books} />
          <ClientOrders orders={orders} />
          {payments.length ? <ClientPayments payments={payments} /> : null}

          <Panel title="История общения">
            <NotesTimeline notes={notes} clientId={client.id} mentionables={staffOptions(admins).filter((a) => a.id !== staff.user.id).map((a) => a.label)} />
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:gap-5" aria-label="Профиль клиента">
          <ClientProfile client={client} screen={screen} contact={contact} canEdit={canEdit} managerOptions={managerOptions} noMarketing={noMarketing} />
          <Panel title="Теги">
            {canEdit ? (
              <TagEditor clientId={client.id} tags={client.tags} />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {client.tags.length ? (
                  client.tags.map((t) => (
                    <Badge key={t} tone="accent">
                      {t}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted">Тегов нет</span>
                )}
              </div>
            )}
          </Panel>
          {clientFields.length ? (
            <Panel title="Поля клиента">
              <ClientFields clientId={client.id} fields={clientFields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }))} values={client.customFields} disabled={!canEdit} />
            </Panel>
          ) : null}
          {(can(staff, "clients.create") && client.role === "user") || canEdit ? (
            <Panel title="Кабинет клиента">
              <div className="space-y-4">
                {can(staff, "clients.create") && client.role === "user" ? <ClientAccess clientId={client.id} loginText={staffLogin(isPhoneEmail(client.email) ? (client.phone ?? "") : client.email, can(staff, "clients.contacts"))} /> : null}
                {canEdit ? (
                  <div className={can(staff, "clients.create") && client.role === "user" ? "border-t border-line pt-4" : undefined}>
                    <RemindButton clientId={client.id} disabled={screen.remind.disabled} hint={screen.remind.hint} />
                  </div>
                ) : null}
              </div>
            </Panel>
          ) : null}
          {referrals.code || referrals.invitedBy || referrals.friends.length ? <ClientReferrals data={referrals} /> : null}
        </aside>
      </div>
    </div>
  );
}
