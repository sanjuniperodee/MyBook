import { NextResponse } from "next/server";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";

type Ctx = { params: Promise<{ id: string; pid: string }> };

/** Поворачивает сам файл на 90° по часовой стрелке (и превью), точка фокуса поворачивается вместе с ним. */
export const POST = api(async (req, { params }: Ctx) => {
  const { id, pid } = await params;
  const { viewer } = await apiViewer(req);
  const authoring = container().authoring;
  await authoring.photos.rotate(id, viewer, pid);
  return NextResponse.json({ photo: (await authoring.queries.photos(id)).find((p) => p.id === pid) });
});
