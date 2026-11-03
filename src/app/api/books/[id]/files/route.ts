import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiBook, checkOrigin, HttpError } from "@/server/api";
import { rateLimit } from "@/server/rateLimit";
import { idParams } from "@/server/input";
import { container } from "@/server/container";
import { bookFileQuota, fileView, listBookFiles, mediaPackOffers, startUpload } from "@/server/answerFiles";
import { FILE_CHUNK_BYTES, MAX_SOURCE_BYTES } from "@/lib/book/answer-files";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Свои видео и аудио книги: лимит минут, файлы и пакеты минут (только если продаются — иначе пусто, и редактор не
 * показывает ни цен, ни предложений). kaspi — можно ли оплатить пакет прямо в редакторе.
 */
export const GET = api(async (req, { params }: Ctx) => {
  const { id } = idParams(await params, "id");
  const { book } = await apiBook(req, id);
  const [quota, files, packs] = await Promise.all([bookFileQuota(book.id), listBookFiles(book.id), mediaPackOffers()]);
  const kaspi = packs.length ? await container().ordering.kaspi.available() : false;
  return NextResponse.json({ quota, files: files.map(fileView), packs: kaspi ? packs : [] });
});

const body = z.object({
  name: z.string().trim().min(1).max(300),
  size: z.number().int().min(1).max(MAX_SOURCE_BYTES * 2),
  type: z.string().max(200).default(""),
  /** Длительность, которую узнал браузер (секунды); null — не узнал. */
  durationSec: z.number().min(0).max(24 * 3600).nullable().default(null),
});

/** Начать загрузку файла: проверки и место под исходник. Дальше — куски PUT …/files/<id>?offset=, затем POST …/files/<id>. */
export const POST = api(async (req, { params }: Ctx) => {
  checkOrigin(req);
  const { id } = idParams(await params, "id");
  const { user, book } = await apiBook(req, id, { editable: true });
  if (!(await rateLimit(`answer-file:${user.id}`, 30, 3600_000))) throw new HttpError(429, "fileRate");
  const input = body.parse(await req.json());
  const file = await startUpload({ bookId: book.id, userId: user.id, name: input.name, size: input.size, mime: input.type, declaredSec: input.durationSec });
  return NextResponse.json({ file: fileView(file), chunkBytes: FILE_CHUNK_BYTES });
});
