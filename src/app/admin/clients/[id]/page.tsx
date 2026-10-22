import { listFields } from "@/modules/workspace";
import { nowMs } from "@/lib/dates";
import Link from "next/link";
import { notFound } from "next/navigation";
import { container } from "@/server/container";
import { staffOptions } from "@/modules/access/ui";
import { canRemind } from "@/modules/notifications";
import { NotesTimeline, TaskList } from "@/components/admin/CrmWidgets";
import { clientScreen } from "@/modules/reporting/ui/client-screen";
import { ClientFields, RemindButton, TagEditor } from "./ClientControls";
import { ClientBooks, ClientDeals, ClientOrders, ClientPayments, ClientProfile } from "./sections";
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

  const [{ bookRows, orderRows, taskRows, noteRows, dealRows, paymentRows, money }, admins, clientFields, noMarketing] = await Promise.all([
    container().reporting.clientCard(id, { deals: can(staff, "deals.view") }),
    container().access.queries.allStaff(),
    listFields("client"),
    container().messaging.chats.noMarketingFor({ clientId: client.id, phones: [client.phone, ...client.extraPhones] }),
  ]);

  const adminOptions = staffOptions(admins);
  // Неразобранный клиент виден роли «только свои», но его книги и заказы — только своим клиентам.
  const ownRecords = canSeeClientRecords(staff, client.managerId);
  const screen = clientScreen({ client, staff: admins, tasks: taskRows, notes: noteRows, orders: ownRecords ? orderRows : [], books: ownRecords ? bookRows : [], money, remindAllowed: canRemind(client.remindedAt, new Date(nowMs())), now: new Date() });
  const { tasks, notes } = screen;
  const contact = contactView(staff, { phone: screen.rawPhone, email: client.email });
  const canEdit = can(staff, "clients.edit");
  // «Только свои» может взять неразобранного клиента себе, но не отдать другому.
  const managerOptions = canAssignOthers(staff) ? adminOptions : adminOptions.filter((a) => a.id === staff.user.id || a.id === client.managerId);

  return (
    <div className="space-y-6">
      <Link href="/admin/clients" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
        ← Клиенты
      </Link>
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Профиль */}
        <aside className="space-y-4 max-lg:order-2">
          <ClientProfile client={client} screen={screen} contact={contact} canEdit={canEdit} can={(p) => can(staff, p)} managerOptions={managerOptions} noMarketing={noMarketing} />
          {clientFields.length ? (
            <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold">Поля клиента</h2>
              <ClientFields clientId={client.id} fields={clientFields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }))} values={client.customFields} disabled={!canEdit} />
            </section>
          ) : null}
          <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold">Теги</h2>
            {canEdit ? (
              <TagEditor clientId={client.id} tags={client.tags} />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {client.tags.length ? client.tags.map((t) => <span key={t} className="rounded-full bg-rose px-2.5 py-1 text-xs text-wine">{t}</span>) : <span className="text-xs text-muted">—</span>}
              </div>
            )}
          </section>
          {can(staff, "clients.create") && client.role === "user" ? (
            <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold">Доступ в кабинет</h2>
              <ClientAccess clientId={client.id} loginText={staffLogin(isPhoneEmail(client.email) ? (client.phone ?? "") : client.email, can(staff, "clients.contacts"))} />
            </section>
          ) : null}
          {canEdit ? (
            <section className="space-y-3 rounded-2xl border border-line bg-white p-4 sm:p-5">
              <RemindButton clientId={client.id} disabled={screen.remind.disabled} hint={screen.remind.hint} />
            </section>
          ) : null}
        </aside>

        <div className="space-y-6">
          {can(staff, "deals.view") ? <ClientDeals clientId={client.id} deals={dealRows} can={(p) => can(staff, p)} /> : null}
          {paymentRows.length ? <ClientPayments payments={paymentRows} /> : null}
          <ClientBooks books={bookRows} />

          <ClientOrders orders={orderRows} />

          <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <h2 className="mb-2 font-semibold">Задачи</h2>
            <TaskList tasks={tasks} admins={adminOptions} clientId={client.id} />
          </section>

          <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <h2 className="mb-4 font-semibold">История общения</h2>
            <NotesTimeline notes={notes} clientId={client.id} mentionables={staffOptions(admins).filter((a) => a.id !== staff.user.id).map((a) => a.label)} />
          </section>
        </div>
      </div>
    </div>
  );
}
