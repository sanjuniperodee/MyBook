import { NextResponse } from "next/server";
import { z } from "zod";
import { idParams, uuid } from "@/server/input";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";

export const PUT = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { viewer } = await apiViewer(req, id);
  const { ids } = z.object({ ids: z.array(uuid).max(500) }).parse(await req.json());
  await container().authoring.photos.reorder(id, viewer, ids);
  return NextResponse.json({ ok: true });
});
