/**
 * Правила живого обновления CRM без браузерных API — их проверяют тесты: какой звук сыграть на свежие уведомления
 * и как склеивать частые события (сообщение, статусы доставки, уведомление) в редкие обновления экрана.
 */

export type LiveSound = "reminder" | "message" | null;

export interface SoundContext {
  /** Звук выключен на этом устройстве. */
  muted: boolean;
  /** Вкладка видна и в фокусе. */
  focused: boolean;
  /** Диалог, открытый сейчас на странице чатов (?c=…); null — другая страница или диалог не выбран. */
  openConversation: string | null;
}

/** Диалог из ссылки уведомления (/admin/chats?c=<uuid>). */
export function conversationOfLink(link: string | null | undefined): string | null {
  const m = link?.match(/^\/admin\/chats\?(?:.*&)?c=([0-9a-f-]{36})(?:&|$)/);
  return m ? m[1] : null;
}

/**
 * Звук на свежие уведомления: напоминание о задаче — тройной сигнал; сообщение клиента, упоминание, клиенту не ответили
 * вовремя (sla), новая заявка (deal) и пропущенный звонок (call) — короткий (tasks-22). Сообщение в диалоге, который
 * сотрудник читает прямо сейчас, — без звука: оно и так на экране.
 */
const AUDIBLE = new Set(["message", "mention", "sla", "deal", "call"]);

export function soundFor(fresh: readonly { kind: string; link: string | null }[], ctx: SoundContext): LiveSound {
  if (ctx.muted) return null;
  if (fresh.some((n) => n.kind === "reminder")) return "reminder";
  const audible = fresh.filter((n) => AUDIBLE.has(n.kind));
  if (!audible.length) return null;
  const onScreen = (n: { kind: string; link: string | null }) => ctx.focused && n.kind === "message" && !!ctx.openConversation && conversationOfLink(n.link) === ctx.openConversation;
  return audible.every(onScreen) ? null : "message";
}

/**
 * Склейка частых вызовов: первый выполняется сразу, а всё, что пришло во время выполнения и паузы gapMs, — одним
 * вызовом после. Так серия «сообщение + статус + уведомление» даёт одно-два обновления, и последнее событие не теряется.
 */
export function coalesce(run: () => unknown, gapMs: number, now: () => number = Date.now, later: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms)) {
  let busy = false;
  let again = false;
  let scheduled = false;
  let last = Number.NEGATIVE_INFINITY;
  const go = async (): Promise<void> => {
    if (busy) {
      again = true;
      return;
    }
    if (scheduled) return;
    const wait = last + gapMs - now();
    if (wait > 0) {
      scheduled = true;
      later(() => {
        scheduled = false;
        void go();
      }, wait);
      return;
    }
    busy = true;
    last = now();
    try {
      await run();
    } catch {
      // сеть моргнула — следующее событие или опрос повторит
    } finally {
      busy = false;
      if (again) {
        again = false;
        void go();
      }
    }
  };
  return go;
}

/** Открыт ли живой канал событий (SSE): пока да, опрос страниц — только редкая страховка. */
let liveConnected = false;
export const liveChannel = {
  connected: () => liveConnected,
  set: (v: boolean) => void (liveConnected = v),
};
