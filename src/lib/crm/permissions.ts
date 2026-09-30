/**
 * Права сотрудников CRM. Модуль без зависимостей: используется и сервером (проверки), и интерфейсом
 * (редактор ролей, скрытие кнопок). Проверка на сервере обязательна — скрытая кнопка не защита.
 */
export const permissionGroups = [
  {
    label: "Сделки",
    items: [
      ["deals.view", "Видеть сделки и воронку"],
      ["deals.edit", "Создавать сделки, менять этап и ответственного"],
      ["deals.delete", "Удалять сделки"],
    ],
  },
  {
    label: "Чаты",
    items: [
      ["chats.view", "Видеть переписку"],
      ["chats.send", "Отвечать клиентам"],
    ],
  },
  {
    label: "Телефония",
    items: [
      ["calls.view", "Журнал звонков"],
      ["calls.make", "Звонить из CRM"],
      ["calls.recordings", "Слушать записи разговоров"],
    ],
  },
  {
    label: "Клиенты",
    items: [
      ["clients.view", "Видеть клиентов и их книги"],
      ["clients.edit", "Менять клиентов: теги, ответственного, заметки"],
      ["clients.contacts", "Видеть телефоны и e-mail полностью"],
      ["clients.export", "Выгружать базу в CSV"],
    ],
  },
  {
    label: "Заказы и производство",
    items: [
      ["orders.view", "Видеть заказы"],
      ["orders.edit", "Менять статусы, контакты и доставку"],
      ["orders.files", "Скачивать файлы для типографии"],
    ],
  },
  {
    label: "Задачи",
    items: [["tasks.all", "Видеть и закрывать задачи всех сотрудников"]],
  },
  {
    label: "Маркетинг",
    items: [
      ["promo.manage", "Промокоды"],
      ["gifts.manage", "Подарочные сертификаты"],
    ],
  },
  {
    label: "Аналитика",
    items: [["analytics.view", "Дашборд и отчёты"]],
  },
  {
    label: "Администрирование",
    items: [
      ["team.manage", "Сотрудники и роли"],
      ["settings.manage", "Интеграции, воронка, шаблоны, автоматизации"],
      ["audit.view", "Журнал действий"],
    ],
  },
] as const;

export type Permission = (typeof permissionGroups)[number]["items"][number][0];
export const allPermissions = permissionGroups.flatMap((g) => g.items.map(([p]) => p)) as Permission[];

export function isPermission(p: string): p is Permission {
  return (allPermissions as string[]).includes(p);
}

export type RoleScope = "all" | "own";

/** Системные роли: создаются миграцией, права можно менять, удалить нельзя (кроме «Руководителя» — он всегда со всеми правами). */
export const systemRoles: Record<string, { name: string; scope: RoleScope; permissions: Permission[] }> = {
  owner: { name: "Руководитель", scope: "all", permissions: allPermissions },
  manager: {
    name: "Менеджер продаж",
    scope: "own",
    permissions: ["deals.view", "deals.edit", "chats.view", "chats.send", "calls.view", "calls.make", "calls.recordings", "clients.view", "clients.edit", "clients.contacts", "orders.view"],
  },
  production: {
    name: "Производство",
    scope: "all",
    permissions: ["orders.view", "orders.edit", "orders.files", "clients.view", "clients.contacts", "gifts.manage"],
  },
  support: {
    name: "Поддержка",
    scope: "all",
    permissions: ["deals.view", "chats.view", "chats.send", "calls.view", "calls.make", "clients.view", "clients.contacts", "orders.view"],
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
