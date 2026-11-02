import type { Clock, Logger } from "@/shared/application";
import {
  HELP_HISTORY,
  PLACE_MARK,
  helpReplyProblems,
  helpSchema,
  helpSystemPrompt,
  helpUserPrompt,
  parseHelpDecision,
  placeLine,
  preview,
  questionWithPlace,
  splitPlace,
  tabOfPath,
  type HelpDecision,
  type HelpHandoff,
  type HelpLang,
  type HelpPlace,
} from "../domain/cabinetHelp";
import type { BotSellerModel, ConversationRepository, LiveUpdates, MessageRepository, RouteServed, SalesGateway, StaffNotifier } from "./ports";

/** Сообщение беседы помощника для виджета: клиент, помощник или менеджер (без внутренних заметок). */
export interface HelpThreadMessage {
  id: string;
  from: "client" | "bot" | "manager";
  text: string;
  at: string;
}

export interface HelpStore {
  thread(conversationId: string, limit: number): Promise<HelpThreadMessage[]>;
  /** Ход помощника в журнал бота: причина (none — ответил сам), язык, стоимость и где был клиент. */
  log(conversationId: string, e: { reason: string; lang: string; messageId: string | null; meta: Record<string, unknown> }): Promise<void>;
  /** Сколько ходы помощника стоили с since (суточный потолок). */
  spentSince(since: Date): Promise<number>;
}

/** Итог вопроса: ответил помощник, вопрос у менеджера (помощник сказал об этом) или менеджер уже в беседе (помощник молчит). */
export type HelpOutcome = "answered" | "handoff" | "manager";

export interface HelpResult {
  outcome: HelpOutcome;
  handoff: HelpHandoff | null;
  suggestions: string[];
  messages: HelpThreadMessage[];
}

export interface HelpAsk {
  user: { id: string; name: string };
  book: { id: string; title: string };
  /** Книга клиента текстом для модели (server/helpBook). */
  bookText: string;
  question: string;
  place: HelpPlace | null;
  /** Что известно о месте, на которое нажал клиент (фото, ответ, страница макета) — тоже из данных книги. */
  placeDetails?: string;
  uiLang: HelpLang;
  /** Клиент сам позвал человека («Позвать менеджера»): без модели. */
  human?: boolean;
}

/** Модель думает над ответом, пока клиент смотрит на «печатает…». */
export const HELP_TIMEOUT_MS = 25_000;
/** Менеджер писал в беседу за это время — помощник не перебивает, вопрос сразу у менеджера. */
export const HELP_HUMAN_ACTIVE_MS = 3 * 3_600_000;
/** Потолок расходов помощника в сутки (сверх — вопросы идут менеджеру, клиент не остаётся без ответа). */
export const HELP_DAILY_USD = 5;

const FALLBACK: Record<HelpLang, string> = {
  ru: "Передаю ваш вопрос менеджеру — он ответит здесь, в этом чате, или в WhatsApp.",
  kk: "Сұрағыңызды менеджерге жіберемін — ол осы чатта немесе WhatsApp-та жауап береді.",
};
const HUMAN: Record<HelpLang, string> = {
  ru: "Позвал менеджера — он ответит здесь, в этом чате, или в WhatsApp. А пока могу подсказать по кабинету.",
  kk: "Менеджерді шақырдым — ол осы чатта немесе WhatsApp-та жауап береді. Әзірге кабинет бойынша көмектесе аламын.",
};

/** Подпись причины передачи для менеджера. */
const REASONS: Record<HelpHandoff, string> = {
  none: "",
  unknown: "помощник не нашёл ответа",
  price: "вопрос о цене или скидке",
  order: "вопрос об оплате, сроках или заказе",
  edit: "просит правку за него или в заказанной книге",
  bug: "похоже на сбой на сайте",
  human: "просит менеджера",
  complaint: "недоволен",
};

const dayStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/**
 * Помощник в кабинете книги: вопрос клиента → ответ модели по справочнику кабинета и данным книги, сразу в чате на
 * сайте. Беседа — диалог CRM «Чат на сайте» клиента: менеджер видит её в «Чатах» и в карточке клиента. Пока помощник
 * отвечает сам, диалог закрыт (не висит в «Открытых» у менеджеров); не знает ответа, вопрос о деньгах, сроках, правке
 * за клиента или клиент позвал человека — диалог открывается, «ждёт ответа», ответственному уведомление и заметка в
 * его WhatsApp-чате с клиентом. Сбой модели или потолок расходов — тоже к менеджеру: без ответа клиент не остаётся.
 */
export class CabinetHelpService {
  #spent: { at: number; day: string; usd: number } | null = null;
  /** Инструкция на язык сайта клиента (казахский вариант — с казахскими названиями кнопок); кэш провайдера — на каждый. */
  readonly #system = { ru: helpSystemPrompt("ru"), kk: helpSystemPrompt("kk") };

