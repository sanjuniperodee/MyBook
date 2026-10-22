import { NextResponse } from "next/server";
import { idParams } from "@/server/input";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";
import { photoPatchSchema } from "../patch";

type Ctx = { params: Promise<{ id: string; pid: string }> };

/** В ответ правки — строка фото и версия правил раскладки книги: правка места могла перевести книгу на правила 2. */
export const PATCH = api(async (req, { params }: Ctx) => {
  const { id, pid } = idParams(await params, "id", "pid");
  const { viewer } = await apiViewer(req, id);
  const authoring = container().authoring;
  await authoring.photos.update(id, viewer, pid, photoPatchSchema.parse(await req.json()));
  const [rows, book] = await Promise.all([authoring.queries.photos(id), authoring.queries.book(id)]);
  return NextResponse.json({ photo: rows.find((p) => p.id === pid), layoutRev: book?.layoutRev });
});

export const DELETE = api(async (req, { params }: Ctx) => {
  const { id, pid } = idParams(await params, "id", "pid");
  const { viewer } = await apiViewer(req, id);
  await container().authoring.photos.delete(id, viewer, pid);
  return NextResponse.json({ ok: true });
});
