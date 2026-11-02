import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiBook, checkOrigin, HttpError } from "@/server/api";
import { rateLimit } from "@/server/rateLimit";
import { container } from "@/server/container";
import { idParams } from "@/server/input";
import { getLocale } from "@/i18n/server";
import { helpBookFacts } from "@/server/helpBook";
import { HELP_QUESTION_MAX, parseHelpPlace, splitPlace } from "@/modules/messaging/domain/cabinetHelp";
import type { HelpThreadMessage } from "@/modules/messaging";

export const maxDuration = 60;

/** Сообщения беседы для виджета: строка «где клиент» отдельно от вопроса. */
const view = (list: HelpThreadMessage[]) => list.map((m) => ({ id: m.id, from: m.from, at: m.at, ...splitPlace(m.text) }));

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
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { user, book } = await apiBook(req, id);
  const help = container().messaging;
  const [config, messages, hints] = await Promise.all([help.helpConfig(), help.help.thread(book.userId === user.id ? user.id : book.userId), bookHints(book)]);
  return NextResponse.json({ enabled: config.enabled, whatsapp: config.whatsapp, messages: view(messages), hints }, { headers: { "cache-control": "no-store" } });
});

const body = z.object({
  text: z.string().trim().max(HELP_QUESTION_MAX, "helpRate").default(""),
  place: z.unknown().optional(),
  /** «Позвать менеджера» — без модели. */
  human: z.boolean().optional(),
});

/**
 * Вопрос помощнику: ответ модели по справочнику кабинета и книге клиента — сразу; вопрос о деньгах, сроках, правке за
 * клиента или без ответа в справочнике — менеджеру (беседа в CRM, уведомление). Спрашивать можно и о заказанной книге.
 * Защита: только владелец книги, частота (раз в 3 секунды, 20 за 10 минут, 60 в сутки на клиента, общий суточный
 * потолок) и суточный потолок расходов на модель в сервисе.
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  checkOrigin(req);
  const { id } = idParams(await params, "id");
  const { user, book } = await apiBook(req, id);
  // Сотрудник, открывший книгу клиента, в беседу клиента не пишет: беседа — от имени клиента.
  if (book.userId !== user.id) throw new HttpError(403, "forbidden");
  const input = body.parse(await req.json());
  const place = parseHelpPlace(input.place);
  if (!input.text && !place && !input.human) throw new HttpError(400, "badRequest");
  const messaging = container().messaging;
  if (!(await messaging.helpConfig()).enabled) throw new HttpError(503, "helpOff");
  if (!(await rateLimit(`help:${user.id}`, 1, 3_000)) || !(await rateLimit(`help10:${user.id}`, 20, 600_000))) throw new HttpError(429, "helpRate");
  if (!(await rateLimit(`help-day:${user.id}`, 60, 86_400_000)) || !(await rateLimit("help-day:all", 3_000, 86_400_000))) throw new HttpError(429, "helpDaily");

  const locale = await getLocale();
  const facts = input.human ? null : await helpBookFacts(book);
  // Метка места (фото, ответ, страница); без неё на странице «Текст» — открытый вопрос (?s=<id> в адресе).
  const anchor = place?.anchor || "";
  const result = await messaging.help.ask({
    user: { id: user.id, name: user.name ?? "" },
    book: { id: book.id, title: book.title },
    bookText: facts?.text ?? "",
    question: input.text,
    place,
    placeDetails: anchor && facts ? facts.detail(anchor) : undefined,
    uiLang: locale === "kk" ? "kk" : "ru",
    human: input.human,
  });
  return NextResponse.json({ outcome: result.outcome, handoff: result.handoff, suggestions: result.suggestions, messages: view(result.messages) });
});