  constructor(
    private readonly d: {
      conversations: Pick<ConversationRepository, "findByChat" | "create" | "setStatus" | "recordHistory" | "recordIncoming" | "setAssignee" | "latestWhatsappOfClient">;
      messages: Pick<MessageRepository, "insertIncoming" | "lastOutgoing">;
      chats: { send(conversationId: string, text: string, authorId: null, source: "bot"): Promise<{ id: string }>; addInternalNote(conversationId: string, text: string, authorId: null, source: "bot"): Promise<unknown> };
      model: BotSellerModel | null;
      store: HelpStore;
      sales: Pick<SalesGateway, "findOpenDeal">;
      notifier: StaffNotifier;
      live: LiveUpdates;
      clock: Clock;
      logger: Logger;
      chatId(userId: string): string;
      uuid(): string;
    },
  ) {}

  /** Беседа клиента (без создания): для виджета при открытии. */
  async thread(userId: string): Promise<HelpThreadMessage[]> {
    const conv = await this.d.conversations.findByChat("site", "", this.d.chatId(userId));
    return conv ? this.d.store.thread(conv.id, 60) : [];
  }

  private async conversation(user: { id: string; name: string }, path: string) {
    const chatId = this.d.chatId(user.id);
    const found = await this.d.conversations.findByChat("site", "", chatId);
    if (found) return found;
    const created = await this.d.conversations.create({ channel: "site", channelId: "", chatId, contactName: user.name.slice(0, 80), avatarUrl: null, clientId: user.id, meta: { page: path.slice(0, 200), help: true } });
    if (!created) return (await this.d.conversations.findByChat("site", "", chatId))!;
    // Пока отвечает помощник, менеджерам в «Открытых» беседа не нужна; вопрос к менеджеру её откроет.
    await this.d.conversations.setStatus(created.id, "closed");
    return { ...created, status: "closed" as const };
  }

  async ask(input: HelpAsk): Promise<HelpResult> {
    const now = this.d.clock.now();
    const path = input.place?.path || `/books/${input.book.id}`;
    const conv = await this.conversation(input.user, path);
    const question = input.question.trim();
    const text = questionWithPlace(question || "?", input.place);
    await this.d.messages.insertIncoming(conv.id, { externalId: `help:${this.d.uuid()}`, channelId: "", chatType: "site", chatId: conv.chatId, at: now, isEcho: false, type: "text", text, mediaUrl: null, contactName: input.user.name.slice(0, 80), avatarUrl: null, status: null }, null);
    const waiting = !!conv.awaitingSince;
    const meta = { bookId: input.book.id, tab: tabOfPath(path), place: placeLine(input.place) || null };

    // Менеджер уже в беседе — помощник не перебивает.
    const { human } = await this.d.messages.lastOutgoing(conv.id, new Date(now.getTime() - HELP_HUMAN_ACTIVE_MS));
    if (human) {
      await this.d.conversations.recordIncoming(conv.id, preview(text), now);
      if (!waiting) await this.alert(conv, input, "human", question);
      this.d.live.chatChanged(conv.id);
      await this.d.store.log(conv.id, { reason: "manager", lang: input.uiLang, messageId: null, meta });
      return this.result(conv.id, "manager", null, []);
    }

    let decision: HelpDecision | null = null;
    let served: RouteServed | null = null;
    let problems: string[] = [];
    let failure: string | null = null;
    if (input.human) decision = { language: input.uiLang, action: "handoff", handoff: "human", reply: HUMAN[input.uiLang], suggestions: [] };
    else if (!this.d.model || !(await this.d.model.configured().catch(() => false))) failure = "модель не подключена";
    else if (await this.overBudget(now)) failure = "суточный потолок расходов помощника";
    else {
      const history = (await this.d.store.thread(conv.id, HELP_HISTORY + 1)).slice(0, -1).map((m) => ({ from: m.from, text: splitPlace(m.text).text || m.text }));
      for (let attempt = 0; attempt < 2 && !decision; attempt++) {
        try {
          const res = await this.d.model.complete({
            system: this.#system[input.uiLang],
            cachePrefix: this.#system[input.uiLang],
            user: helpUserPrompt({ book: input.bookText, history, place: input.place, placeDetails: input.placeDetails, question, uiLang: input.uiLang, problems }),
            schema: helpSchema(),
            timeoutMs: HELP_TIMEOUT_MS,
          });
          served = addServed(served, res.served ?? null);
          const d = parseHelpDecision(res.text);
          if (!d) {
            failure = "ответ модели не по схеме";
            continue;
          }
          const p = helpReplyProblems(d.reply);
          if (p.length && attempt === 0) {
            problems = p;
            continue;
          }
          // Со второго раза всё ещё нарушает правила — не отправляем, вопрос к менеджеру.
          decision = p.length ? null : d;
          if (p.length) failure = `ответ нарушил правила: ${p.join("; ")}`;
          break;
        } catch (err) {
          failure = err instanceof Error ? err.message.slice(0, 200) : "сбой модели";
          this.d.logger.error("help model", err);
          break;
        }
      }
    }
    decision ??= { language: input.uiLang, action: "handoff", handoff: "unknown", reply: FALLBACK[input.uiLang], suggestions: [] };

    const sent = await this.d.chats.send(conv.id, decision.reply, null, "bot");
    if (decision.action === "handoff") {
      await this.d.conversations.recordIncoming(conv.id, preview(text), now);
      if (!waiting) await this.alert(conv, input, decision.handoff, question);
    } else if (waiting) await this.d.conversations.recordIncoming(conv.id, preview(text), now);
    else await this.d.conversations.recordHistory(conv.id, preview(text), now);
    this.d.live.chatChanged(conv.id);
    await this.d.store.log(conv.id, {
      reason: decision.action === "handoff" ? decision.handoff : "none",
      lang: decision.language,
      messageId: sent.id,
      meta: { ...meta, ...(served ? { costUsd: served.costUsd ?? 0, model: served.model, provider: served.provider, ms: served.ms, usage: served.usage } : {}), ...(problems.length ? { problems } : {}), ...(failure ? { failure } : {}) },
    });
    return this.result(conv.id, decision.action === "handoff" ? "handoff" : "answered", decision.action === "handoff" ? decision.handoff : null, decision.suggestions);
  }

