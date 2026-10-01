import { NextResponse } from "next/server";
import { api, apiViewer, HttpError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { getMessages } from "@/i18n/server";
import { MAX_PHOTOS, AuthoringError } from "@/modules/authoring";
import { container } from "@/server/container";

export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, viewer } = await apiViewer(req);
  if (!(await rateLimit(`upload:${user.id}`, 60, 3600_000))) throw new HttpError(429, "photosRate");
  const form = await req.formData();
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .map((f) => ({ name: f.name, size: f.size, bytes: async () => Buffer.from(await f.arrayBuffer()) }));
  const authoring = container().authoring;
  let result;
  try {
    result = await authoring.photos.upload(id, viewer, files);
  } catch (err) {
    if (AuthoringError.is(err) && err.code === "photosLimit") throw new HttpError(400, "photosLimit", MAX_PHOTOS);
    throw err;
  }
  const t = (await getMessages()).api;
  const rows = await authoring.queries.photos(id);
  const createdIds = new Set(result.created.map((p) => p.id));
  return NextResponse.json({ photos: rows.filter((p) => createdIds.has(p.id)), errors: result.failed.map((f) => (f.reason === "tooBig" ? t.photoTooBig(f.name) : t.photoFormat(f.name))) });
});
