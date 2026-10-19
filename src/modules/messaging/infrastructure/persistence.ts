import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { crmBlocklist, crmBotEvents, crmConversations, crmMessages, users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import type { Blocklist, BotRecord, BotStore, ConversationRepository, MessageMediaStore, MessageRepository, MessageSource, OutgoingExtra, StoredMessage } from "../application";
import { BOT_TRACE_KEEP_DAYS, readBotState, readBotTrace, splitHandoffs, type BotEvent, type BotState, type BotTurnTrace, type Conversation, type InboundMessage } from "../domain";

type Row = typeof crmConversations.$inferSelect;

/** Последний ответ человека — не назад во времени (эхо, догнанное сверкой со шлюзом, приходит позже). */
const lastOutgoing = (at: Date) => sql`greatest(${crmConversations.lastOutgoingAt}, ${at.toISOString()}::timestamptz)`;
const toConversation = (r: Row): Conversation => ({
  id: r.id,
  channel: r.channel,
  channelId: r.channelId,
  chatId: r.chatId,
  contactName: r.contactName,
  avatarUrl: r.avatarUrl,
  clientId: r.clientId,
  dealId: r.dealId,
  assigneeId: r.assigneeId,
  botStep: r.botStep,
  awaitingSince: r.awaitingSince,
  lastMessageAt: r.lastMessageAt,
  meta: r.meta,
});

export class DrizzleConversationRepository implements ConversationRepository {
  async findById(id: string) {
    const [r] = await executor().select().from(crmConversations).where(eq(crmConversations.id, id)).limit(1);
    return r ? toConversation(r) : null;
  }

  async findByChat(channel: string, channelId: string, chatId: string) {
    const [r] = await executor()
      .select()
      .from(crmConversations)
      .where(and(eq(crmConversations.channel, channel), eq(crmConversations.channelId, channelId), eq(crmConversations.chatId, chatId)))
      .limit(1);
    return r ? toConversation(r) : null;
  }

  async create(input: Parameters<ConversationRepository["create"]>[0]) {
    const [r] = await executor().insert(crmConversations).values(input).onConflictDoNothing().returning();
    return r ? toConversation(r) : null;
  }

  async updateContact(id: string, patch: Parameters<ConversationRepository["updateContact"]>[1]) {
    const [r] = await executor().update(crmConversations).set(patch).where(eq(crmConversations.id, id)).returning();
    return toConversation(r);
  }

  async linkDeal(id: string, link: { dealId: string; clientId: string | null; assigneeId: string | null }) {
    const [r] = await executor().update(crmConversations).set(link).where(eq(crmConversations.id, id)).returning();
    return toConversation(r);
  }

  async recordIncoming(id: string, text: string, at: Date) {
    await executor()
      .update(crmConversations)
      .set({
        lastMessageAt: at,
        lastMessageText: text,
        unread: sql`${crmConversations.unread} + 1`,
        awaitingSince: sql`coalesce(${crmConversations.awaitingSince}, ${at.toISOString()}::timestamptz)`,
        status: "open",
        updatedAt: new Date(),
      })
      .where(eq(crmConversations.id, id));
  }

  async dismissAwaiting(id: string, since: Date) {
    const rows = await executor()
      .update(crmConversations)
      .set({ awaitingSince: null, updatedAt: new Date() })
      .where(and(eq(crmConversations.id, id), eq(crmConversations.awaitingSince, since)))
      .returning({ id: crmConversations.id });
    return rows.length > 0;
  }

  async recordEcho(id: string, text: string, at: Date) {
    await executor()
      .update(crmConversations)
      .set({ lastMessageAt: at, lastMessageText: text, awaitingSince: null, unread: 0, lastOutgoingAt: lastOutgoing(at), updatedAt: new Date() })
      .where(eq(crmConversations.id, id));
  }

  async recordHistory(id: string, text: string, at: Date) {
    await executor()
      .update(crmConversations)
      .set({ lastMessageAt: at, lastMessageText: text, updatedAt: new Date() })
      .where(and(eq(crmConversations.id, id), or(isNull(crmConversations.lastMessageAt), lt(crmConversations.lastMessageAt, at))));
  }

  async recordOutgoing(id: string, text: string, at: Date, authorId: string | null) {
    await executor()
      .update(crmConversations)
      .set({
        lastMessageAt: at,
        lastMessageText: text,
        // Автоответ и бот не снимают «ждёт ответа» и не считаются нашим ответом: клиент всё ещё ждёт менеджера.
        ...(authorId ? { unread: 0, awaitingSince: null, lastOutgoingAt: lastOutgoing(at), assigneeId: sql`coalesce(${crmConversations.assigneeId}, ${authorId}::uuid)` } : {}),
        updatedAt: at,
      })
      .where(eq(crmConversations.id, id));
  }

  async closeAsSpam(id: string, text: string, at: Date) {
    await executor().update(crmConversations).set({ lastMessageAt: at, lastMessageText: text, status: "closed" }).where(eq(crmConversations.id, id));
  }

  async markRead(id: string) {
    await executor().update(crmConversations).set({ unread: 0 }).where(eq(crmConversations.id, id));
  }

  async advanceBot(id: string, from: number | null, to: number) {
    const rows = await executor()
      .update(crmConversations)
      .set({ botStep: to })
      .where(and(eq(crmConversations.id, id), from === null ? isNull(crmConversations.botStep) : eq(crmConversations.botStep, from)))
      .returning({ id: crmConversations.id });
    return rows.length > 0;
  }

  async linkClientByDeal(dealId: string, clientId: string) {
    await executor().update(crmConversations).set({ clientId }).where(and(eq(crmConversations.dealId, dealId), isNull(crmConversations.clientId)));
  }

  async assignByDeal(dealId: string, userId: string) {
    await executor().update(crmConversations).set({ assigneeId: userId }).where(eq(crmConversations.dealId, dealId));
  }

  async chatIdsByDeal(dealId: string) {
    return (await executor().select({ chatId: crmConversations.chatId }).from(crmConversations).where(eq(crmConversations.dealId, dealId))).map((c) => c.chatId);
  }

  async chatIdsByClient(clientId: string) {
    const rows = await executor().select({ chatId: crmConversations.chatId }).from(crmConversations).where(eq(crmConversations.clientId, clientId)).orderBy(desc(crmConversations.lastMessageAt)).limit(50);
    return rows.map((c) => c.chatId);
  }

  async setAssignee(id: string, userId: string | null) {
    await executor().update(crmConversations).set({ assigneeId: userId }).where(eq(crmConversations.id, id));
  }

  async setStatus(id: string, status: "open" | "closed") {
    await executor()
      .update(crmConversations)
      .set({ status, ...(status === "closed" ? { awaitingSince: null, unread: 0 } : {}) })
      .where(eq(crmConversations.id, id));
  }

  async closeByDeal(dealId: string) {
    await executor().update(crmConversations).set({ status: "closed", awaitingSince: null, unread: 0 }).where(eq(crmConversations.dealId, dealId));
  }

  async latestWhatsapp(chatId: string) {
    const [r] = await executor()
      .select()
      .from(crmConversations)
      .where(and(eq(crmConversations.chatId, chatId), sql`${crmConversations.channel} in ('whatsapp', 'wapi')`))
      .orderBy(desc(crmConversations.lastMessageAt))
      .limit(1);
    return r ? toConversation(r) : null;
  }
}

export class DrizzleMessageRepository implements MessageRepository, MessageMediaStore {
  async insertIncoming(conversationId: string, m: InboundMessage, subject: string | null) {
    const rows = await executor()
      .insert(crmMessages)
      .values({ conversationId, direction: "in", type: m.type, text: m.text, mediaUrl: m.mediaUrl, externalId: m.externalId, status: "received", subject, createdAt: m.at })
      .onConflictDoNothing()
      .returning({ id: crmMessages.id });
    return rows.length > 0;
  }

  async existsExternal(externalId: string) {
    const [r] = await executor().select({ id: crmMessages.id }).from(crmMessages).where(eq(crmMessages.externalId, externalId)).limit(1);
    return !!r;
  }

  async knownExternal(externalIds: string[]) {
    const ids = [...new Set(externalIds.filter(Boolean))];
    if (!ids.length) return new Set<string>();
    const rows = await executor().select({ id: crmMessages.externalId }).from(crmMessages).where(inArray(crmMessages.externalId, ids));
    return new Set(rows.flatMap((r) => (r.id ? [r.id] : [])));
  }

  async claimPendingEcho(conversationId: string, text: string, since: Date, externalId: string) {
    // Копия сообщения бота или правила (шлюз мог дать ей другой ID) — не ответ человека, бота не останавливает.
    const [own] = await executor()
      .select({ id: crmMessages.id })
      .from(crmMessages)
      .where(and(eq(crmMessages.conversationId, conversationId), eq(crmMessages.direction, "out"), eq(crmMessages.internal, false), inArray(crmMessages.source, ["bot", "rule"]), eq(crmMessages.text, text), gte(crmMessages.createdAt, since)))
      .limit(1);
    if (own) {
      await executor().update(crmMessages).set({ externalId }).where(and(eq(crmMessages.id, own.id), isNull(crmMessages.externalId)));
      return true;
    }
    const [pending] = await executor()
      .select({ id: crmMessages.id })
      .from(crmMessages)
      .where(
        and(
          eq(crmMessages.conversationId, conversationId),
          eq(crmMessages.direction, "out"),
          eq(crmMessages.internal, false),
          isNull(crmMessages.externalId),
          eq(crmMessages.text, text),
          gte(crmMessages.createdAt, since),
        ),
      )
      .limit(1);
    if (!pending) return false;
    await executor().update(crmMessages).set({ externalId }).where(eq(crmMessages.id, pending.id));
    return true;
  }

  async insertEcho(conversationId: string, m: InboundMessage) {
    const rows = await executor()
      .insert(crmMessages)
      .values({ conversationId, direction: "out", type: m.type, text: m.text, mediaUrl: m.mediaUrl, externalId: m.externalId, status: "sent", createdAt: m.at })
      .onConflictDoNothing()
      .returning({ id: crmMessages.id });
    return rows.length > 0;
  }

  async insertOutgoing(conversationId: string, text: string, authorId: string | null, internal = false, source?: MessageSource, extra: OutgoingExtra = {}) {
    const [m] = await executor()
      .insert(crmMessages)
      .values({
        conversationId,
        direction: "out",
        authorId,
        text,
        internal,
        source: source ?? null,
        status: internal ? "sent" : "pending",
        type: extra.type ?? "text",
        mediaUrl: extra.mediaUrl ?? null,
        replyToId: extra.replyToId ?? null,
        forwarded: !!extra.forwarded,
      })
      .returning();
    return m;
  }

  async findOne(id: string): Promise<StoredMessage | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [m] = await executor()
      .select({
        id: crmMessages.id,
        conversationId: crmMessages.conversationId,
        direction: crmMessages.direction,
        type: crmMessages.type,
        text: crmMessages.text,
        mediaUrl: crmMessages.mediaUrl,
        externalId: crmMessages.externalId,
        internal: crmMessages.internal,
        authorId: crmMessages.authorId,
        source: crmMessages.source,
        status: crmMessages.status,
        deletedAt: crmMessages.deletedAt,
        transcript: crmMessages.transcript,
        createdAt: crmMessages.createdAt,
      })
      .from(crmMessages)
      .where(eq(crmMessages.id, id))
      .limit(1);
    return m ?? null;
  }

  async editText(id: string, text: string, at: Date) {
    await executor().update(crmMessages).set({ text, editedAt: at }).where(eq(crmMessages.id, id));
  }

  async markDeleted(id: string, at: Date) {
    await executor().update(crmMessages).set({ deletedAt: at }).where(eq(crmMessages.id, id));
  }

  async setTranscript(id: string, text: string) {
    await executor().update(crmMessages).set({ transcript: text }).where(eq(crmMessages.id, id));
  }

  async setStatus(id: string, status: "sent" | "delivered" | "read" | "error", error: string | null = null) {
    await executor().update(crmMessages).set({ status, error }).where(eq(crmMessages.id, id));
  }

  async attachExternalId(id: string, externalId: string | null) {
    const sent = sql`case when ${crmMessages.status} = 'pending' then 'sent' else ${crmMessages.status} end`;
    if (!externalId) {
      await executor().update(crmMessages).set({ status: sent }).where(eq(crmMessages.id, id));
      return;
    }
    await executor().transaction(async (tx) => {
      await tx.delete(crmMessages).where(and(eq(crmMessages.externalId, externalId), sql`${crmMessages.id} <> ${id}`));
      await tx.update(crmMessages).set({ externalId, status: sent }).where(eq(crmMessages.id, id));
    });
  }

  async media(id: string) {
    const [r] = await executor()
      .select({ id: crmMessages.id, conversationId: crmMessages.conversationId, type: crmMessages.type, mediaUrl: crmMessages.mediaUrl, externalId: crmMessages.externalId })
      .from(crmMessages)
      .where(eq(crmMessages.id, id))
      .limit(1);
    return r ?? null;
  }

  async saveMediaUrl(id: string, mediaUrl: string) {
    await executor().update(crmMessages).set({ mediaUrl }).where(eq(crmMessages.id, id));
  }

  async byExternalId(externalId: string) {
    const [r] = await executor()
      .select({ id: crmMessages.id, status: crmMessages.status, conversationId: crmMessages.conversationId })
      .from(crmMessages)
      .where(eq(crmMessages.externalId, externalId))
      .limit(1);
    return r ?? null;
  }

  /** Суточный лимит правил: по частичному индексу crm_messages_rule_idx, не больше cap строк. */
  async countRuleSince(since: Date, cap: number) {
    const { rows } = await executor().execute<{ n: number }>(sql`
      select count(*)::int as n from (
        select 1 from crm_messages
        where source = 'rule' and internal = false and created_at >= ${since}
        order by created_at
        limit ${cap}
      ) t`);
    return Number(rows[0]?.n ?? 0);
  }
}

