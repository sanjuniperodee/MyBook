import { PageHeader } from "@/components/admin/PageHeader";
import { can, requireStaff } from "@/web/access";
import { FILE_MAX_BYTES, FILES_MAX } from "@/modules/support/domain";
import type { ChatHit } from "../actions";
import { SupportForm } from "./SupportForm";
import { crmRead } from "@/web/crm";

export const metadata = { title: "Новое обращение" };

const param = (v: string | string[] | undefined, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * Новое обращение — его оставляет сотрудник CRM (руководитель, менеджер), клиентам форма недоступна. Чат клиента и его
 * сообщения выбираются тут же; ?c=<диалог> — открыть с этим чатом (из переписки), ?client=, ?place= — заполнить заранее.
 */
export default async function NewTicketPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const canPickChat = can(staff, "chats.view");
  const c = param(sp.c, 40);
  const conv = canPickChat && /^[0-9a-f-]{36}$/i.test(c) ? await crmRead("pages.supportChat", { id: c }) : null;
  const chat: ChatHit | null = conv ? { ...conv, last: "", lastAt: null } : null;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader back={{ href: "/admin/support", label: "Обращения" }} title="Новое обращение">
        Что не работает у клиента или что нужно изменить. Выберите чат клиента и отметьте его сообщения, добавьте своё пояснение, голосовое или скриншоты. Когда исправят — придёт сообщение в WhatsApp.
      </PageHeader>
      <div className="panel max-w-3xl p-4 sm:p-6">
        <SupportForm
          filesMax={FILES_MAX}
          fileMaxMb={FILE_MAX_BYTES / 1024 / 1024}
          canPickChat={canPickChat}
          initial={{
            chat,
            notifyPhone: staff.user.phone || "",
            clientPhone: param(sp.client, 40) || (chat?.channel === "whatsapp" ? chat.chatId : ""),
            place: param(sp.place, 1000),
          }}
        />
      </div>
    </div>
  );
}
