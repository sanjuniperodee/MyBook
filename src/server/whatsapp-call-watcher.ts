import "server-only";
import { GOWA_DEVICE } from "@/modules/messaging";
import { GOWA_CALL_ID } from "@/modules/messaging/domain/gowa";
import { container } from "@/server/container";
import { whatsappSettings } from "@/server/integration-settings";

/**
 * Раз в 15 с: подключиться к шлюзу, если звонки только что включили (или сменили адрес шлюза), и закрыть зависшие звонки —
 * чаще минутного прохода планировщика, чтобы собеседник не слушал тишину. Настройки читаются из кэша, к шлюзу не ходим.
 */
const CHECK_MS = 15_000;
const MAX_BACKOFF_MS = 30_000;
const CONNECT_TIMEOUT_MS = 10_000;

/** Сообщение служебного сокета шлюза: { code, message, result }. Конец любого звонка — CALL_ENDED с result.call_id. */
export function endedCallId(data: unknown): string | null {
  try {
    const m = JSON.parse(String(data)) as { code?: unknown; result?: { call_id?: unknown } | null };
    const id = m.code === "CALL_ENDED" && typeof m.result?.call_id === "string" ? m.result.call_id : "";
    return GOWA_CALL_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Конец звонков WhatsApp — сразу, а не по таймауту. Вебхуком шлюз сообщает только о входящем, а о конце любого звонка
 * (положил трубку собеседник, сотрудник, WhatsApp сбросил) — в служебный сокет /ws своей панели. Сервер держит этот сокет
 * открытым, пока включены «Звонки WhatsApp», и закрывает звонок в журнале; пока он открыт, раз в 15 с закрывает и зависшие
 * звонки (WhatsappCallsService.sweep: вкладка пропала посреди разговора). Сокет недоступен — то же делает минутный проход
 * планировщика. Несколько экземпляров сайта (выкатка) — не беда: закрытие идемпотентно.
 */
export function startWhatsappCallWatcher() {
  let socket: WebSocket | null = null;
  let key = "";
  let attempt = 0;
  let retryAt = 0;

  const close = () => {
    const s = socket;
    socket = null;
    key = "";
    s?.close();
  };

  const check = async () => {
    try {
      if (!(await container().telephony.whatsapp.enabled())) return close();
      const { baseUrl } = await whatsappSettings.gowa();
      const auth = await container().messaging.gowa.authorization();
      const next = `${baseUrl}|${auth ?? ""}`;
      if (socket && key === next) return;
      close();
      if (Date.now() < retryAt) return;
      const url = `${baseUrl.replace(/^http/, "ws").replace(/\/+$/, "")}/ws?device_id=${GOWA_DEVICE}`;
      // Заголовки рукопожатия — расширение WebSocket в Node.js (undici): браузерный конструктор их не принимает.
      const ws = new (WebSocket as unknown as new (url: string, init: { headers: Record<string, string> }) => WebSocket)(url, { headers: auth ? { Authorization: auth } : {} });
      socket = ws;
      key = next;
      // Шлюз перезапускается или недоступен — переподключаемся с нарастающей паузой.
      const lost = () => {
        if (socket !== ws) return;
        clearTimeout(connecting);
        socket = null;
        key = "";
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          // уже закрыт
        }
        retryAt = Date.now() + Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++);
        setTimeout(() => void check(), retryAt - Date.now() + 50).unref?.();
      };
      // Подключение к ещё не поднявшемуся шлюзу WebSocket Node.js может держать в «подключаюсь» бесконечно — без ошибки
      // и без закрытия; тогда сокет считался бы живым и CRM больше не переподключалась. Не открылся за 10 с — заново.
      const connecting = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) lost();
      }, CONNECT_TIMEOUT_MS);
      connecting.unref?.();
      ws.onopen = () => {
        clearTimeout(connecting);
        attempt = 0;
      };
      ws.onmessage = (e) => {
        const id = endedCallId(e.data);
        if (id) void container().telephony.whatsapp.endedByGateway(id).catch((err) => console.error("[whatsapp calls] end", err));
      };
      ws.onerror = () => {};
      ws.onclose = lost;
    } catch (err) {
      console.error("[whatsapp calls] watcher", err);
    }
  };

  setTimeout(() => void check(), 5_000).unref?.();
  setInterval(() => {
    void check();
    if (socket) void container().telephony.whatsapp.sweep().catch((err) => console.error("[whatsapp calls] sweep", err));
  }, CHECK_MS).unref?.();
}