/** Бот не остановлен человеком: bot_step null (ещё не начал) или номер вопроса. */
const botAlive = () => or(isNull(crmConversations.botStep), gte(crmConversations.botStep, 0));

/** Состояние бота в диалоге: compare-and-set по version, остановка человеком — одним UPDATE. */
export class DrizzleBotStore implements BotStore {
  async load(conversationId: string): Promise<BotRecord | null> {
    const [r] = await executor()
      .select({ botStep: crmConversations.botStep, botState: crmConversations.botState, botDueAt: crmConversations.botDueAt })
      .from(crmConversations)
      .where(eq(crmConversations.id, conversationId))
      .limit(1);
    return r ? { botStep: r.botStep, state: readBotState(r.botState), dueAt: r.botDueAt } : null;
  }

  async save(conversationId: string, expectedVersion: number | null, next: { botStep: number | null; state: BotState; dueAt: Date | null }, opts: { restart?: boolean } = {}) {
    const version = expectedVersion === null ? isNull(crmConversations.botState) : sql`coalesce((${crmConversations.botState}->>'version')::int, 0) = ${expectedVersion}`;
    const rows = await executor()
      .update(crmConversations)
      .set({ botStep: next.botStep, botState: next.state as unknown as Record<string, unknown>, botDueAt: next.dueAt })
      .where(and(eq(crmConversations.id, conversationId), version, opts.restart ? undefined : botAlive()))
      .returning({ id: crmConversations.id });
    return rows.length > 0;
  }

