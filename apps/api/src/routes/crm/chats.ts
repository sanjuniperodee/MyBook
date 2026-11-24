/** Бот в диалоге из приложения CRM: те же действия, что кнопки чата на сайте (права chats.send, «только свои», журнал). */
import { apiStaff } from "@/server/api";
import { startBotAction, stopBotAction } from "@/app/admin/chats/actions";
import type { Handlers } from "../../app";

export const crmChatHandlers: Pick<Handlers, "crmChatBot"> = {
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
