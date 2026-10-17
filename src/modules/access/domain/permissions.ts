import { allPermissions, type Permission, type RoleScope } from "@/shared/domain/permissions";

/** Системные роли: создаются миграцией, права можно менять, удалить нельзя (кроме «Руководителя» — он всегда со всеми правами). */
export const systemRoles: Record<string, { name: string; scope: RoleScope; permissions: Permission[] }> = {
  owner: { name: "Руководитель", scope: "all", permissions: allPermissions },
  manager: {
    name: "Менеджер продаж",
    scope: "own",
        // Полных номеров нет: писать и звонить — через CRM, открыть номер своего клиента — кнопкой с записью в журнал.
    permissions: ["deals.view", "deals.edit", "chats.view", "chats.send", "calls.view", "calls.make", "calls.recordings", "clients.view", "clients.edit", "clients.create", "clients.reveal", "orders.view", "promo.give"],
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

/** Скрывает середину телефона: +7 701 ••• •• 78. */
export function maskPhone(phone: string | null | undefined) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "•••";
  return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ••• •• ${digits.slice(-2)}`;
}

/** Скрывает e-mail: al•••@gmail.com. */
export function maskEmail(email: string | null | undefined) {
  if (!email) return "";
  const [name, domain] = email.split("@");
  if (!domain) return "•••";
  return `${name.slice(0, 2)}•••@${domain}`;
}
