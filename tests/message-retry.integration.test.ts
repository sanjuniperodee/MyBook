import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { DrizzleMessageRepository } from "@/modules/messaging/infrastructure/persistence";

/**
 * Неотправленные сообщения бота и правил для автоповтора (chats-22) на PostgreSQL: только ошибки бота и правил, текст,
 * не удалённые, без отметки повтора, с since.
 * Запуск: INTEGRATION=1 npx vitest run tests/message-retry.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `mrt${Date.now()}`;

run("messaging: неотправленные для автоповтора (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [c] = await q<{ id: string }>(sql`insert into crm_conversations (channel, channel_id, chat_id) values ('whatsapp', ${tag}, ${tag}) returning id`);
    ids.c = c.id;
    const msg = async (key: string, o: { source?: string | null; status?: string; error?: string | null; type?: string; ago?: string; deleted?: boolean }) => {
      const [m] = await q<{ id: string }>(sql`
        insert into crm_messages (conversation_id, direction, text, source, status, error, type, created_at, deleted_at)
        values (${ids.c}, 'out', 'x', ${o.source === undefined ? "bot" : o.source}, ${o.status ?? "error"}, ${o.error ?? "Шлюз недоступен"}, ${o.type ?? "text"}, now() - ${o.ago ?? "10 minutes"}::interval, ${o.deleted ? sql`now()` : null})
        returning id`);
      ids[key] = m.id;
    };
    await msg("bot", {});
    await msg("rule", { source: "rule" });
    await msg("human", { source: null });
    await msg("sent", { status: "sent" });
    await msg("file", { type: "image" });
    await msg("marked", { error: "Шлюз недоступен · повтор" });
    await msg("old", { ago: "2 days" });
    await msg("deleted", { deleted: true });
  });

  afterAll(async () => {
    await q(sql`delete from crm_conversations where channel_id = ${tag}`);
    await pool.end();
  });

  it("берёт только ошибки бота и правил, текстом, без отметки и не старше since", async () => {
    const got = (await new DrizzleMessageRepository().failedAutomated(new Date(Date.now() - 86_400_000), 100)).filter((r) => r.conversationId === ids.c).map((r) => Object.entries(ids).find(([, v]) => v === r.id)?.[0]);
    expect(got.sort()).toEqual(["bot", "rule"]);
  });
});
