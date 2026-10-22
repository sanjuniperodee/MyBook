import "server-only";
import { GowaError } from "@/modules/messaging";
import { TelephonyError, type WhatsappCallGateway } from "@/modules/telephony";

/** Ошибка шлюза при звонке — текстом для сотрудника. Ответы шлюза по-английски, поэтому частые случаи переводим. */
export function whatsappCallError(err: unknown): TelephonyError {
  if (!GowaError.is(err)) throw err;
  const raw = err.message.replace(/^WhatsApp:\s*/, "");
  if (err.code === "UNREACHABLE") return new TelephonyError("provider", "Шлюз WhatsApp недоступен — звонок не начался");
  if (err.code === "UNAUTHORIZED") return new TelephonyError("provider", err.message);
  if (err.code === "INVALID_WA_CLI" || /not logged in|not connected|invalid or empty/i.test(raw)) return new TelephonyError("provider", "Номер WhatsApp не привязан к шлюзу — привяжите его в «Интеграциях»");
  if ((err.status === 404 && !err.code) || /beta voice calls are (disabled|not available)/i.test(raw))
    return new TelephonyError("notConfigured", "Шлюз WhatsApp не умеет звонки — нужна сборка шлюза со звонками (см. «Интеграции»)");
  if (/call not found|not found/i.test(raw)) return new TelephonyError("notFound", "Звонок уже завершён");
  if (/not on whatsapp|not registered|no such user|invalid jid/i.test(raw)) return new TelephonyError("provider", "Этого номера нет в WhatsApp");
  return new TelephonyError("provider", `Звонок WhatsApp не удался: ${raw}`.slice(0, 300));
}

const mapped =
  <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
  async (...args: A): Promise<R> => {
    try {
      return await fn(...args);
    } catch (err) {
      throw whatsappCallError(err);
    }
  };

interface GowaCalls {
  callStart(phone: string): Promise<string>;
  callAnswer(callId: string): Promise<void>;
  callHangup(callId: string): Promise<void>;
}

/** Порт звонков контекста «Телефония» поверх клиента своего шлюза WhatsApp. */
export const whatsappCallGateway = (gowa: () => GowaCalls, enabled: () => Promise<boolean>): WhatsappCallGateway => ({
  enabled,
  start: mapped((phone: string) => gowa().callStart(phone)),
  answer: mapped((callId: string) => gowa().callAnswer(callId)),
  hangup: mapped((callId: string) => gowa().callHangup(callId)),
});