  async setDue(conversationId: string, dueAt: Date | null) {
    await executor()
      .update(crmConversations)
      .set({ botDueAt: dueAt })
      .where(and(eq(crmConversations.id, conversationId), botAlive(), sql`${crmConversations.botState} is not null and ${crmConversations.botState}->>'phase' <> 'done'`));
  }

  async stop(conversationId: string, reason: string, opts: { soft?: boolean } = {}) {
    // Состояние «в работе» закрывается как «остановлен человеком»; законченное — не трогаем. Жёсткая остановка (кнопка
    // «Остановить бота») ставит bot_step = -1: бот не начнёт и там, где ещё не начинал. Ответ менеджера (soft) бота не
    // отключает насовсем: не отвечает менеджер снова — AI-продажник подхватит (state done / stopped_by_manager).
    const rows = await executor()
      .update(crmConversations)
      .set({
        ...(opts.soft ? {} : { botStep: -1 }),
        botDueAt: null,
        botState: sql`case when ${crmConversations.botState} is not null and ${crmConversations.botState}->>'phase' <> 'done'
          then ${crmConversations.botState} || jsonb_build_object('phase', 'done', 'outcome', 'stopped_by_manager', 'reason', ${reason}::text, 'asking', null,
            'version', coalesce((${crmConversations.botState}->>'version')::int, 0) + 1)
          else ${crmConversations.botState} end`,
      })
      .where(and(eq(crmConversations.id, conversationId), botAlive()))
      .returning({ outcome: sql<string | null>`${crmConversations.botState}->>'outcome'`, reason: sql<string | null>`${crmConversations.botState}->>'reason'` });
    return rows.some((r) => r.outcome === "stopped_by_manager" && r.reason === reason);
  }

