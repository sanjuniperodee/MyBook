import "server-only";
import { HttpError } from "@/server/api";
import { rateLimit } from "@/server/rateLimit";
import { hitClientAi } from "@/server/clientAiLimits";
import { container } from "@/server/container";
import { helpBookFacts } from "@/server/helpBook";
import { splitPlace, type HelpPlace } from "@/modules/messaging/domain/cabinetHelp";
import { HelpActionError, type HelpBookEditor, type HelpThreadMessage } from "@/modules/messaging";
import { HELP_EDITS_LOCKED, type HelpEditPlan } from "@/modules/messaging/domain/cabinetHelpActions";
import type { Locale } from "@/i18n/config";

/**
 * Помощник по книге в кабинете — одна логика для виджета сайта (/api/books/[id]/help) и приложения (API v1
 * cabinetHelp, cabinetHelpAsk): беседа, подсказки пустого чата, вопрос с лимитами и передачей менеджеру.
 */

type HelpBook = { id: string; title: string; status: string; userId: string };

/** Сообщения беседы для виджета: строка «где клиент» отдельно от вопроса. */
export const helpView = (list: HelpThreadMessage[]) => list.map((m) => ({ id: m.id, from: m.from, at: m.at, ...splitPlace(m.text), ...(m.action ? { action: m.action } : {}) }));

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
export async function helpAsk(book: HelpBook, user: { id: string; name: string | null }, input: { text: string; place: HelpPlace | null; human?: boolean }, locale: Locale, opts: { actions?: boolean } = {}) {
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
    // Правки за клиента — только с сайта (там карточка «Применить»), и только пока книга не заказана.
    edit: !opts.actions || !facts ? undefined : book.status !== "draft" ? { unavailable: HELP_EDITS_LOCKED } : facts.edit,
  });
  return { outcome: result.outcome, handoff: result.handoff, suggestions: result.suggestions, messages: helpView(result.messages), proposal: result.proposal ?? null };
}

/** Книга для правок помощника: свежая книга и штатные сервисы редактора с правами владельца. */
function bookEditor(bookId: string, userId: string): HelpBookEditor {
  const viewer = { userId, isStaff: false, staffEdits: false };
  return {
    async state() {
      const fresh = await container().authoring.queries.book(bookId);
      if (!fresh) throw new HelpActionError("notFound");
      return (await helpBookFacts(fresh as never)).edit.book;
    },
    async apply(plan: HelpEditPlan) {
      const a = container().authoring;
      if (plan.photos.length) await a.photos.batch(bookId, viewer, plan.photos);
      if (plan.order) await a.photos.reorder(bookId, viewer, plan.order);
      if (Object.keys(plan.settings).length) await a.books.updateSettings(bookId, viewer, plan.settings, a.photoRepository);
    },
  };
}

/**
 * «Применить» / «Не нужно» у правки, которую предложил помощник. Только владелец книги (как в редакторе: сотрудник
 * правит книгу клиента в своём редакторе, не через чат клиента); книга не заказана — иначе bookLocked.
 */
export async function helpApply(book: HelpBook, user: { id: string }, input: { proposal: string; decline?: boolean }, locale: Locale) {
  if (book.userId !== user.id) throw new HttpError(403, "forbidden");
  if (!(await rateLimit(`help-apply:${user.id}`, 1, 1_500))) throw new HttpError(429, "helpRate");
  try {
    const result = await container().messaging.help.apply({ user: { id: user.id }, book: { id: book.id }, proposalId: input.proposal, decline: input.decline, uiLang: locale, editor: bookEditor(book.id, user.id) });
    return { outcome: result.outcome, proposal: result.proposal ?? null, messages: helpView(result.messages) };
  } catch (err) {
    if (err instanceof HelpActionError) throw err.code === "bookLocked" ? new HttpError(409, "bookLocked") : new HttpError(404, "helpActionGone");
    throw err;
  }
}
