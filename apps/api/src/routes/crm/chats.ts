/** Бот в диалоге из приложения CRM: «Почему так?» (ответы и молчание) и запуск/остановка бота. */
import { apiStaff, HttpError } from "@/server/api";
import { botTraceAction, startBotAction, stopBotAction } from "@/server/crm-actions/chats";
import { container } from "@/server/container";
import { botTraceItems, botTraceRows } from "@/modules/messaging/ui/crm-chat-view";
import { refusedResponse } from "@/modules/sales/ui/crm-forms";
import type { Handlers } from "../../app";

export const crmChatHandlers: Pick<Handlers, "crmChatBot" | "crmChatBotTrace" | "crmChatBotTraces"> = {
  async crmChatBotTrace({ req, input }) {
    await apiStaff(req, "chats.view");
    const r = await botTraceAction(input.chatId, input.messageId);
    if (!r.trace) return refusedResponse(r.error ?? "След хода не найден");
    return { rows: botTraceRows(r.trace) };
  },

  async crmChatBotTraces({ req, input }) {
    const staff = await apiStaff(req, "chats.view");
    const conv = await container().messaging.queries.conversation(input.chatId);
    if (!conv || !staff.context.canSee(conv.assigneeId)) throw new HttpError(404, "notFound");
    const list = await container().messaging.botTraces(conv.id, 15);
    return { items: botTraceItems(list) };
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