  async due(now: Date, limit: number) {
    const rows = await executor()
      .select({ id: crmConversations.id })
      .from(crmConversations)
      .where(and(lt(crmConversations.botDueAt, now), botAlive()))
      .orderBy(asc(crmConversations.botDueAt))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  async incoming(conversationId: string, since: Date) {
    const rows = await executor()
      .select({ id: crmMessages.id, text: crmMessages.text, type: crmMessages.type, at: crmMessages.createdAt, mediaUrl: crmMessages.mediaUrl })
      .from(crmMessages)
      .where(and(eq(crmMessages.conversationId, conversationId), eq(crmMessages.direction, "in"), gte(crmMessages.createdAt, since)))
      .orderBy(asc(crmMessages.createdAt))
      .limit(100);
    return rows;
  }

  async log(conversationId: string, dealId: string | null, lang: string | null, events: BotEvent[]) {
    if (!events.length) return;
    await executor()
      .insert(crmBotEvents)
      .values(events.map((e) => ({ conversationId, dealId, kind: e.kind, field: e.field ?? null, intent: e.intent ?? null, lang, reason: e.reason?.slice(0, 200) ?? null, meta: (e.meta as unknown as Record<string, unknown>) ?? null, messageId: e.messageId ?? null })));
  }
}

/** Сколько старых следов удаляется за проход: чистка идёт порциями, без долгой блокировки журнала. */
const TRACE_PURGE_BATCH = 2000;

/**
 * Чистка следов ходов бота старше keepDays (по частичному индексу crm_bot_events_turn_at_idx): за проход — не больше
 * TRACE_PURGE_BATCH самых старых. Остальной журнал (статистика) не трогается. Возвращает, сколько удалено.
 */
export async function purgeBotTraces(keepDays = BOT_TRACE_KEEP_DAYS): Promise<number> {
  const res = await executor().execute(sql`
    delete from crm_bot_events where id in (
      select id from crm_bot_events where kind = 'turn' and created_at < now() - make_interval(days => ${keepDays})
      order by created_at limit ${TRACE_PURGE_BATCH})`);
  return res.rowCount ?? 0;
}

/** Метрики бота за период (настройки бота). */
export interface BotMetrics {
  started: number;
  skipped: Record<string, number>;
  outcomes: Record<string, number>;
  /** Сколько диалогов дошли до ответа на каждый вопрос и где ответ не распознан. */
  answered: Record<string, number>;
  unrecognized: Record<string, number>;
  /** О чём спрашивали (частые вопросы). */
  intents: Record<string, number>;
  /** Почему бот передал беседу менеджеру — просьбы и ситуации клиента. */
  handoffs: Record<string, number>;
  /** Передачи из-за сбоя самого бота (модель не ответила, петля, потолок беседы…). */
  failures: Record<string, number>;
  langs: Record<string, number>;
  /** Медиана минут от итога бота до первого ответа человека. */
  replyMinutes: number | null;
  /** Сделки после бота, где есть договорённость или оплата. */
  converted: number;
}

const tally = (rows: { key: string | null; n: number }[]) => Object.fromEntries(rows.filter((r) => r.key).map((r) => [r.key!, Number(r.n)]));

export async function botMetrics(days = 30): Promise<BotMetrics> {
  const since = sql`now() - make_interval(days => ${days})`;
  const by = (kind: string, column: "reason" | "field" | "intent" | "lang", distinct = false) =>
    executor().execute<{ key: string | null; n: number }>(
      sql`select ${sql.raw(column)} as key, count(${sql.raw(distinct ? "distinct conversation_id" : "*")})::int as n from crm_bot_events where kind = ${kind} and created_at >= ${since} group by 1`,
    );
  const [skipped, answered, unrecognized, faq, handoff, langs, outcomes, reply, converted] = await Promise.all([
    by("skipped", "reason"),
    by("answer", "field", true),
    by("unrecognized", "field", true),
    by("faq", "intent"),
    by("handoff", "reason"),
    by("started", "reason"),
    executor().execute<{ key: string; n: number }>(
      sql`select kind as key, count(distinct conversation_id)::int as n from crm_bot_events where kind in ('started', 'takeover', 'finished', 'handoff', 'stopped_by_manager', 'abandoned', 'declined', 'offer', 'agreed', 'invoiced', 'offered') and created_at >= ${since} group by 1`,
    ),
    executor().execute<{ m: number | null }>(sql`
      select percentile_cont(0.5) within group (order by extract(epoch from (r.first_at - e.at)) / 60) as m
      from (select conversation_id, max(created_at) as at from crm_bot_events where kind in ('finished', 'handoff', 'abandoned', 'offered', 'invoiced') and created_at >= ${since} group by 1) e
      cross join lateral (select min(m.created_at) as first_at from crm_messages m where m.conversation_id = e.conversation_id and m.direction = 'out' and m.internal = false and m.source is null and m.created_at > e.at) r
      where r.first_at is not null`),
    executor().execute<{ n: number }>(sql`
      select count(distinct e.deal_id)::int as n from crm_bot_events e join crm_deals d on d.id = e.deal_id
      where e.kind = 'started' and e.created_at >= ${since}
        and (d.agreed_plan is not null or d.order_id is not null or exists (select 1 from crm_payments p where p.deal_id = d.id))`),
  ]);
  const o = tally(outcomes.rows);
  const { handoffs, failures } = splitHandoffs(tally(handoff.rows));
  return {
    started: o.started ?? 0,
    skipped: tally(skipped.rows),
    outcomes: o,
    answered: tally(answered.rows),
    unrecognized: tally(unrecognized.rows),
    intents: tally(faq.rows),
    handoffs,
    failures,
    langs: tally(langs.rows),
    replyMinutes: reply.rows[0]?.m == null ? null : Math.round(Number(reply.rows[0].m)),
    converted: Number(converted.rows[0]?.n ?? 0),
  };
}

/** Есть ли в стоп-листе один из номеров (spam — только спам; без reason — любая отметка). Поиск по первичному ключу. */
async function listed(values: (string | null | undefined)[], reason?: "spam") {
  const list = [...new Set(values.filter((v): v is string => !!v))];
  if (!list.length) return false;
  const rows = await executor()
    .select({ v: crmBlocklist.value })
    .from(crmBlocklist)
    .where(and(inArray(crmBlocklist.value, list), reason ? eq(crmBlocklist.reason, reason) : undefined))
    .limit(1);
  return rows.length > 0;
}

export const drizzleBlocklist: Blocklist = {
  isBlocked: (...values) => listed(values, "spam"),
  noMarketing: (...values) => listed(values),
  async add(values, byUserId, opts = {}) {
    const list = [...new Set(values.filter(Boolean))];
    if (!list.length) return;
    const reason = opts.reason ?? "spam";
    const insert = executor()
      .insert(crmBlocklist)
      .values(list.map((value) => ({ value, reason, note: opts.note?.slice(0, 300) || null, createdById: byUserId })));
    // Спам сильнее «не писать первым»: номер, который просил не писать, а потом прислал спам, — уже спам.
    if (reason === "spam") await insert.onConflictDoUpdate({ target: crmBlocklist.value, set: { reason: "spam", note: sql`coalesce(excluded.note, ${crmBlocklist.note})` }, setWhere: sql`${crmBlocklist.reason} <> 'spam'` });
    else await insert.onConflictDoNothing();
  },
  async remove(values, reason) {
    if (!values.length) return;
    await executor()
      .delete(crmBlocklist)
      .where(and(inArray(crmBlocklist.value, values), reason ? eq(crmBlocklist.reason, reason) : undefined));
  },
};

/** Read-модели переписки. */
export class DrizzleMessagingQueries {
  /** В каком диалоге сообщение (проверка доступа к действиям с ним). */
  async messageConversation(messageId: string): Promise<string | null> {
    if (!/^[0-9a-f-]{36}$/i.test(messageId)) return null;
    const [m] = await executor().select({ c: crmMessages.conversationId }).from(crmMessages).where(eq(crmMessages.id, messageId)).limit(1);
    return m?.c ?? null;
  }

