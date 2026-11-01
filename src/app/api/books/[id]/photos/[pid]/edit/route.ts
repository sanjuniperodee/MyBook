import { NextResponse } from "next/server";
import { api, apiViewer, HttpError } from "@/server/api";
import { rateLimit } from "@/server/rateLimit";
import { container } from "@/server/container";
import { idParams } from "@/server/input";
import { MAX_EDIT_BYTES, parsePhotoEdit } from "@/lib/photo-edit/doc";

type Ctx = { params: Promise<{ id: string; pid: string }> };

/** Строка фото после правки — ответ сохранения и отмены (как у поворота). */
async function photoRow(bookId: string, photoId: string) {
  return (await container().authoring.queries.photos(bookId)).find((p) => p.id === photoId);
}

/** Правка редактора фото: описание (null — не правили) и версия файла. */
export const GET = api(async (req, { params }: Ctx) => {
  const { id, pid } = idParams(await params, "id", "pid");
  const { viewer } = await apiViewer(req, id);
  return NextResponse.json(await container().authoring.photos.editState(id, viewer, pid));
});

/** Сохранить правку: готовая картинка (image), описание (edit, JSON) и версия файла, с которого начали (version). */
export const POST = api(async (req, { params }: Ctx) => {
  const { id, pid } = idParams(await params, "id", "pid");
  const { user, viewer } = await apiViewer(req, id);
  if (!(await rateLimit(`photo-edit:${user.id}`, 120, 3600_000))) throw new HttpError(429, "photosRate");
  const form = await req.formData();
  const image = form.get("image");
  const raw = form.get("edit");
  const version = form.get("version");
  if (!(image instanceof File) || typeof raw !== "string" || typeof version !== "string" || raw.length > MAX_EDIT_BYTES) throw new HttpError(400, "photoEditInvalid");
  let doc: ReturnType<typeof parsePhotoEdit> = null;
  try {
    doc = parsePhotoEdit(JSON.parse(raw));
  } catch {
    doc = null;
  }
  if (!doc) throw new HttpError(400, "photoEditInvalid");
  await container().authoring.photos.saveEdit(id, viewer, pid, {
    bytes: Buffer.from(await image.arrayBuffer()),
    doc,
    version,
  });
  return NextResponse.json({ photo: await photoRow(id, pid), edited: true });
});

/** «Вернуть оригинал». */
export const DELETE = api(async (req, { params }: Ctx) => {
  const { id, pid } = idParams(await params, "id", "pid");
  const { viewer } = await apiViewer(req, id);
  await container().authoring.photos.revertEdit(id, viewer, pid);
  return NextResponse.json({ photo: await photoRow(id, pid), edited: false });
});
