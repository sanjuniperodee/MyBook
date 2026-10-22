import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_PHOTOS } from "@/modules/authoring/domain/Photo";
import { idParams, uuid } from "@/server/input";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";
import { photoPatchSchema } from "../patch";

const schema = z.object({ updates: z.array(z.object({ id: uuid, patch: photoPatchSchema }).strict()).min(1).max(MAX_PHOTOS) }).strict();

/**
 * Правки нескольких фото одной транзакцией (те же правила, что у PATCH …/photos/[pid]); в ответ — строки этих фото
 * и версия правил раскладки книги (пакет переводит книгу на правила 2).
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { viewer } = await apiViewer(req, id);
  const { updates } = schema.parse(await req.json());
  const authoring = container().authoring;
  await authoring.photos.batch(id, viewer, updates);
  const ids = new Set(updates.map((u) => u.id));
  const [rows, book] = await Promise.all([authoring.queries.photos(id), authoring.queries.book(id)]);
  return NextResponse.json({ photos: rows.filter((p) => ids.has(p.id)), layoutRev: book?.layoutRev });
});
