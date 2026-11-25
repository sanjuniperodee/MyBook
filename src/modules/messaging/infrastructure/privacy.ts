import "server-only";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { crmConversations, crmMessages } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { deletePrefix } from "@/shared/infrastructure/storage";
import { gowaMediaPath } from "../domain/gowa";

/**
 * Переписка клиента в CRM (удаление аккаунта): наша копия — диалоги, сообщения (каскадом), вложения, аватарки —
 * удаляется целиком. Сам чат в WhatsApp у клиента и у магазина не трогаем: это не наша копия.
 *
 * gowaMediaDir — каталог вложений шлюза (statics/media); файл удаляется, только если на него не ссылается
 * сообщение другого диалога (склейка дублей делает одинаковые вложения одним файлом).
 */
export const messagingPrivacy = {
  async forgetClient(clientId: string, gowaMediaDir: string) {
    const db = executor();
    const convs = await db.select({ id: crmConversations.id }).from(crmConversations).where(eq(crmConversations.clientId, clientId));
    const ids = convs.map((c) => c.id);
    if (!ids.length) return;
    const media = await db
      .selectDistinct({ url: crmMessages.mediaUrl })
      .from(crmMessages)
      .where(and(inArray(crmMessages.conversationId, ids), isNotNull(crmMessages.mediaUrl)));
    const gowaUrls = media.map((m) => m.url!).filter((u) => gowaMediaPath(u));
    const shared = gowaUrls.length
      ? new Set(
          (
            await db
              .selectDistinct({ url: crmMessages.mediaUrl })
              .from(crmMessages)
              .where(and(inArray(crmMessages.mediaUrl, gowaUrls), notInArray(crmMessages.conversationId, ids)))
          ).map((r) => r.url),
        )
      : new Set<string | null>();

    await db.delete(crmConversations).where(inArray(crmConversations.id, ids));

    const root = path.resolve(gowaMediaDir);
    for (const url of gowaUrls) {
      if (shared.has(url)) continue;
      // gowaMediaPath проверяет сегменты пути: выйти из каталога вложений нельзя.
      const file = path.resolve(root, gowaMediaPath(url)!.split("/").slice(2).join("/"));
      if (file.startsWith(root + path.sep)) await unlink(file).catch(() => {});
    }
    for (const id of ids) {
      await deletePrefix(`chat-media/${id}`);
      await deletePrefix(`chat-avatars/${id}`);
    }
  },
};
