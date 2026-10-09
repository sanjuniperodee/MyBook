import { container } from "@/server/container";
import Link from "next/link";
import { requireStaff } from "@/server/access";
import { adminLabel } from "@/modules/access/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Журнал действий" };

/** Человекочитаемые названия действий журнала. */
const actions: Record<string, string> = {
  "staff.create": "Добавил сотрудника",
  "staff.grant": "Выдал доступ к CRM",
  "staff.role": "Сменил роль",
  "staff.extension": "Сменил внутренний номер",
  "staff.disable": "Отключил сотрудника",
  "staff.enable": "Включил сотрудника",
  "staff.revoke": "Убрал из команды",
  "password.reset": "Сбросил пароль",
  "role.create": "Создал роль",
  "role.update": "Изменил роль",
  "role.delete": "Удалил роль",
  "role.change": "Сменил доступ",
  "promo.create": "Создал промокод",
  "promo.enable": "Включил промокод",
  "promo.disable": "Выключил промокод",
  "note.delete": "Удалил заметку",
  "client.tags": "Изменил теги клиента",
  "client.manager": "Назначил ответственного клиенту",
  "order.bulk_status": "Массово сменил статус заказов",
  export: "Выгрузил данные",
  "deal.delete": "Удалил сделку",
  "settings.update": "Изменил настройки",
  "automation.save": "Изменил автоматизацию",
  "automation.delete": "Удалил автоматизацию",
  "call.recording": "Прослушал запись звонка",
  "deal.merge": "Объединил сделки",
  "link.create": "Создал рекламную ссылку",
  "plan.update": "Изменил план продаж",
  "deal.bulk_delete": "Массово удалил сделки",
  "deal.bulk_assign": "Массово назначил ответственного",
  "link.archive": "Убрал ссылку в архив",
  "link.restore": "Вернул ссылку из архива",
  "deal.reject": "Отклонил заявку",
  "deal.spam": "Отметил заявку как спам",
  "promo.personal": "Дал персональную скидку",
  "client.phones": "Изменил доп. телефоны клиента",
  "staff.shift_on": "Вышел на смену",
  "staff.shift_off": "Ушёл со смены",
  "review.publish": "Опубликовал отзыв",
  "review.hide": "Скрыл отзыв",
  "review.feature": "Закрепил отзыв на главной",
  "review.unfeature": "Открепил отзыв",
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ actor?: string; entity?: string }> }) {
  await requireStaff("team.manage", "audit.view");
  const sp = await searchParams;
  const rows = await container().access.queries.auditLog({ actorId: sp.actor && /^[0-9a-f-]{36}$/.test(sp.actor) ? sp.actor : undefined, entity: sp.entity ? sp.entity.slice(0, 30) : undefined });
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      {sp.actor || sp.entity ? (
        <div className="border-b border-line px-4 py-2 text-sm">
          Фильтр включён · <Link href="/admin/team/audit" className="text-wine hover:underline">сбросить</Link>
        </div>
      ) : null}
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b border-line text-left text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Когда</th>
            <th className="px-4 py-3 font-medium">Кто</th>
            <th className="px-4 py-3 font-medium">Действие</th>
            <th className="px-4 py-3 font-medium">Подробности</th>
            <th className="px-4 py-3 font-medium">IP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(({ a, actor }) => (
            <tr key={a.id}>
              <td className="px-4 py-2.5 whitespace-nowrap text-muted">{formatDate(a.createdAt, true)}</td>
              <td className="px-4 py-2.5">
                {a.actorId ? (
                  <Link href={`/admin/team/audit?actor=${a.actorId}`} className="hover:text-wine">
                    {adminLabel(actor?.email ? { name: actor.name ?? "", email: actor.email } : null)}
                  </Link>
                ) : (
                  <span className="text-muted">система</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <Link href={`/admin/team/audit?entity=${a.entity}`} className="hover:text-wine">
                  {actions[a.action] ?? a.action}
                </Link>
              </td>
              <td className="max-w-md truncate px-4 py-2.5 font-mono text-xs text-muted" title={a.details ? JSON.stringify(a.details) : ""}>
                {a.details ? JSON.stringify(a.details) : "—"}
              </td>
              <td className="px-4 py-2.5 text-xs text-muted">{a.ip ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="p-6 text-center text-sm text-muted">Записей пока нет.</p> : null}
    </div>
  );
}
