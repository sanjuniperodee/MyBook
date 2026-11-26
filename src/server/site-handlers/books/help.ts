import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiBook, checkOrigin } from "@/server/api";
import { idParams } from "@/server/input";
import { getLocale } from "@/i18n/server";
import { helpAsk, helpThread } from "@/server/book-help";
import { HELP_QUESTION_MAX, parseHelpPlace } from "@/modules/messaging/domain/cabinetHelp";

/** Беседа клиента с помощником: открыт ли он, сообщения и подсказки для пустого чата (src/server/book-help.ts). */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { user, book } = await apiBook(req, id);
  return NextResponse.json(await helpThread(book, user.id), { headers: { "cache-control": "no-store" } });
});

const body = z.object({
  text: z.string().trim().max(HELP_QUESTION_MAX, "helpRate").default(""),
  place: z.unknown().optional(),
  /** «Позвать менеджера» — без модели. */
  human: z.boolean().optional(),
});

/** Вопрос помощнику — логика и защита в src/server/book-help.ts (общая с приложением). */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  checkOrigin(req);
  const { id } = idParams(await params, "id");
  const { user, book } = await apiBook(req, id);
  const input = body.parse(await req.json());
  return NextResponse.json(await helpAsk(book, user, { text: input.text, place: parseHelpPlace(input.place), human: input.human }, await getLocale()));
});
