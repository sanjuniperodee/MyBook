import { PageHeader } from "@/components/admin/PageHeader";
import { requireStaff } from "@/web/access";
import { staffLabel } from "@/shared/domain/staff";
import { TemplatesManager } from "./TemplatesManager";
import { crmRead } from "@/web/crm";

export const metadata = { title: "Шаблоны ответов" };

export default async function TemplatesPage() {
  const staff = await requireStaff("chats.view");
  const all = await crmRead("pages.templates", {});
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Шаблоны ответов">
        Быстрые ответы для чатов: в поле ввода наберите «/» и начало названия. Ваши шаблоны видны только вам и стоят первыми; общие шаблоны компании ведёт руководитель — их можно скопировать себе и поправить.
      </PageHeader>
      <TemplatesManager
        mine={all.filter((t) => t.own).map(({ id, title, text }) => ({ id, title, text }))}
        shared={all.filter((t) => !t.own).map(({ id, title, text }) => ({ id, title, text }))}
        manager={staffLabel(staff.user)}
      />
    </div>
  );
}
