import { NextResponse } from "next/server";
import { api, apiBook, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

/**
 * Состояние экранной сборки книги (BookBuildState): готова — манифест полос и адрес картинок; нет — сборка
 * запускается в фоне, ответ сразу («собирается» с прошлой готовой сборкой, пока её полосы можно показывать).
 * ?retry=1 — кнопка «Попробовать снова»: снимает паузу после сбоя (не чаще раза в минуту на книгу); опрос его не шлёт.
 */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  await apiBook(req, id);
  const retry = new URL(req.url).searchParams.get("retry") === "1";
  const state = await container().previews.build(id, { retry });
  if (!state) throw new HttpError(404, "bookNotFound");
  return NextResponse.json(state, { headers: { "Cache-Control": "private, no-store" } });
});
