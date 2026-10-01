import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiViewer } from "@/server/api";
import { container } from "@/server/container";

/** Включает/выключает приём писем от близких по публичной ссылке. */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { viewer } = await apiViewer(req);
  const { enabled, regenerate } = z.object({ enabled: z.boolean(), regenerate: z.boolean().optional() }).parse(await req.json());
  return NextResponse.json({ token: await container().authoring.books.setLetterInvite(id, viewer, enabled, !!regenerate) });
});
