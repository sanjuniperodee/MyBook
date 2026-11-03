import "server-only";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db";
import { executor } from "@/shared/infrastructure/database";
import { answerFilePurchases, answerFiles, bookQuestions, books, type AnswerFileRow, type AnswerMedia } from "@/shared/infrastructure/db/schema";
import { deleteFile, deletePrefix, putFile, storagePath } from "@/shared/infrastructure/storage";
import { env } from "@/config/env";
import { getFreeMediaMinutes, getMediaPacks, type MediaPack } from "@/config/site";
import { ensureCatalog } from "@/server/catalog";
import { HttpError } from "@/server/api";
import { answerFileUrl, canUpload, FILE_CHUNK_BYTES, fileKindOf, fileQuota, MAX_FILES_PER_BOOK, MAX_SECONDS, MAX_SOURCE_BYTES, type AnswerFileView, type FileError, type FileKind, type FileQuota, type MediaPackOffer } from "@/lib/book/answer-files";

/**
 * Свои видео и аудио к ответам: загрузка кусками, учёт минут книги, покупки пакетов минут. Обработка — answerFilesWorker.
 *
 * Исходник пишется в кэш хранилища (cache/answer-uploads, в бэкап не идёт) кусками по их смещению: повтор куска после
 * обрыва связи пишет те же байты на то же место. Готовый файл и кадр-обложка — в answer-media/<книга>/<файл>/.
 */

/** Не принимаем новых загрузок, если на диске останется меньше этого: сервер общий с другими сайтами. */
const DISK_RESERVE = 3 * 1024 ** 3;
/** Исходники, которые ещё ждут обработки, вместе — не больше: очередь не должна съесть диск. */
const PENDING_SOURCES_MAX = 4 * 1024 ** 3;
const LOCK = 7_302_118;

const dir = (bookId: string, id: string) => `answer-media/${bookId}/${id}`;
export const sourceKey = (id: string) => `cache/answer-uploads/${id}.src`;
export const mediaKey = (f: Pick<AnswerFileRow, "bookId" | "id" | "kind">) => `${dir(f.bookId, f.id)}/media.${f.kind === "video" ? "mp4" : "m4a"}`;
export const posterKey = (f: Pick<AnswerFileRow, "bookId" | "id">) => `${dir(f.bookId, f.id)}/poster.jpg`;
export const fileDirKey = (f: Pick<AnswerFileRow, "bookId" | "id">) => dir(f.bookId, f.id);
export const mediaMime = (kind: FileKind) => (kind === "video" ? "video/mp4" : "audio/mp4");
/** Полные пути готового файла и обложки — для отдачи с перемоткой (range-file). */
export const mediaPath = (f: Pick<AnswerFileRow, "bookId" | "id" | "kind">) => storagePath(mediaKey(f));
export const posterPath = (f: Pick<AnswerFileRow, "bookId" | "id">) => storagePath(posterKey(f));