  /** Диалог целиком (для экранов CRM). */
  async conversation(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [c] = await executor().select().from(crmConversations).where(eq(crmConversations.id, id)).limit(1);
    return c ?? null;
  }

  /** Последний диалог WhatsApp сделки — туда уходят счёт и доступ, его номер — подтверждённый телефон клиента. */
  async whatsappForDeal(dealId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(dealId)) return null;
    const [c] = await executor()
      .select()
      .from(crmConversations)
      .where(and(eq(crmConversations.dealId, dealId), eq(crmConversations.channel, "whatsapp")))
      .orderBy(desc(crmConversations.lastMessageAt))
      .limit(1);
    return c ?? null;
  }

  /** Статус доставки сообщения (pending | sent | delivered | read | error); null — сообщения нет. */
  async messageStatus(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [m] = await executor().select({ status: crmMessages.status }).from(crmMessages).where(eq(crmMessages.id, id)).limit(1);
    return m?.status ?? null;
  }

  /** Есть ли в диалоге внутренняя заметка с таким текстом (служебные заметки CRM пишутся один раз). */
  async hasInternalNote(conversationId: string, text: string) {
    const [m] = await executor()
      .select({ id: crmMessages.id })
      .from(crmMessages)
      .where(and(eq(crmMessages.conversationId, conversationId), eq(crmMessages.internal, true), eq(crmMessages.text, text)))
      .limit(1);
    return !!m;
  }

