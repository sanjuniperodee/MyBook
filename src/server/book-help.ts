import "server-only";
import { HttpError } from "@/server/api";
import { rateLimit } from "@/server/rateLimit";
import { hitClientAi } from "@/server/clientAiLimits";
import { container } from "@/server/container";
import { helpBookFacts } from "@/server/helpBook";
import { splitPlace, type HelpPlace } from "@/modules/messaging/domain/cabinetHelp";
import type { HelpThreadMessage } from "@/modules/messaging";
import type { Locale } from "@/i18n/config";

/**
 * Помощник по книге в кабинете — одна логика для виджета сайта (/api/books/[id]/help) и приложения (API v1
 * cabinetHelp, cabinetHelpAsk): беседа, подсказки пустого чата, вопрос с лимитами и передачей менеджеру.
 */

type HelpBook = { id: string; title: string; status: string; userId: string };

/** Сообщения беседы для виджета: строка «где клиент» отдельно от вопроса. */
export const helpView = (list: HelpThreadMessage[]) => list.map((m) => ({ id: m.id, from: m.from, at: m.at, ...splitPlace(m.text) }));

/** Что подсказать клиенту в пустом чате по его книге (ключи вопросов-подсказок в словаре виджета). */
async function bookHints(book: { id: string; status: string }) {
  const [built, stats] = await Promise.all([container().previews.current(book.id).catch(() => null), container().authoring.queries.stats(book as never).catch(() => null)]);
  const hints: string[] = [];
  if (book.status !== "draft") hints.push("ordered");
  if (built?.pages.some((p) => p.kind === "blank")) hints.push("blankPages");
  if (stats && stats.answered === 0) hints.push("start");
  return hints;
}

/** Беседа клиента с помощником: открыт ли он, сообщения и подсказки для пустого чата. */
export async function helpThread(book: HelpBook, userId: string) {
  const help = container().messaging;
  const [config, messages, hints] = await Promise.all([help.helpConfig(), help.help.thread(book.userId === userId ? userId : book.userId), bookHints(book)]);
  return { enabled: config.enabled, whatsapp: config.whatsapp, messages: helpView(messages), hints };
}

/**
 * Вопрос помощнику: ответ модели по справочнику кабинета и книге клиента — сразу; вопрос о деньгах, сроках, правке за
 * клиента или без ответа в справочнике — менеджеру. Защита: только владелец книги, частота и суточные потолки.
 */
export async function helpAsk(book: HelpBook, user: { id: string; name: string | null }, input: { text: string; place: HelpPlace | null; human?: boolean }, locale: Locale) {
  // Сотрудник, открывший книгу клиента, в беседу клиента не пишет: беседа — от имени клиента.
  if (book.userId !== user.id) throw new HttpError(403, "forbidden");
  if (!input.text && !input.place && !input.human) throw new HttpError(400, "badRequest");
  const messaging = container().messaging;
  if (!(await messaging.helpConfig()).enabled) throw new HttpError(503, "helpOff");
  // Не чаще раза в 3 секунды; окна и лимиты на клиента — «Лимиты AI»; общий потолок на всех — защита от счёта модели.
  if (!(await rateLimit(`help:${user.id}`, 1, 3_000))) throw new HttpError(429, "helpRate");
  const hit = await hitClientAi("help", user.id);
  if (hit === "short") throw new HttpError(429, "helpRate");
  if (hit === "long" || !(await rateLimit("help-day:all", 3_000, 86_400_000))) throw new HttpError(429, "helpDaily");

  const facts = input.human ? null : await helpBookFacts(book as never);
  // Метка места (фото, ответ, страница); без неё на странице «Текст» — открытый вопрос.
  const anchor = input.place?.anchor || "";
  const result = await messaging.help.ask({
    user: { id: user.id, name: user.name ?? "" },
    book: { id: book.id, title: book.title },
    bookText: facts?.text ?? "",
    question: input.text,
    place: input.place,
    placeDetails: anchor && facts ? facts.detail(anchor) : undefined,
    uiLang: locale,
    human: input.human,
  });
  return { outcome: result.outcome, handoff: result.handoff, suggestions: result.suggestions, messages: helpView(result.messages) };
}
