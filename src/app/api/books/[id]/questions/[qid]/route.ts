import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_MEDIA, MEDIA_TITLE_MAX, MEDIA_URL_MAX } from "@/lib/book/answer-media";
import { SECTION_PROMPT_MAX, SECTION_TITLE_MAX } from "@/lib/content/kinds";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

/**
 * Автосохранение. title и prompt — заголовок в книге и подсказка для себя у разделов своей книги (в остальных книгах —
 * 409 outlineNotAllowed); displayText и hideHeading своя книга не использует — сервер их там пропускает.
 * media — список QR-кодов ответа целиком (видео и музыка); ссылки приводит к одному виду домен (normalizeMedia).
 */
const media = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(["video", "music"]),
  url: z.string().trim().min(1).max(MEDIA_URL_MAX * 2),
  title: z.string().max(MEDIA_TITLE_MAX * 2),
  anchor: z.number().int().min(-1).max(10_000).nullable(),
});

const schema = z
  .object({
    answer: z.string().max(40_000, "answerTooLong"),
    displayText: z.string().trim().max(200).nullable(),
    hideHeading: z.boolean(),
    pageBreak: z.boolean(),
    media: z.array(media).max(MAX_MEDIA, "tooManyMedia"),
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