  /** Переписка для виджета: без внутренних заметок; автор — только «я / менеджер», без имён сотрудников. */
  async siteMessages(chatId: string, after?: Date) {
    const [conv] = await executor()
      .select({ id: crmConversations.id })
      .from(crmConversations)
      .where(and(eq(crmConversations.channel, "site"), eq(crmConversations.channelId, ""), eq(crmConversations.chatId, chatId)))
      .limit(1);
    if (!conv) return [];
    const rows = await executor()
      .select({ id: crmMessages.id, direction: crmMessages.direction, text: crmMessages.text, at: crmMessages.createdAt })
      .from(crmMessages)
      .where(and(eq(crmMessages.conversationId, conv.id), eq(crmMessages.internal, false), after ? gt(crmMessages.createdAt, after) : undefined))
      .orderBy(asc(crmMessages.createdAt))
      .limit(200);
    return rows.map((r) => ({ id: r.id, mine: r.direction === "in", text: r.text, at: r.at.toISOString() }));
  }

  /** Метрики бота за 30 дней (настройки бота): по журналу событий, а не по bot_step. */
  botMetrics(days = 30) {
    return botMetrics(days);
  }

  /** След хода продажника у сообщения бота («Почему так?»); null — следа нет (шаблонный бот, старое сообщение). */
  async botTrace(messageId: string): Promise<BotTurnTrace | null> {
    const [row] = await executor()
      .select({ meta: crmBotEvents.meta })
      .from(crmBotEvents)
      .where(and(eq(crmBotEvents.messageId, messageId), eq(crmBotEvents.kind, "turn")))
      .orderBy(desc(crmBotEvents.createdAt))
      .limit(1);
    return row ? readBotTrace(row.meta) : null;
  }

  /** Стоп-лист для настроек: спам и «не писать первым», кто добавил (null — CRM сама). */
  blocklist() {
    return executor()
      .select({ value: crmBlocklist.value, reason: crmBlocklist.reason, note: crmBlocklist.note, createdAt: crmBlocklist.createdAt, byName: users.name, byEmail: users.email })
      .from(crmBlocklist)
      .leftJoin(users, eq(users.id, crmBlocklist.createdById))
      .orderBy(desc(crmBlocklist.createdAt))
      .limit(200);
  }

  async staffName(id: string | null) {
    if (!id) return null;
    const [u] = await executor().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, id)).limit(1);
    return u ?? null;
  }
}
