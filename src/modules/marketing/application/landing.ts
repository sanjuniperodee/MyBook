import type { Clock } from "@/shared/application";
import { isLandingCode, LANDING_MATCH_AFTER_MS, LANDING_MATCH_BEFORE_MS } from "@/shared/domain/landing";
import { isMetaAdDefaultText, isPreviewBot, linkCodeFromText, nearestFreeClick, visitAttribution, visitNote, type LandingMatch } from "../domain";
import type { LandingVisitInput, LandingVisitRepository } from "./ports";

/** Источник новой заявки по переходу с рекламного лендинга. */
export interface VisitAttribution {
  utm: Record<string, string>;
  note: string;
  match: LandingMatch;
}

/** Переходы на рекламные лендинги и привязка к ним новых диалогов WhatsApp. */
export class LandingService {
  constructor(
    private readonly visits: LandingVisitRepository,
    private readonly clock: Clock,
    private readonly timeZone: () => string,
  ) {}

  /** Заход на лендинг или нажатие «Написать в WhatsApp». Роботы превью ссылок (они и JS не исполняют) не считаются. */
  async record(input: LandingVisitInput, event: "view" | "click") {
    if (isPreviewBot(input.userAgent)) return;
    await this.visits.record(input, event === "click" ? this.clock.now() : null);
  }

  /**
   * Первое сообщение нового диалога → переход: по коду «(код: lp…)» в тексте, а если код стёрт (byTime) — по
   * ближайшему свободному нажатию WhatsApp перед сообщением (не тестовому и не для стандартного текста объявления Meta).
   * Чужой код (рекламная ссылка, виджет) — не наш случай.
   */
  async attribute(input: { text: string; at: Date; conversationId: string; byTime: boolean }): Promise<VisitAttribution | null> {
    const code = linkCodeFromText(input.text);
    if (code && !isLandingCode(code)) return null;
    if (code) {
      const v = await this.visits.byCode(code);
      if (v && (await this.visits.claim(v.id, input.conversationId, "code", this.clock.now(), false)))
        return { utm: visitAttribution(v) as Record<string, string>, note: visitNote(v, "code", input.at, this.timeZone()), match: "code" };
      // Код есть, а перехода нет (браузер не успел его записать) — ищем по времени, как без кода.
    }
    // Стандартный текст кнопки объявления Meta — человек пришёл из рекламы напрямую, не с лендинга.
    if (!input.byTime || isMetaAdDefaultText(input.text)) return null;
    let free = await this.visits.freeClicks(new Date(input.at.getTime() - LANDING_MATCH_BEFORE_MS), new Date(input.at.getTime() + LANDING_MATCH_AFTER_MS));
    // Два диалога в одну минуту: ближайшее нажатие уже взял другой — берём следующее.
    for (;;) {
      const v = nearestFreeClick(free, input.at);
      if (!v) return null;
      if (await this.visits.claim(v.id, input.conversationId, "time", this.clock.now(), true))
        return { utm: visitAttribution(v) as Record<string, string>, note: visitNote(v, "time", input.at, this.timeZone()), match: "time" };
      free = free.filter((x) => x !== v);
    }
  }
}
