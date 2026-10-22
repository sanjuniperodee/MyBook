import { NextResponse } from "next/server";
import { idParams } from "@/server/input";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";
import { photoPatchSchema } from "../patch";

type Ctx = { params: Promise<{ id: string; pid: string }> };

const row = async (bookId: string, photoId: string) => (await container().authoring.queries.photos(bookId)).find((p) => p.id === photoId);

export const PATCH = api(async (req, { params }: Ctx) => {
  const { id, pid } = idParams(await params, "id", "pid");
  const { viewer } = await apiViewer(req, id);
  await container().authoring.photos.update(id, viewer, pid, photoPatchSchema.parse(await req.json()));
  return NextResponse.json({ photo: await row(id, pid) });
});

export const DELETE = api(async (req, { params }: Ctx) => {
  const { id, pid } = idParams(await params, "id", "pid");
  const { viewer } = await apiViewer(req, id);
  await container().authoring.photos.delete(id, viewer, pid);
  return NextResponse.json({ ok: true });
});
