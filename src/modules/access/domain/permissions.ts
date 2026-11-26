import { allPermissions, type Permission, type RoleScope } from "@/shared/domain/permissions";

/** Системные роли: создаются миграцией, права можно менять, удалить нельзя (кроме «Руководителя» — он всегда со всеми правами). */
export const systemRoles: Record<string, { name: string; scope: RoleScope; permissions: Permission[] }> = {
  owner: { name: "Руководитель", scope: "all", permissions: allPermissions },
  manager: {
    name: "Менеджер продаж",
    scope: "own",
        // Полных номеров нет: писать и звонить — через CRM, открыть номер своего клиента — кнопкой с записью в журнал.
    // Записи разговоров слушает руководитель (право можно выдать роли в «Команде»).
    permissions: ["deals.view", "deals.edit", "chats.view", "chats.send", "calls.view", "calls.make", "clients.view", "clients.edit", "clients.create", "clients.reveal", "orders.view", "promo.give", "catalog.manage"],
  },
  production: {
    name: "Производство",
    scope: "all",
    permissions: ["orders.view", "orders.edit", "orders.files", "clients.view", "clients.contacts", "gifts.manage"],
  },
  support: {
    name: "Поддержка",
    scope: "all",
    permissions: ["deals.view", "chats.view", "chats.send", "calls.view", "calls.make", "clients.view", "clients.contacts", "orders.view", "reviews.manage"],
  },
};

export { maskEmail, maskPhone } from "@/shared/domain/staff";
