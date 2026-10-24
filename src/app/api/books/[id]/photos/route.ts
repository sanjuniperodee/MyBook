import { NextResponse } from "next/server";
import { api, apiViewer, HttpError } from "@/server/api";
import { rateLimit } from "@/server/rateLimit";
import { getMessages } from "@/i18n/server";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { user, viewer } = await apiViewer(req, id);
  if (!(await rateLimit(`upload:${user.id}`, 60, 3600_000))) throw new HttpError(429, "photosRate");
  const form = await req.formData();
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .map((f) => ({ name: f.name, size: f.size, bytes: async () => Buffer.from(await f.arrayBuffer()) }));
  const authoring = container().authoring;
  const result = await authoring.photos.upload(id, viewer, files);
  const t = (await getMessages()).api;
  const rows = await authoring.queries.photos(id);
  const createdIds = new Set(result.created.map((p) => p.id));
  return NextResponse.json({ photos: rows.filter((p) => createdIds.has(p.id)), errors: [...result.failed.map((f) => (f.reason === "tooBig" ? t.photoTooBig(f.name) : t.photoFormat(f.name))), ...result.damaged.map((name) => t.photoDamaged(name))] });
});
