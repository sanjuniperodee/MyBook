import "server-only";
import { NextResponse } from "next/server";
import { QuestionPatch } from "@mybook/contracts";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

/**
 * Автосохранение. title и prompt — заголовок в книге и подсказка для себя у разделов своей книги (в остальных книгах —
 * 409 outlineNotAllowed); displayText и hideHeading своя книга не использует — сервер их там пропускает.
 * media — список QR-кодов ответа целиком (видео, музыка, свои файлы); ссылки приводит к одному виду домен (normalizeMedia).
 * Схема — из контракта API v1 (packages/contracts, QuestionPatch): та же, что у PATCH /api/v1/books/{id}/questions/{id}.
 */
const schema = QuestionPatch;

type Ctx = { params: Promise<{ id: string; qid: string }> };

/** Автосохранение ответа и заголовка вопроса (раздела). */
export const PATCH = api(async (req, { params }: Ctx) => {
  const { id, qid } = idParams(await params, "id", "qid");
  const { viewer } = await apiViewer(req, id);
  await container().authoring.questions.edit(id, viewer, qid, schema.parse(await req.json()));
  return NextResponse.json({ ok: true, updatedAt: new Date() });
});

/** Удаление своего вопроса (раздела своей книги). Своей книге ответ несёт актуальное оглавление, остальным outline — null. */
export const DELETE = api(async (req, { params }: Ctx) => {
  const { id, qid } = idParams(await params, "id", "qid");
  const { viewer } = await apiViewer(req, id);
  const outline = await container().authoring.questions.deleteCustom(id, viewer, qid);
  return NextResponse.json({ ok: true, outline });
});
