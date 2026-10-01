import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiViewer } from "@/lib/api";
import { container } from "@/server/container";

export const PUT = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { viewer } = await apiViewer(req);
  const { ids } = z.object({ ids: z.array(z.string().uuid()).max(500) }).parse(await req.json());
  await container().authoring.photos.reorder(id, viewer, ids);
  return NextResponse.json({ ok: true });
});
