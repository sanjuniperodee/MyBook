/**
 * Одно уведомление на объект вместо стопки (24.11: у админов копились десятки тысяч непрочитанных). Пока уведомление о
 * чате, сделке или задаче не прочитано, повтор того же события его обновляет — текст, счётчик, время, — а не добавляет
 * новое, и телефон второй раз не звенит. Прочитали — следующее событие снова приходит отдельным уведомлением с push.
 *
 * SLA по заявке сворачивается по объекту (ссылке) целиком. Остальное — только при том же заголовке: две разные задачи
 * одной сделки или «клиент написал» и «заявку взял(а)» по одному чату остаются разными уведомлениями. Входящие клиента
 * (заголовок «Имя · канал») — одно на чат: «3 новых сообщения · последний текст».
 */
const BY_LINK = new Set(["sla"]);

export interface OpenNotification {
  kind: string;
  title: string;
  link: string | null;
}

/** Свернуть ли новое уведомление в непрочитанное prev того же сотрудника. */
export function sameThread(prev: OpenNotification, next: OpenNotification): boolean {
  if (!next.link || prev.link !== next.link || prev.kind !== next.kind) return false;
  return BY_LINK.has(next.kind) || prev.title === next.title;
}

const plural = (n: number, one: string, few: string, many: string) => {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
};

/** Текст свёрнутого уведомления: у входящих клиента — сколько новых и последнее; у прочих — последний текст как есть. */
export function threadBody(incoming: boolean, count: number, body: string): string {
  if (!incoming || count < 2) return body;
  return `${count} ${plural(count, "новое сообщение", "новых сообщения", "новых сообщений")} · ${body}`;
}
