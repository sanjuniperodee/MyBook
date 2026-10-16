import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { gowaMediaUrl } from "@/modules/messaging/domain/gowa";
import { ChatView } from "@/modules/messaging/infrastructure/chatView";
import { DrizzleMessageRepository } from "@/modules/messaging/infrastructure/persistence";

/**
 * Вложения WhatsApp в чате CRM (PostgreSQL): путь файла шлюза (в нём номер клиента) в браузер не уходит,
 * скачанный файл запоминается и переживает повторную загрузку истории.
 * Запуск: INTEGRATION=1 npx vitest run tests/chat-media.integration.test.ts (база из DATABASE_URL).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `cm${Date.now()}`;
const phone = `7701${String(Date.now()).slice(-7)}`;
const VOICE = `statics/media/${phone}/2026-10-14/3EB0C127D7BACC83D6A1.oga`;

run("messaging: вложения шлюза в чате (PostgreSQL)", () => {
  const ids: Record<string, string> = {};
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const repo = new DrizzleMessageRepository();
  // Для сообщений ChatView нужен только провайдер WhatsApp; остальные зависимости — шаблоны и отправка.
  const view = (provider: "gowa" | "wazzup") => new ChatView({ whatsappProvider: async () => provider } as unknown as ConstructorParameters<typeof ChatView>[0]);

  beforeAll(async () => {
    const [gowa] = await q<{ id: string }>(sql`insert into crm_conversations (channel, channel_id, chat_id, contact_name) values ('whatsapp', 'gowa', ${phone}, ${tag}) returning id`);
    const [wz] = await q<{ id: string }>(sql`insert into crm_conversations (channel, channel_id, chat_id, contact_name) values ('whatsapp', 'wz-channel', ${phone + "9"}, ${tag}) returning id`);
    ids.gowa = gowa.id;
    ids.wazzup = wz.id;
    const msg = async (key: string, conv: string, type: string, mediaUrl: string | null, externalId: string) => {
      const [m] = await q<{ id: string }>(sql`insert into crm_messages (conversation_id, direction, type, text, media_url, external_id, status) values (${conv}, 'in', ${type}, '', ${mediaUrl}, ${externalId}, 'received') returning id`);
      ids[key] = m.id;
    };
    await msg("history", ids.gowa, "audio", null, `${tag}H1`);
    await msg("webhook", ids.gowa, "audio", gowaMediaUrl(VOICE), `${tag}W1`);
    await msg("wazzupVoice", ids.wazzup, "audio", "https://store.wazzup24.com/a.ogg", `${tag}Z1`);
  });
  afterAll(async () => {
    await q(sql`delete from crm_conversations where contact_name = ${tag}`);
    await pool.end();
  });

  it("ChatView: вложения шлюза — gateway без пути к файлу; ссылка Wazzup остаётся как есть", async () => {
    const gowa = await view("gowa").messages(ids.gowa);
    expect(gowa.map((m) => [m.id, m.gateway, m.mediaUrl])).toEqual([
      [ids.history, true, null],
      [ids.webhook, true, null],
    ]);
    expect(JSON.stringify(gowa)).not.toContain("statics/media");
    const wazzup = await view("wazzup").messages(ids.wazzup);
    expect(wazzup.map((m) => [m.gateway, m.mediaUrl])).toEqual([[undefined, "https://store.wazzup24.com/a.ogg"]]);
  });

  it("скачанный файл запоминается в сообщении и не теряется при повторной загрузке истории", async () => {
    await repo.saveMediaUrl(ids.history, gowaMediaUrl(VOICE));
    expect(await repo.media(ids.history)).toMatchObject({ conversationId: ids.gowa, type: "audio", mediaUrl: gowaMediaUrl(VOICE), externalId: `${tag}H1` });
    const again = await repo.insertIncoming(ids.gowa, { externalId: `${tag}H1`, channelId: "gowa", chatType: "whatsapp", chatId: phone, at: new Date(), isEcho: false, type: "audio", text: "", mediaUrl: null, contactName: "", avatarUrl: null, status: null }, null);
    expect(again).toBe(false);
    expect((await repo.media(ids.history))?.mediaUrl).toBe(gowaMediaUrl(VOICE));
  });
});