  private async result(conversationId: string, outcome: HelpOutcome, handoff: HelpHandoff | null, suggestions: string[]): Promise<HelpResult> {
    return { outcome, handoff, suggestions, messages: await this.d.store.thread(conversationId, 60) };
  }

  /** Вопрос к менеджеру: ответственный беседы (или WhatsApp-чата клиента, или его сделки), уведомление и заметка в WhatsApp. */
  private async alert(conv: { id: string; assigneeId: string | null; clientId: string | null }, input: HelpAsk, reason: HelpHandoff, question: string) {
    try {
      const wa = conv.clientId ? await this.d.conversations.latestWhatsappOfClient(conv.clientId) : null;
      const deal = conv.clientId ? await this.d.sales.findOpenDeal({ clientId: conv.clientId, phone: null }) : null;
      const assignee = conv.assigneeId ?? wa?.assigneeId ?? deal?.assigneeId ?? null;
      if (assignee && !conv.assigneeId) await this.d.conversations.setAssignee(conv.id, assignee);
      const why = REASONS[reason] || REASONS.unknown;
      const where = placeLine(input.place).slice(PLACE_MARK.length);
      const asked = question ? `«${question.slice(0, 300)}»` : "без текста";
      await this.d.notifier.notify(assignee, "chats.view", { kind: "message", title: `Вопрос из кабинета: ${why}`, body: `${input.user.name || "Клиент"}: ${preview(question || where || "?")}`, link: `/admin/chats?c=${conv.id}` });
      if (wa)
        await this.d.chats.addInternalNote(
          wa.id,
          `🙋 Клиент спросил в кабинете книги «${input.book.title.slice(0, 80)}»${where ? ` (${where})` : ""}: ${asked}. Помощник передал вопрос: ${why}. Ответить можно в чате «Помощник в кабинете» (клиент увидит на сайте) или здесь.`,
          null,
          "bot",
        );
      if (wa) this.d.live.chatChanged(wa.id);
      this.d.live.notificationsChanged();
    } catch (err) {
      this.d.logger.error("help alert", err);
    }
  }

  /** Потолок расходов за сутки (UTC): по журналу ходов, не чаще раза в минуту. */
  private async overBudget(now: Date): Promise<boolean> {
    const day = dayStart(now).toISOString();
    if (!this.#spent || this.#spent.day !== day || now.getTime() - this.#spent.at > 60_000) {
      const usd = await this.d.store.spentSince(dayStart(now)).catch(() => 0);
      this.#spent = { at: now.getTime(), day, usd };
    }
    return this.#spent.usd >= HELP_DAILY_USD;
  }
}

/** Две попытки хода — одна стоимость: токены и деньги складываются. */
function addServed(a: RouteServed | null, b: RouteServed | null): RouteServed | null {
  if (!a || !b) return a ?? b;
  const u = (k: keyof RouteServed["usage"]) => a.usage[k] + b.usage[k];
  return { ...b, ms: a.ms + b.ms, costUsd: a.costUsd === null || b.costUsd === null ? (a.costUsd ?? b.costUsd) : a.costUsd + b.costUsd, usage: { input: u("input"), output: u("output"), cacheRead: u("cacheRead"), cacheWrite: u("cacheWrite") } };
}
