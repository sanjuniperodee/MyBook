import { apiStaff } from "@/lib/api";
import { subscribe, type LiveEvent } from "@/lib/crm/realtime";

export const dynamic = "force-dynamic";

/** SSE-поток событий CRM: браузер обновляет бейджи, колокольчик и открытый чат сразу, без частого опроса. */
export async function GET(req: Request) {
  let staffId: string;
  try {
    staffId = (await apiStaff(req)).user.id;
  } catch {
    return new Response("forbidden", { status: 403 });
  }
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send("retry: 5000\n\n");
      const unsubscribe = await subscribe((e: LiveEvent) => {
        if (e.users && !e.users.includes(staffId)) return;
        send(`data: ${JSON.stringify({ type: e.type, conversationId: e.conversationId ?? null })}\n\n`);
      });
      // Пинг, чтобы прокси не закрывали «молчащее» соединение.
      const ping = setInterval(() => send(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
