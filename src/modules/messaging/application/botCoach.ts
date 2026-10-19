import type { Clock, Logger } from "@/shared/application";
import { applyCoach, coachPrompt, coachSchema, parseCoachDecision, COACH_LOG, type CoachRun } from "../domain";
import type { BotCoachSource, BotLessonStore, BotSellerModel, BotSettings } from "./ports";

/** Разбор — раз в сутки, ночью (по времени магазина), когда бесед почти нет. */
const RUN_EVERY_MS = 20 * 3_600_000;
const NIGHT_FROM = 3;
const NIGHT_TO = 7;
/** Сколько бесед за раз (переписка уходит в модель одним запросом). */
const MAX_CONVERSATIONS = 25;
const COACH_TIMEOUT_MS = 120_000;

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    try {
      return m ? JSON.parse(m[0]) : null;
    } catch {
      return null;
    }
  }
};

/**
 * Работа над ошибками AI-продажника: раз в сутки ночью модель разбирает беседы бота за день и обновляет уроки — они
 * идут в инструкцию продажника со следующего хода. Код отбрасывает уроки с ценами, сроками и правилами безопасности;
 * владелец видит журнал и может удалить любой урок. Выключается в настройках («Учиться на своих ошибках»).
 */
export class BotCoach {
  constructor(
    private readonly d: {
      settings: BotSettings;
      seller: BotSellerModel | null;
      source: BotCoachSource;
      store: BotLessonStore;
      clock: Clock;
      logger: Logger;
      newId: () => string;
    },
  ) {}

  /** Пора ли разбор: ночь и с прошлого прошло больше 20 часов. force — кнопка «Разобрать сейчас». */
  private async due(last: Date | null, force: boolean) {
    if (force) return true;
    const now = this.d.clock.now();
    if (last && now.getTime() - last.getTime() < RUN_EVERY_MS) return false;
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: this.d.settings.timeZone(), hour: "2-digit", hourCycle: "h23" }).format(now));
    return hour >= NIGHT_FROM && hour < NIGHT_TO;
  }

  /** Один разбор; null — не пора, выключено или модели нет. */
  async run(opts: { force?: boolean } = {}): Promise<CoachRun | null> {
    const config = await this.d.settings.config();
    if (!config.sell.on || config.sell.engine !== "ai") return null;
    if (!config.sell.selfImprove && !opts.force) return null;
    if (!this.d.seller || !(await this.d.seller.configured().catch(() => false))) return null;
    const { lessons, log } = await this.d.store.load();
    const last = log[0]?.at ? new Date(log[0].at) : null;
    if (!(await this.due(last, !!opts.force))) return null;

    const now = this.d.clock.now();
    // С прошлого разбора (но не дальше трёх суток) или за последние сутки.
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const since = !opts.force && last && now.getTime() - last.getTime() < 3 * 86_400_000 ? last : dayAgo;
    const conversations = await this.d.source.recent(since, MAX_CONVERSATIONS);
    const record = async (run: CoachRun, next = lessons) => {
      await this.d.store.save(next, [run, ...log].slice(0, COACH_LOG));
      return run;
    };
    if (!conversations.length) return record({ at: now.toISOString(), reviewed: 0, added: [], removed: [], summary: "Бесед бота за период не было." });

    const { system, user } = coachPrompt({ conversations, lessons, botName: config.sell.botName, managerName: config.sell.managerName, pricesByBot: !config.sell.hidePrices, speaksAs: config.sell.speaksAs });
    let raw: string;
    try {
      raw = (await this.d.seller.complete({ system, user, schema: coachSchema() as unknown as Record<string, unknown>, timeoutMs: COACH_TIMEOUT_MS })).text;
    } catch (err) {
      this.d.logger.warn("bot coach", { error: String(err) });
      return record({ at: now.toISOString(), reviewed: conversations.length, added: [], removed: [], summary: "", error: `модель не ответила: ${String(err).slice(0, 200)}` });
    }
    const decision = parseCoachDecision(parseJson(raw));
    if (!decision) return record({ at: now.toISOString(), reviewed: conversations.length, added: [], removed: [], summary: "", error: "ответ модели не по схеме" });
    const applied = applyCoach(lessons, decision, now, this.d.newId);
    const summary = [decision.summary, applied.rejected.length ? `Отклонено кодом: ${applied.rejected.join("; ")}` : ""].filter(Boolean).join(" ").slice(0, 1200);
    return record({ at: now.toISOString(), reviewed: conversations.length, added: applied.added, removed: applied.removed, summary }, applied.lessons);
  }
}
