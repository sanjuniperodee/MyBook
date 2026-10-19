/**
 * Права сотрудников CRM — общий словарь: права проверяют роли Access, уведомляют «всем с правом» Workspace, а отчёты
 * решают, что показать. Файл без зависимостей: годится и серверу (проверки), и интерфейсу (редактор ролей, скрытие
 * кнопок). Проверка на сервере обязательна — скрытая кнопка не защита.
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
    label: "Цены",
    items: [["prices.discount_unlimited", "Продавать ниже прайса без лимита скидки: счёт, бюджет и тариф договорённости, новый клиент"]],
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
      ["clients.create", "Заводить клиентов и выдавать им доступ (логин и пароль)"],
      ["clients.contacts", "Видеть телефоны и e-mail полностью"],
      ["clients.reveal", "Открывать номер своего клиента по кнопке (каждое открытие — в журнале)"],
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
      ["promo.give", "Давать клиенту персональную скидку из чата (в пределах лимита)"],
      ["gifts.manage", "Подарочные сертификаты"],
      ["reviews.manage", "Отзывы клиентов: проверка и показ на сайте"],
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
