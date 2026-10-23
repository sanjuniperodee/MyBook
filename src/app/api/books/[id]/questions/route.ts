import { NextResponse } from "next/server";
import { z } from "zod";
import { SECTION_PROMPT_MAX, SECTION_TITLE_MAX } from "@/lib/content/kinds";
import { idParams, uuid } from "@/server/input";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";

/** Свой вопрос в книге с банком: сразу после указанного, в ту же главу; текст вопроса — он же заголовок в книге. */
const customSchema = z
  .object({
    afterId: uuid,
    prompt: z.string().trim().min(3, "questionEmpty").max(200),
  })
  .strict();

/** Раздел своей книги: в главе chapterKey после afterId (или в конец главы); заголовок в книге и подсказка для себя. */
const sectionSchema = z
  .object({
    chapterKey: uuid,
    afterId: uuid.nullish(),
    title: z.string().trim().max(SECTION_TITLE_MAX, "sectionTitleTooLong"),
    prompt: z.string().trim().max(SECTION_PROMPT_MAX),
  })
  .strict();

/**
 * Новый вопрос. Форма с chapterKey — раздел своей книги (в книгах с банком — 409 outlineNotAllowed), ответ — раздел
 * и актуальное оглавление. Прежняя форма {afterId, prompt} — свой вопрос в книге с банком (в своей книге — 409).
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { viewer } = await apiViewer(req, id);
  const body: unknown = await req.json();
  const authoring = container().authoring;
  if (body && typeof body === "object" && "chapterKey" in body) {
    const input = sectionSchema.parse(body);
    const { id: qid, outline } = await authoring.outline.addSection(id, viewer, input);
    const question = (await authoring.queries.questions(id)).find((q) => q.id === qid);
    return NextResponse.json({ question, outline });
  }
  const { afterId, prompt } = customSchema.parse(body);
  const qid = await authoring.questions.addCustom(id, viewer, afterId, prompt);
  const question = (await authoring.queries.questions(id)).find((q) => q.id === qid);
  return NextResponse.json({ question });
});
