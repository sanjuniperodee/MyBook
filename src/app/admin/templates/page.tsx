import { PageHeader } from "@/components/admin/PageHeader";
import { container } from "@/server/container";
import { requireStaff } from "@/server/access";
import { staffLabel } from "@/shared/domain/staff";
import { TemplatesManager } from "./TemplatesManager";

export const metadata = { title: "Шаблоны ответов" };

export default async function TemplatesPage() {
  const staff = await requireStaff("chats.view");
  const all = await container().messaging.view.templates(staff.user.id);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Шаблоны ответов">
        Ваши быстрые ответы для чатов: они видны только вам и стоят первыми в списке «Шаблоны» у поля ввода. Общие шаблоны компании ведёт руководитель — их можно скопировать себе и поправить.
      </PageHeader>
      <TemplatesManager
        mine={all.filter((t) => t.own).map(({ id, title, text }) => ({ id, title, text }))}
        shared={all.filter((t) => !t.own).map(({ id, title, text }) => ({ id, title, text }))}
        manager={staffLabel(staff.user)}
      />
    </div>
  );
}
