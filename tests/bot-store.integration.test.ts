import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { TransactionRollbackError } from "drizzle-orm/errors";
import { pool } from "@/shared/infrastructure/db";
import { rootDb, txStorage } from "@/shared/infrastructure/database";
import { newBotState } from "@/modules/messaging/domain/botEngine";
import { DrizzleBotStore, DrizzleMessageRepository, DrizzleMessagingQueries, botMetrics, purgeBotTraces } from "@/modules/messaging/infrastructure/persistence";
import { turnTrace } from "@/modules/messaging/domain/botTrace";

/**
 * Состояние бота в PostgreSQL: compare-and-set по version, остановка человеком, отложенные ходы, входящие для хода,
 * копия сообщения бота с другим ID, журнал и метрики. Всё — в одной транзакции с откатом (вместе с миграцией
 * 0035_bot_autoresponder, если база её ещё не видела): общая база разработки не меняется.
 * Запуск: INTEGRATION=1 npx vitest run tests/bot-store.integration.test.ts (база из DATABASE_URL).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;

run("бот: хранилище состояния (PostgreSQL)", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("CAS, остановка, сроки, входящие, своё эхо, журнал и метрики", async () => {
    const outcome = rootDb.transaction(async (tx) => {
      await txStorage.run({ tx, events: [], aggregates: new Set() }, async () => {
        const has = await tx.execute<{ n: number }>(sql`select count(*)::int as n from information_schema.columns where table_name = 'crm_conversations' and column_name = 'bot_state'`);
        if (!has.rows[0].n) {
          const ddl = readFileSync(path.join(__dirname, "..", "drizzle", "0035_bot_autoresponder.sql"), "utf8");
          for (const statement of ddl.split("--> statement-breakpoint")) if (statement.trim()) await tx.execute(sql.raw(statement));
        }
        // След хода (0056): база разработки могла его ещё не видеть.
        const traced = await tx.execute<{ n: number }>(sql`select count(*)::int as n from information_schema.columns where table_name = 'crm_bot_events' and column_name = 'meta'`);
        if (!traced.rows[0].n) {
          const ddl = readFileSync(path.join(__dirname, "..", "drizzle", "0056_bot_turn_trace.sql"), "utf8");
          for (const statement of ddl.split("--> statement-breakpoint")) if (statement.trim()) await tx.execute(sql.raw(statement));
        }
        const store = new DrizzleBotStore();
        const messages = new DrizzleMessageRepository();
        const t0 = new Date("2026-10-17T06:00:00Z");
        const [conv] = (await tx.execute<{ id: string }>(sql`insert into crm_conversations (channel, channel_id, chat_id, contact_name) values ('whatsapp', 'gowa', ${`7701${Date.now() % 10_000_000}`}, 'bot-store-test') returning id`)).rows;
        const id = conv.id;
        for (const [i, text] of ["Здравствуйте", "хочу книгу маме"].entries())
          await tx.execute(sql`insert into crm_messages (conversation_id, direction, text, external_id, status, created_at) values (${id}, 'in', ${text}, ${`bst-${id}-${i}`}, 'received', ${new Date(t0.getTime() + i * 1000)})`);

        // Первая запись — только если состояния ещё нет; вторая с тем же ожиданием — отказ.
        const waiting = newBotState(new Date(t0.getTime() - 1000), true);
        expect(await store.save(id, null, { botStep: null, state: waiting, dueAt: new Date(t0.getTime() + 7000) })).toBe(true);
        expect(await store.save(id, null, { botStep: null, state: waiting, dueAt: null })).toBe(false);
        expect(await store.load(id)).toMatchObject({ botStep: null, state: { phase: "waiting", version: 0 }, dueAt: new Date(t0.getTime() + 7000) });

        // Ход: версия 0 → 1; параллельный ход с той же версией — отказ.
        const active = { ...waiting, phase: "active" as const, version: 1, asking: "recipient", questions: ["recipient"] };
        expect(await store.save(id, 0, { botStep: 0, state: active, dueAt: null })).toBe(true);
        expect(await store.save(id, 0, { botStep: 0, state: active, dueAt: null })).toBe(false);

        // Входящие для хода — по времени; срок хода — в выборке планировщика.
        expect((await store.incoming(id, waiting.since ? new Date(waiting.since) : t0)).map((m) => m.text)).toEqual(["Здравствуйте", "хочу книгу маме"]);
        await store.setDue(id, new Date(t0.getTime() + 7000));
        expect(await store.due(new Date(t0.getTime() + 8000), 1000)).toContain(id);
        expect(await store.due(new Date(t0.getTime() + 6000), 1000)).not.toContain(id);

        // Копия сообщения бота, пришедшая от шлюза с другим ID, — «своё» эхо (не ответ человека).
        const own = await messages.insertOutgoing(id, "Для кого будет книга?", null, false, "bot");
        await messages.attachExternalId(own.id, `bst-api-${id}`);
        expect(await messages.claimPendingEcho(id, "Для кого будет книга?", new Date(Date.now() - 120_000), `bst-echo-${id}`)).toBe(true);
        expect(await messages.claimPendingEcho(id, "Ау", new Date(Date.now() - 120_000), `bst-echo2-${id}`)).toBe(false);

        // Ответ человека: бот остановлен, срок снят, запись хода после этого — отказ; повторная остановка — false.
        expect(await store.stop(id, "phone")).toBe(true);
        expect(await store.load(id)).toMatchObject({ botStep: -1, dueAt: null, state: { phase: "done", outcome: "stopped_by_manager", reason: "phone", version: 2 } });
        expect(await store.stop(id, "phone")).toBe(false);
        expect(await store.save(id, 2, { botStep: 0, state: { ...active, version: 3 }, dueAt: null })).toBe(false);
        expect(await store.due(new Date(t0.getTime() + 8000), 1000)).not.toContain(id);
        // Кнопка «Запустить бота» — перезапуск поверх остановленного.
        expect(await store.save(id, 2, { botStep: null, state: { ...waiting, version: 3 }, dueAt: null }, { restart: true })).toBe(true);

        // Менеджер написал первым — бот в этом диалоге не начнёт (bot_step = -1 без состояния).
        const [other] = (await tx.execute<{ id: string }>(sql`insert into crm_conversations (channel, channel_id, chat_id, contact_name) values ('whatsapp', 'gowa', ${`7702${Date.now() % 10_000_000}`}, 'bot-store-test') returning id`)).rows;
        expect(await store.stop(other.id, "phone")).toBe(false);
        expect(await store.load(other.id)).toMatchObject({ botStep: -1, state: null });
        // Ответ менеджера (soft) бота не отключает насовсем: bot_step остаётся, состояние «в работе» закрывается, и AI-продажник
        // может подхватить, если менеджер снова не ответит.
        const [soft] = (await tx.execute<{ id: string }>(sql`insert into crm_conversations (channel, channel_id, chat_id, contact_name) values ('whatsapp', 'gowa', ${`7703${Date.now() % 10_000_000}`}, 'bot-store-test') returning id`)).rows;
        expect(await store.save(soft.id, null, { botStep: 0, state: { ...active, version: 0 }, dueAt: null })).toBe(true);
        expect(await store.stop(soft.id, "crm", { soft: true })).toBe(true);
        expect(await store.load(soft.id)).toMatchObject({ botStep: 0, dueAt: null, state: { phase: "done", outcome: "stopped_by_manager", reason: "crm" } });
        expect(await store.stop(soft.id, "crm", { soft: true })).toBe(false);
        expect(await store.save(soft.id, 1, { botStep: null, state: { ...waiting, version: 2 }, dueAt: null }, { restart: true })).toBe(true);

        // Журнал → метрики.
        await store.log(id, null, "kk", [{ kind: "started", reason: "kk" }, { kind: "takeover" }, { kind: "answer", field: "recipient" }, { kind: "faq", intent: "price" }, { kind: "skipped", reason: "prior_chat" }, { kind: "handoff", reason: "call_request" }, { kind: "handoff", reason: "loop" }]);
        const m = await botMetrics(30);
        // Подхват продажника — в итогах; сбой бота — отдельно от причин передачи, «вопросами клиентов» не считается.
        expect(m.outcomes.takeover).toBeGreaterThanOrEqual(1);
        expect(m.handoffs.call_request).toBeGreaterThanOrEqual(1);
        expect(m.failures.loop).toBeGreaterThanOrEqual(1);
        expect(m.handoffs.loop).toBeUndefined();
        expect(Object.keys(m.intents).some((k) => k.startsWith("handoff:"))).toBe(false);

        // След хода у сообщения бота: читается по id сообщения; старше 90 дней — чистится, свежий остаётся.
        const trace = turnTrace({ purpose: "reply", decision: { action: "reply", stage: "discovery", handoff: "none", lang: "ru", summary: "Хочет книгу маме" }, context: null, state: { phase: "active", outcome: null }, events: [] });
        await store.log(id, null, "ru", [{ kind: "turn", meta: trace, messageId: own.id }]);
        const queries = new DrizzleMessagingQueries();
        expect(await queries.botTrace(own.id)).toEqual(trace);
        await tx.execute(sql`insert into crm_bot_events (conversation_id, kind, meta, created_at) values (${id}, 'turn', ${JSON.stringify(trace)}::jsonb, now() - interval '100 days')`);
        expect(await purgeBotTraces(90)).toBeGreaterThanOrEqual(1);
        expect(await queries.botTrace(own.id)).toEqual(trace);
        expect(m.started).toBeGreaterThanOrEqual(1);
        expect(m.answered.recipient).toBeGreaterThanOrEqual(1);
        expect(m.intents.price).toBeGreaterThanOrEqual(1);
        expect(m.skipped.prior_chat).toBeGreaterThanOrEqual(1);
        expect(m.langs.kk).toBeGreaterThanOrEqual(1);
      });
      tx.rollback();
    });
    await expect(outcome).rejects.toBeInstanceOf(TransactionRollbackError);
  });
});
