import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { crmConversations, crmDeals, type CrmConversation } from "../db/schema";
import { fillTemplate } from "./automation-meta";
import { matchOption, parseBotConfig, parseDateAnswer, questionText } from "./bot-logic";
import { addDealNote } from "./deals";
import { listFields } from "./fields";
import { notifyOwnerOr } from "./notify";
import { isWorkTime, parseWorkHours } from "./schedule";
import { getSetting } from "./settings";

/**
 * Бот-квалификатор в WhatsApp: на новое обращение задаёт вопросы из настроек и записывает ответы в поля сделки.
 * Останавливается, как только отвечает менеджер. Режим: off | always | off_hours (только вне рабочего времени).
 */
export async function runBot(conv: CrmConversation, incomingText: string, isNew: boolean) {
  const mode = await getSetting("bot.mode");
  if (mode !== "always" && mode !== "off_hours") return;
  if (conv.botStep === -1 || !conv.dealId) return;
  const config = parseBotConfig(await getSetting("bot.config"));
  if (!config.questions.length) return;
  const fields = await listFields("deal");
  const optionsFor = (key: string) => {
    const f = fields.find((x) => x.key === key);
    return f?.type === "select" ? f.options : null;
  };
  const { sendChatMessage } = await import("./chats");

  // Шаг ещё не начат: запускаем только на первое обращение (новый диалог).
  if (conv.botStep === null) {
    if (!isNew) return;
    if (mode === "off_hours" && isWorkTime(new Date(), parseWorkHours(await getSetting("crm.workHours")))) return;
    // Защита от гонки двух вебхуков: шаг ставим атомарно.
    const claimed = await db.update(crmConversations).set({ botStep: 0 }).where(and(eq(crmConversations.id, conv.id), sql`${crmConversations.botStep} is null`)).returning({ id: crmConversations.id });
    if (!claimed.length) return;
    const greeting = fillTemplate(config.greeting, { name: conv.contactName.split(" ")[0] ?? "" });
    const q = config.questions[0];
    await sendChatMessage(conv.id, [greeting, questionText(q, optionsFor(q.field))].filter(Boolean).join("\n\n"), null);
    return;
  }

  // Ответ на текущий вопрос → поле сделки → следующий вопрос или завершение.
  const step = conv.botStep;
  const q = config.questions[step];
  if (!q) return;
  const f = fields.find((x) => x.key === q.field);
  const text = incomingText.trim().slice(0, 300);
  let value: string | number | null = text || null;
  if (f?.type === "select") value = matchOption(text, f.options);
  else if (f?.type === "date") value = parseDateAnswer(text);
  else if (f?.type === "number") value = Number.isFinite(Number(text.replace(",", "."))) ? Number(text.replace(",", ".")) : null;
  if (f && value !== null) {
    await db
      .update(crmDeals)
      .set({ customFields: sql`${crmDeals.customFields} || ${JSON.stringify({ [f.key]: value })}::jsonb`, updatedAt: new Date() })
      .where(eq(crmDeals.id, conv.dealId));
  }
  const next = step + 1;
  const moved = await db.update(crmConversations).set({ botStep: next < config.questions.length ? next : -1 }).where(and(eq(crmConversations.id, conv.id), eq(crmConversations.botStep, step))).returning({ id: crmConversations.id });
  if (!moved.length) return; // менеджер уже ответил или параллельный вебхук
  if (next < config.questions.length) {
    const nq = config.questions[next];
    await sendChatMessage(conv.id, questionText(nq, optionsFor(nq.field)), null);
    return;
  }
  if (config.finish.trim()) await sendChatMessage(conv.id, fillTemplate(config.finish, { name: conv.contactName.split(" ")[0] ?? "" }), null);
  const deal = await db.query.crmDeals.findFirst({ where: eq(crmDeals.id, conv.dealId) });
  if (!deal) return;
  const summary = config.questions
    .map((cq) => {
      const fd = fields.find((x) => x.key === cq.field);
      const v = deal.customFields[cq.field];
      return fd ? `${fd.label}: ${v === undefined || v === null || v === "" ? "—" : String(v)}` : null;
    })
    .filter(Boolean)
    .join("\n");
  await addDealNote(deal, `Бот собрал ответы клиента:\n${summary}`, null);
  await notifyOwnerOr(deal.assigneeId, "chats.view", { kind: "message", title: `Бот собрал ответы: ${deal.contactName || deal.title}`, body: summary.replace(/\n/g, " · "), link: `/admin/chats?c=${conv.id}` });
}

/** Сколько диалогов бот обработал за последние сутки (для настроек). */
export async function botStats() {
  const [row] = await db
    .select({ active: sql<number>`count(*) filter (where ${crmConversations.botStep} >= 0)::int`, done: sql<number>`count(*) filter (where ${crmConversations.botStep} = -1)::int` })
    .from(crmConversations)
    .where(gte(crmConversations.createdAt, sql`now() - interval '30 days'`));
  return row;
}
