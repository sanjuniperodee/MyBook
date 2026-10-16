import { NextResponse } from "next/server";
import { z } from "zod";
import { SECTION_PROMPT_MAX, SECTION_TITLE_MAX } from "@/lib/content/kinds";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

/**
 * Автосохранение. title и prompt — заголовок в книге и подсказка для себя у разделов своей книги (в остальных книгах —
 * 409 outlineNotAllowed); displayText и hideHeading своя книга не использует — сервер их там пропускает.
 */
const schema = z
  .object({
    answer: z.string().max(40_000, "answerTooLong"),
    displayText: z.string().trim().max(200).nullable(),
    hideHeading: z.boolean(),
    title: z.string().trim().max(SECTION_TITLE_MAX, "sectionTitleTooLong"),
    prompt: z.string().trim().max(SECTION_PROMPT_MAX),
  })
  .partial()
  .strict();

type Ctx = { params: Promise<{ id: string; qid: string }> };

/** Автосохранение ответа и заголовка вопроса (раздела). */
export const PATCH = api(async (req, { params }: Ctx) => {
  const { id, qid } = idParams(await params, "id", "qid");
  const { viewer } = await apiViewer(req);
  await container().authoring.questions.edit(id, viewer, qid, schema.parse(await req.json()));
  return NextResponse.json({ ok: true, updatedAt: new Date() });
});

/** Удаление своего вопроса (раздела своей книги). Своей книге ответ несёт актуальное оглавление, остальным outline — null. */
export const DELETE = api(async (req, { params }: Ctx) => {
  const { id, qid } = idParams(await params, "id", "qid");
  const { viewer } = await apiViewer(req);
  const outline = await container().authoring.questions.deleteCustom(id, viewer, qid);
  return NextResponse.json({ ok: true, outline });
});