export function fileView(f: AnswerFileRow): AnswerFileView {
  return {
    id: f.id,
    token: f.token,
    url: answerFileUrl(env.appUrl, f.token),
    kind: f.kind,
    status: f.status,
    name: f.name,
    durationSec: f.durationSec ?? f.declaredSec,
    sourceBytes: f.sourceBytes,
    receivedBytes: f.receivedBytes,
    error: (f.error as FileError | null) ?? null,
    poster: f.hasPoster ? `/api/v/${f.token}?poster=1&v=${f.readyAt?.getTime() ?? 0}` : null,
  };
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/** 10 знаков base62 без перекоса: байты ≥ 248 отбрасываются. */
export function newFileToken(): string {
  let out = "";
  while (out.length < 10) for (const b of randomBytes(16)) if (b < 248 && out.length < 10) out += BASE62[b % 62];
  return out;
}

type Reader = Pick<typeof db, "select">;

/** Занятые секунды и число файлов книги (без упавших); except — не считать этот файл (проверка при обработке). */
export async function bookUsage(bookId: string, tx: Reader = db, except?: string) {
  const [r] = await tx
    .select({ sec: sql<number>`coalesce(sum(coalesce(${answerFiles.durationSec}, ${answerFiles.declaredSec}, 0)), 0)::int`, n: sql<number>`count(*)::int` })
    .from(answerFiles)
    .where(and(eq(answerFiles.bookId, bookId), ne(answerFiles.status, "failed"), except ? ne(answerFiles.id, except) : undefined));
  return { usedSec: r?.sec ?? 0, files: r?.n ?? 0 };
}

async function paidMinutes(bookId: string, tx: Reader = db) {
  const [r] = await tx
    .select({ m: sql<number>`coalesce(sum(${answerFilePurchases.minutes}), 0)::int` })
    .from(answerFilePurchases)
    .where(and(eq(answerFilePurchases.bookId, bookId), eq(answerFilePurchases.status, "paid")));
  return r?.m ?? 0;
}

export async function bookFileQuota(bookId: string, tx: Reader = db, except?: string): Promise<FileQuota> {
  await ensureCatalog();
  const [usage, paid] = await Promise.all([bookUsage(bookId, tx, except), paidMinutes(bookId, tx)]);
  return fileQuota({ freeMinutes: getFreeMediaMinutes(), paidMinutes: paid, ...usage });
}

export async function listBookFiles(bookId: string): Promise<AnswerFileRow[]> {
  return db.select().from(answerFiles).where(eq(answerFiles.bookId, bookId)).orderBy(desc(answerFiles.createdAt));
}

export async function findBookFile(bookId: string, id: string): Promise<AnswerFileRow | null> {
  const [row] = await db
    .select()
    .from(answerFiles)
    .where(and(eq(answerFiles.bookId, bookId), eq(answerFiles.id, id)));
  return row ?? null;
}

/** Свободно на диске хранилища; null — не удалось узнать (тогда не мешаем загрузке). */
async function diskFree(): Promise<number | null> {
  try {
    const st = await fs.statfs(storagePath("cache"));
    return st.bavail * st.bsize;
  } catch {
    try {
      const st = await fs.statfs(storagePath("."));
      return st.bavail * st.bsize;
    } catch {
      return null;
    }
  }
}

/**
 * Начать загрузку: проверки типа, размера, длительности (если браузер её узнал), минут и места; запись в базе и пустой
 * исходник в кэше. Лимит книги проверяется под блокировкой книги — две вкладки не обойдут его одновременно.
 */
export async function startUpload(input: { bookId: string; userId: string; name: string; size: number; mime: string; declaredSec: number | null }): Promise<AnswerFileRow> {
  const kind = fileKindOf(input.name, input.mime);
  if (!kind) throw new HttpError(415, "fileType");
  if (input.size > MAX_SOURCE_BYTES) throw new HttpError(413, "fileTooBig", Math.round(MAX_SOURCE_BYTES / 1024 ** 3));
  const declared = input.declaredSec !== null && Number.isFinite(input.declaredSec) && input.declaredSec > 0 ? Math.ceil(input.declaredSec) : null;
  const free = await diskFree();
  if (free !== null && free < input.size * 1.3 + DISK_RESERVE) throw new HttpError(503, "fileBusy");
  await ensureCatalog();
  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK}, hashtext(${input.bookId}))`);
    const [pending] = await tx
      .select({ bytes: sql<number>`coalesce(sum(${answerFiles.sourceBytes}), 0)::bigint` })
      .from(answerFiles)
      .where(inArray(answerFiles.status, ["uploading", "queued", "processing"]));
    if (Number(pending?.bytes ?? 0) + input.size > PENDING_SOURCES_MAX) throw new HttpError(503, "fileBusy");
    const quota = await bookFileQuota(input.bookId, tx);
    const check = canUpload(quota, kind, declared);
    if (check === "files") throw new HttpError(409, "fileLimit", MAX_FILES_PER_BOOK);
    if (check === "tooLong") throw new HttpError(422, "fileTooLong", MAX_SECONDS[kind] / 60);
    if (check === "quota") throw new HttpError(402, "fileQuota");
    const [created] = await tx
      .insert(answerFiles)
      .values({ token: newFileToken(), bookId: input.bookId, userId: input.userId, kind, name: input.name.slice(0, 200), sourceMime: input.mime.slice(0, 100), sourceBytes: input.size, declaredSec: declared })
      .returning();
    return created;
  });
  await putFile(sourceKey(row.id), Buffer.alloc(0));
  return row;
}

/**
 * Кусок исходника по смещению. Принимается кусок с начала или с уже полученного места (повтор после обрыва — те же байты
 * на то же место); дальше полученного — «загрузка сбилась». Возвращает, сколько байт получено.
 */
export async function appendChunk(file: AnswerFileRow, offset: number, bytes: Buffer): Promise<number> {
  if (file.status !== "uploading") throw new HttpError(409, "fileChunk");
  if (!Number.isInteger(offset) || offset < 0 || offset > file.receivedBytes || bytes.length === 0 || bytes.length > FILE_CHUNK_BYTES || offset + bytes.length > file.sourceBytes) throw new HttpError(409, "fileChunk");
  const fh = await fs.open(storagePath(sourceKey(file.id)), "r+").catch(() => null);
  if (!fh) throw new HttpError(409, "fileChunk");
  try {
    await fh.write(bytes, 0, bytes.length, offset);
  } finally {
    await fh.close();
  }
  const end = offset + bytes.length;
  const [row] = await db
    .update(answerFiles)
    .set({ receivedBytes: sql`greatest(${answerFiles.receivedBytes}, ${end})`, updatedAt: new Date() })
    .where(and(eq(answerFiles.id, file.id), eq(answerFiles.status, "uploading")))
    .returning({ received: answerFiles.receivedBytes });
  if (!row) throw new HttpError(409, "fileChunk");
  return row.received;
}

/** Загрузка закончена: в очередь на обработку. Не все байты дошли — «загрузка сбилась». */
export async function finishUpload(file: AnswerFileRow): Promise<AnswerFileRow> {
  if (file.status !== "uploading") return file;
  const size = await fs.stat(storagePath(sourceKey(file.id))).then((s) => s.size, () => -1);
  if (file.receivedBytes !== file.sourceBytes || size < file.sourceBytes) throw new HttpError(409, "fileChunk");
  const [row] = await db
    .update(answerFiles)
    .set({ status: "queued", updatedAt: new Date() })
    .where(and(eq(answerFiles.id, file.id), eq(answerFiles.status, "uploading")))
    .returning();
  return row ?? file;
}

/** Удалить файл: запись, исходник, готовый файл и обложку. Страница по QR-коду после этого отвечает «не найдено». */
export async function removeFile(file: Pick<AnswerFileRow, "id" | "bookId">) {
  await db.delete(answerFiles).where(eq(answerFiles.id, file.id));
  await deleteFile(sourceKey(file.id));
  await deletePrefix(dir(file.bookId, file.id));
}

/**
 * Брошенные загрузки (за сутки не закончены) — удалить вместе с исходником; исходники без записи (книгу удалили посреди
 * загрузки) старше двух суток — тоже; файлы без карточки в ответах — см. ниже. Возвращает, сколько файлов удалено.
 */
export async function sweepAbandonedUploads(now = new Date()): Promise<number> {
  const stale = await db
    .delete(answerFiles)
    .where(and(eq(answerFiles.status, "uploading"), sql`${answerFiles.updatedAt} < ${new Date(now.getTime() - 24 * 3600_000)}`))
    .returning({ id: answerFiles.id, bookId: answerFiles.bookId });
  for (const f of stale) await deleteFile(sourceKey(f.id));
  const folder = storagePath("cache/answer-uploads");
  for (const name of await fs.readdir(folder).catch(() => [] as string[])) {
    const full = `${folder}/${name}`;
    const old = await fs.stat(full).then((s) => now.getTime() - s.mtimeMs > 48 * 3600_000, () => false);
    if (!old) continue;
    const id = name.replace(/\.src$/, "");
    const [row] = /^[0-9a-f-]{36}$/.test(id) ? await db.select({ id: answerFiles.id }).from(answerFiles).where(eq(answerFiles.id, id)) : [];
    if (!row) await fs.rm(full, { force: true });
  }
  // Файл без карточки ни в одном ответе (вопрос удалили, карточку убрали без удаления) — две недели спустя удаляем,
  // пока книга не заказана: иначе он молча занимал бы минуты книги. У заказанной книги файлы не трогаем никогда.
  const orphans = await db.execute<{ id: string; book_id: string }>(sql`
    select f.id, f.book_id from answer_files f join books b on b.id = f.book_id
    where b.status = 'draft' and f.status in ('ready', 'failed') and f.updated_at < ${new Date(now.getTime() - 14 * 24 * 3600_000)}
      and not exists (select 1 from book_questions q where q.book_id = f.book_id and q.media @> jsonb_build_array(jsonb_build_object('fileId', f.id::text)))
    limit 50`);
  for (const f of orphans.rows) await removeFile({ id: f.id, bookId: f.book_id });
  return stale.length + orphans.rows.length;
}

// ─── страница по QR-коду ────────────────────────────────────────────────────

export interface PublicAnswerFile {
  file: AnswerFileRow;
  bookTitle: string;
  authorName: string;
  /** Подпись карточки в книге (если файл стоит в ответе). */
  caption: string;
  language: string;
}

export async function findByToken(token: string): Promise<AnswerFileRow | null> {
  const [row] = await db.select().from(answerFiles).where(eq(answerFiles.token, token));
  return row ?? null;
}

/** Файл по токену из QR-кода вместе с названием книги и подписью из ответа. */
export async function publicFile(token: string): Promise<PublicAnswerFile | null> {
  const [row] = await db
    .select({ file: answerFiles, title: books.title, author: books.authorName, language: books.language })
    .from(answerFiles)
    .innerJoin(books, eq(books.id, answerFiles.bookId))
    .where(eq(answerFiles.token, token));
  if (!row) return null;
  const [q] = await db
    .select({ media: bookQuestions.media })
    .from(bookQuestions)
    .where(and(eq(bookQuestions.bookId, row.file.bookId), sql`${bookQuestions.media} @> ${JSON.stringify([{ fileId: row.file.id }])}::jsonb`))
    .limit(1);
  const caption = (q?.media as AnswerMedia[] | undefined)?.find((m) => m.fileId === row.file.id)?.title ?? "";
  return { file: row.file, bookTitle: row.title, authorName: row.author, caption, language: row.language };
}

// ─── пакеты минут ───────────────────────────────────────────────────────────

/** Пакеты минут, которые сейчас продаются; пусто — сверх бесплатных минут загрузить нельзя, клиент цен не видит. */
export async function mediaPackOffers(): Promise<MediaPackOffer[]> {
  await ensureCatalog();
  return getMediaPacks()
    .filter((p) => !p.hidden && p.price > 0)
    .map((p) => ({ id: p.id, minutes: p.minutes, price: p.price, featured: !!p.featured }));
}

export type MediaPurchase = typeof answerFilePurchases.$inferSelect;

/** Покупка пакета минут для книги: минуты и сумма — по каталогу сейчас; оплата — Kaspi (цель media_pack). */
export async function createMediaPurchase(userId: string, bookId: string, pack: MediaPack): Promise<MediaPurchase> {
  // Неоплаченная покупка того же пакета по той же цене — та же (повторный клик, возврат на страницу).
  const [open] = await db
    .select()
    .from(answerFilePurchases)
    .where(
      and(
        eq(answerFilePurchases.userId, userId),
        eq(answerFilePurchases.bookId, bookId),
        eq(answerFilePurchases.packId, pack.id),
        eq(answerFilePurchases.status, "pending_payment"),
        eq(answerFilePurchases.amount, pack.price),
        eq(answerFilePurchases.minutes, pack.minutes),
      ),
    )
    .orderBy(desc(answerFilePurchases.createdAt))
    .limit(1);
  if (open) return open;
  const [row] = await db.insert(answerFilePurchases).values({ userId, bookId, packId: pack.id, minutes: pack.minutes, amount: pack.price }).returning();
  return row;
}

export async function findMediaPurchase(id: string): Promise<MediaPurchase | null> {
  const [row] = await executor().select().from(answerFilePurchases).where(eq(answerFilePurchases.id, id));
  return row ?? null;
}

/**
 * Оплата пакета пришла: отметка «оплачено» в текущей транзакции оплаты — с ней минуты сразу считаются в лимите книги.
 * Повтор ничего не делает: false — покупка уже оплачена или отменена.
 */
export async function confirmMediaPurchase(id: string, paymentId: string): Promise<boolean> {
  const [row] = await executor()
    .update(answerFilePurchases)
    .set({ status: "paid", paymentId, paidAt: new Date() })
    .where(and(eq(answerFilePurchases.id, id), eq(answerFilePurchases.status, "pending_payment")))
    .returning({ id: answerFilePurchases.id });
  return !!row;
}
