import { NextResponse } from "next/server";
import { api, apiBook, checkOrigin, HttpError } from "@/server/api";
import { idParams } from "@/server/input";
import { appendChunk, findBookFile, fileView, finishUpload, removeFile } from "@/server/answerFiles";
import { kickAnswerFiles } from "@/server/answerFilesWorker";
import { FILE_CHUNK_BYTES } from "@/lib/book/answer-files";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

async function load(req: Request, ctx: Ctx, editable: boolean) {
  const { id, fileId } = idParams(await ctx.params, "id", "fileId");
  const { book } = await apiBook(req, id, { editable });
  const file = await findBookFile(book.id, fileId);
  if (!file) throw new HttpError(404, "fileNotFound");
  return file;
}

/** Состояние файла: редактор спрашивает, пока файл обрабатывается. */
export const GET = api(async (req, ctx: Ctx) => NextResponse.json({ file: fileView(await load(req, ctx, false)) }));

/** Кусок исходника (тело — байты) по смещению ?offset=. Ответ — сколько байт сервер уже получил. */
export const PUT = api(async (req, ctx: Ctx) => {
  checkOrigin(req);
  const file = await load(req, ctx, true);
  const offset = Number(new URL(req.url).searchParams.get("offset"));
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > FILE_CHUNK_BYTES) throw new HttpError(413, "fileChunk");
  const bytes = Buffer.from(await req.arrayBuffer());
  return NextResponse.json({ received: await appendChunk(file, offset, bytes) });
});

/** Загрузка закончена — файл встаёт в очередь на обработку. */
export const POST = api(async (req, ctx: Ctx) => {
  checkOrigin(req);
  const file = await finishUpload(await load(req, ctx, true));
  kickAnswerFiles();
  return NextResponse.json({ file: fileView(file) });
});

/** Удалить файл (и загрузку, которую остановили). */
export const DELETE = api(async (req, ctx: Ctx) => {
  checkOrigin(req);
  await removeFile(await load(req, ctx, true));
  return NextResponse.json({ ok: true });
});
