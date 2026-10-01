/** Описание триггеров и действий автоматизаций — общее для сервера и редактора. */
export const automationTriggers = {
  "deal.created": { label: "Создана сделка", hint: "Новая заявка из чата, звонка, сайта или вручную" },
  "deal.stage_changed": { label: "Сделка перешла на этап", hint: "Условие: этап" },
  "message.incoming": { label: "Входящее сообщение", hint: "Первое сообщение клиента за день в диалоге" },
  "message.unanswered": { label: "Клиенту не ответили", hint: "Условие: сколько минут без ответа" },
  "call.missed": { label: "Пропущенный звонок", hint: "Входящий звонок, на который никто не ответил" },
  "order.created": { label: "Оформлен заказ", hint: "Клиент оформил заказ на сайте" },
  "order.paid": { label: "Заказ оплачен", hint: "" },
  "client.inactive": { label: "Клиент забросил книгу", hint: "Условие: сколько дней не заходит (есть открытая сделка и черновик)" },
  "occasion.anniversary": { label: "Приближается годовщина повода", hint: "За сколько дней до даты, к которой дарили книгу год назад" },
} as const;

export type AutomationTrigger = keyof typeof automationTriggers;
export const isTrigger = (t: string): t is AutomationTrigger => Object.prototype.hasOwnProperty.call(automationTriggers, t);

export const automationActions = {
  create_task: "Поставить задачу",
  send_message: "Отправить сообщение клиенту",
  assign: "Назначить ответственного",
  move_stage: "Перевести сделку на этап",
  notify: "Уведомить сотрудников",
  create_deal: "Создать сделку (если нет открытой)",
} as const;

/** Когда правило работает: всегда, только в рабочее время или только вне его. */
export const automationHours = { any: "в любое время", work: "только в рабочее время", off: "только вне рабочего времени" } as const;

export type AutomationActionType = keyof typeof automationActions;

/** Переменные в текстах автоматизаций и шаблонов. */
export const templateVars = ["{имя}", "{заказ}", "{ссылка}", "{менеджер}", "{повод}", "{дата}", "{Название своего поля}"] as const;

export function fillTemplate(
  text: string,
  vars: { name?: string | null; order?: string | number | null; link?: string | null; manager?: string | null; occasion?: string | null; date?: string | null; fields?: Record<string, string> },
) {
  // Свои поля сделки: {Для кого}, {Дата события}… (незаполненные — пустая строка).
  let out = text;
  for (const [label, value] of Object.entries(vars.fields ?? {})) out = out.replaceAll(`{${label}}`, value);
  return out
    .replaceAll("{имя}", (vars.name ?? "").trim() || "")
    .replaceAll("{заказ}", vars.order != null ? String(vars.order) : "")
    .replaceAll("{ссылка}", vars.link ?? "")
    .replaceAll("{менеджер}", vars.manager ?? "")
    .replaceAll("{повод}", vars.occasion ?? "")
    .replaceAll("{дата}", vars.date ?? "")
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/,([!?.])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
