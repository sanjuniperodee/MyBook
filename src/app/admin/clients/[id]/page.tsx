import { listFields } from "@/modules/workspace";
import { nowMs } from "@/lib/dates";
import { BackLink } from "@/components/admin/BackLink";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { ChatAvatar } from "@/components/admin/chat/Inbox";
import { notFound } from "next/navigation";
import { container } from "@/server/container";
import { staffOptions } from "@/modules/access/ui";
import { canRemind } from "@/modules/notifications";
import { NotesTimeline, TaskList } from "@/components/admin/CrmWidgets";
import { clientScreen } from "@/modules/reporting/ui/client-screen";
import { ClientFields, RemindButton, TagEditor } from "./ClientControls";
import { ClientBooks, ClientDeals, ClientHeader, ClientOrders, ClientPayments, ClientProfile, ClientReferrals } from "./sections";
import { ClientTabs } from "./ClientTabs";
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

  const openTasks = tasks.filter((t) => !t.done).length;
  const can_ = (p: Parameters<typeof can>[1]) => can(staff, p);
  const tagList = canEdit ? (
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
  );
  const showAccess = can(staff, "clients.create") && client.role === "user";
  const hasCabinet = showAccess || canEdit || clientFields.length > 0 || !!(referrals.code || referrals.invitedBy || referrals.friends.length);

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <BackLink href="/admin/clients">Клиенты</BackLink>
      <ClientHeader client={client} displayName={displayName} screen={screen} contact={contact} can={can_} avatar={<ChatAvatar name={displayName} url={null} size={56} />} tags={client.tags} />

      <div className="grid gap-4 lg:gap-5 xl:grid-cols-[minmax(0,47rem)_minmax(20rem,1fr)] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <ClientProfile client={client} screen={screen} contact={contact} canEdit={canEdit} managerOptions={managerOptions} noMarketing={noMarketing} tags={tagList} />
          <ClientTabs
            tabs={[
              ...(can(staff, "deals.view") ? [{ key: "deals", label: "Сделки", count: deals.length || null, node: <ClientDeals clientId={client.id} deals={deals} can={can_} /> }] : []),
              { key: "tasks", label: "Задачи", count: openTasks || null, node: <div className="p-4 sm:p-5"><TaskList tasks={tasks} admins={adminOptions} clientId={client.id} emptyText="Задач нет — запланируйте следующий шаг" /></div> },
              { key: "books", label: "Книги", count: books.length || null, node: <ClientBooks books={books} /> },
              { key: "orders", label: "Заказы", count: orders.length || null, node: <ClientOrders orders={orders} /> },
              ...(payments.length ? [{ key: "payments", label: "Платежи", count: payments.length, node: <ClientPayments payments={payments} /> }] : []),
              ...(hasCabinet
                ? [
                    {
                      key: "cabinet",
                      label: "Кабинет",
                      node: (
                        <div className="space-y-6 p-4 sm:p-5">
                          {showAccess || canEdit ? (
                            <section className="space-y-4" aria-label="Кабинет клиента">
                              <h2 className="text-[13px] font-semibold">Кабинет клиента</h2>
                              {showAccess ? <ClientAccess clientId={client.id} loginText={staffLogin(isPhoneEmail(client.email) ? (client.phone ?? "") : client.email, can(staff, "clients.contacts"))} /> : null}
                              {canEdit ? (
                                <div className={showAccess ? "border-t border-line pt-4" : undefined}>
                                  <RemindButton clientId={client.id} disabled={screen.remind.disabled} hint={screen.remind.hint} />
                                </div>
                              ) : null}
                            </section>
                          ) : null}
                          {clientFields.length ? (
                            <section className="space-y-3" aria-label="Поля клиента">
                              <h2 className="text-[13px] font-semibold">Поля клиента</h2>
                              <ClientFields clientId={client.id} fields={clientFields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }))} values={client.customFields} disabled={!canEdit} />
                            </section>
                          ) : null}
                          {referrals.code || referrals.invitedBy || referrals.friends.length ? <ClientReferrals data={referrals} /> : null}
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </div>

        <aside aria-label="Заметки и история" className="min-w-0 xl:sticky xl:top-[calc(var(--topbar-h)+1rem)]">
          <Panel title="История общения" description="Заметки, звонки, письма и сообщения по клиенту">
            <NotesTimeline notes={notes} clientId={client.id} mentionables={staffOptions(admins).filter((a) => a.id !== staff.user.id).map((a) => a.label)} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
