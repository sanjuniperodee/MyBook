import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

/** Ключ главы: у темы — латиница и цифры («intro»), у своей книги — uuid. */
const chapterKey = z.string().regex(/^[\w-]{1,80}$/);
const schema = z.object({ key: chapterKey, beforeKey: chapterKey.nullable().optional(), afterKey: chapterKey.nullable().optional() }).strict();

/**
 * Перестановка главы: перед beforeKey, после afterKey или (без них) в конец книги. Для книг с темой и для своей книги;
 * редактор → список глав и «Страницы» → «Главы книги». Ответ — новый порядок ключей глав.
 */
export const PUT = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { viewer } = await apiViewer(req, id);
  const input = schema.parse(await req.json());
  const order = await container().authoring.questions.moveChapter(id, viewer, input);
  return NextResponse.json({ order });
});
