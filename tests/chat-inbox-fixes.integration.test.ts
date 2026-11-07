import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { DrizzleConversationRepository, DrizzleMessageRepository } from "@/modules/messaging/infrastructure/persistence";

/**
 * Превью диалога и эхо после таймаута шлюза на PostgreSQL: старое сообщение не перетирает превью и время свежего,
 * эхо снимает ошибку отправки.
 * Запуск: INTEGRATION=1 npx vitest run tests/chat-inbox-fixes.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `cif${Date.now()}`;

run("messaging: превью диалога и эхо после таймаута (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const conversations = new DrizzleConversationRepository();
  const messages = new DrizzleMessageRepository();
  let conv = "";

  beforeAll(async () => {
    const [c] = await q<{ id: string }>(sql`insert into crm_conversations (channel, channel_id, chat_id) values ('whatsapp', ${tag}, ${tag}) returning id`);
    conv = c.id;
  });

  afterAll(async () => {
    await q(sql`delete from crm_conversations where channel_id = ${tag}`);
    await pool.end();
  });

  it("опоздавшее старое входящее и эхо не перетирают превью свежего, но счётчик растёт", async () => {
    await conversations.recordIncoming(conv, "новое", new Date("2026-10-01T10:00:00Z"));
    await conversations.recordIncoming(conv, "старое", new Date("2026-10-01T09:00:00Z"));
    let [r] = await q<{ last_message_text: string; last_message_at: Date; unread: number }>(sql`select last_message_text, last_message_at, unread from crm_conversations where id = ${conv}`);
    expect(r.last_message_text).toBe("новое");
    expect(new Date(r.last_message_at).toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(r.unread).toBe(2);
    await conversations.recordEcho(conv, "старый ответ", new Date("2026-10-01T09:30:00Z"));
    [r] = await q(sql`select last_message_text, last_message_at, unread from crm_conversations where id = ${conv}`);
    expect(r.last_message_text).toBe("новое");
    await conversations.recordIncoming(conv, "ещё новее", new Date("2026-10-01T11:00:00Z"));
    [r] = await q(sql`select last_message_text, last_message_at, unread from crm_conversations where id = ${conv}`);
    expect(r.last_message_text).toBe("ещё новее");
  });

  it("эхо отправленного с ошибкой таймаута — статус «отправлено», ошибки нет", async () => {
    const [m] = await q<{ id: string }>(sql`
      insert into crm_messages (conversation_id, direction, text, status, error, created_at)
      values (${conv}, 'out', 'Подскажу по срокам', 'error', 'Шлюз WhatsApp (GOWA) недоступен', now())
      returning id`);
    expect(await messages.claimPendingEcho(conv, "Подскажу по срокам", new Date(Date.now() - 120_000), `${tag}-echo`)).toBe(true);
    const [r] = await q<{ status: string; error: string | null; external_id: string }>(sql`select status, error, external_id from crm_messages where id = ${m.id}`);
    expect(r).toEqual({ status: "sent", error: null, external_id: `${tag}-echo` });
  });
});
