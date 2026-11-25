/** Бот в диалоге из приложения CRM: «Почему так?» (ответы и молчание) и запуск/остановка бота. */
import { apiStaff, HttpError } from "@/server/api";
import { botTraceAction, startBotAction, stopBotAction } from "@/app/admin/chats/actions";
import { container } from "@/server/container";
import { traceRows } from "@/modules/messaging/ui/botTrace";
import { refused } from "./common";
import type { Handlers } from "../../app";

const toRows = (trace: Parameters<typeof traceRows>[0]) => traceRows(trace).map((x) => ({ label: x.label, lines: x.lines, warn: !!x.warn }));

export const crmChatHandlers: Pick<Handlers, "crmChatBot" | "crmChatBotTrace" | "crmChatBotTraces"> = {
  async crmChatBotTrace({ req, input }) {
    await apiStaff(req, "chats.view");
    const r = await botTraceAction(input.chatId, input.messageId);
    if (!r.trace) return refused(r.error ?? "След хода не найден");
    return { rows: toRows(r.trace) };
  },

  async crmChatBotTraces({ req, input }) {
    const staff = await apiStaff(req, "chats.view");
    const conv = await container().messaging.queries.conversation(input.chatId);
    if (!conv || !staff.context.canSee(conv.assigneeId)) throw new HttpError(404, "notFound");
    const list = await container().messaging.botTraces(conv.id, 15);
    return {
      items: list.map((item) => {
        const rows = toRows(item.trace);
        const head = rows.find((r) => r.label === "Модель решила") ?? rows.find((r) => r.label === "Итог хода") ?? rows[0];
        return {
          id: item.id,
          at: item.at.toISOString(),
          messageId: item.messageId,
          silent: item.messageId === null,
          summary: head?.lines[0] ?? "Ход бота",
          rows,
        };
      }),
    };
  },

  async crmChatBot({ req, input }) {
    await apiStaff(req, "chats.view", "chats.send");
    if (input.body.run) {
      await startBotAction(input.chatId);
      return { ok: true, message: "Бот запущен" };
    }
    await stopBotAction(input.chatId);
    return { ok: true, message: "Бот остановлен" };
  },
};
