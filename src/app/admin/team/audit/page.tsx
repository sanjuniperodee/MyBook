import { container } from "@/server/container";
import Link from "next/link";
import { requireStaff } from "@/server/access";
import { staffLabel } from "@/shared/domain/staff";
import { formatDate } from "@/lib/dates";
import { History } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

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
  "deal.assign": "Передал сделку",
  "chat.assign": "Передал чат",
  "chat.close": "Закрыл чат",
  "chat.reopen": "Открыл чат снова",
  "chat.bot_stop": "Остановил бота в чате",
  "chat.bot_start": "Запустил бота в чате",
  "deal.spam_request": "Предложил отметить заявку спамом",
  "deal.reject_request": "Предложил отклонить заявку",
  "deal.request_declined": "Отказал в отклонении заявки",
  "client.contact_reveal": "Открыл номер клиента",
  "client.no_marketing": "Изменил «не писать первым» у клиента",
  "deal.no_marketing": "Изменил «не писать первым» в сделке",
  "chat.sensitive": "Отправил номер или реквизиты в чат",
  "chat.sensitive_echo": "С телефона компании ушли номер или реквизиты",
  "deal.plan": "Сменил тариф договорённости",
  "deal.discount": "Назначил цену ниже прайса",
  "payment.add": "Принял оплату с чеком",
  "receipt.add": "Приложил чек",
  "email.send": "Отправил письмо клиенту",
  "order.payment": "Принял оплату по заказу",
  "order.postpay": "Отправил заказ в печать с постоплатой",
  "order.payment_review": "Проверил оплату по заказу",
  "receipt.view": "Открыл чек",
  "gift.paid": "Подтвердил оплату сертификата по чеку",
  "gift.resend": "Отправил сертификат получателю",
  "gift.cancel": "Отменил сертификат",
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ actor?: string; entity?: string }> }) {
  await requireStaff("team.manage", "audit.view");
  const sp = await searchParams;
  const rows = await container().access.queries.auditLog({ actorId: sp.actor && /^[0-9a-f-]{36}$/.test(sp.actor) ? sp.actor : undefined, entity: sp.entity ? sp.entity.slice(0, 30) : undefined });
  return (
    <div className="panel lg:overflow-x-auto">
      {sp.actor || sp.entity ? (
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2 text-sm sm:px-5">
          <span className="text-ink-soft">Показаны записи по фильтру</span>
          <Link href="/admin/team/audit" className="btn btn-ghost btn-sm">
            Сбросить фильтр
          </Link>
        </div>
      ) : null}
      <ul className="divide-y divide-line lg:hidden" data-testid="audit-cards">
        {rows.map(({ a, actor }) => (
          <li key={a.id} className="px-4 py-3">
            <Link href={`/admin/team/audit?entity=${a.entity}`} className="text-[15px] font-medium">
              {actions[a.action] ?? a.action}
            </Link>
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
              {a.actorId ? (
                <Link href={`/admin/team/audit?actor=${a.actorId}`}>{staffLabel(actor?.email ? { name: actor.name ?? "", email: actor.email } : null)}</Link>
              ) : (
                <span>система</span>
              )}
              <span>{formatDate(a.createdAt, true)}</span>
              {a.ip ? <span>{a.ip}</span> : null}
            </div>
            {a.details ? <div className="mt-1 line-clamp-2 font-mono text-[11px] break-all text-muted">{JSON.stringify(a.details)}</div> : null}
          </li>
        ))}
      </ul>
      <div className="hidden lg:block">
      <table className="table min-w-[760px] [&_td:first-child]:pl-5 [&_th:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:last-child]:pr-5">
        <thead>
          <tr>
            <th>Когда</th>
            <th>Кто</th>
            <th>Действие</th>
            <th>Подробности</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ a, actor }) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap text-muted">{formatDate(a.createdAt, true)}</td>
              <td>
                {a.actorId ? (
                  <Link href={`/admin/team/audit?actor=${a.actorId}`} className="hover:text-wine">
                    {staffLabel(actor?.email ? { name: actor.name ?? "", email: actor.email } : null)}
                  </Link>
                ) : (
                  <span className="text-muted">система</span>
                )}
              </td>
              <td>
                <Link href={`/admin/team/audit?entity=${a.entity}`} className="hover:text-wine">
                  {actions[a.action] ?? a.action}
                </Link>
              </td>
              <td className="max-w-md truncate font-mono text-xs text-muted" title={a.details ? JSON.stringify(a.details) : ""}>
                {a.details ? JSON.stringify(a.details) : "—"}
              </td>
              <td className="text-xs text-muted">{a.ip ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {rows.length === 0 ? (
        <EmptyState compact icon={History} title="Записей пока нет">
          Смена ролей, выгрузки, удаления и другие важные действия сотрудников появятся здесь.
        </EmptyState>
      ) : null}
    </div>
  );
}
