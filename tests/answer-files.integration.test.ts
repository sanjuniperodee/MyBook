import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, promises as fs, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

// Хранилище — во временной папке: путь читается при загрузке модуля storage.
const storageDir = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/answer-files-it-${Date.now()}`;
  process.env.STORAGE_DIR = dir;
  return dir;
});

import { db } from "@/shared/infrastructure/db";
import { appendChunk, bookFileQuota, confirmMediaPurchase, createMediaPurchase, findBookFile, finishUpload, publicFile, removeFile, startUpload, sweepAbandonedUploads } from "@/server/answerFiles";
import { kickAnswerFiles } from "@/server/answerFilesWorker";
import { storagePath } from "@/shared/infrastructure/storage";

/**
 * Свои видео и аудио на PostgreSQL и настоящем ffmpeg: загрузка кусками (повтор куска, кусок не по порядку), очередь,
 * сжатие, страница по токену, минуты книги и пакет минут, удаление и уборка брошенных загрузок.
 * Запуск: INTEGRATION=1 npx vitest run tests/answer-files.integration.test.ts (база из DATABASE_URL с миграциями, ffmpeg).
 */
const run = process.env.INTEGRATION === "1" && spawnSync("ffmpeg", ["-version"]).status === 0 ? describe : describe.skip;
const tag = `af${Date.now()}`;

run("свои видео и аудио (PostgreSQL + ffmpeg)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  let user = "";
  let book = "";
  const src = path.join(mkdtempSync(path.join(tmpdir(), "af-src-")), "clip.mov");

  beforeAll(async () => {
    user = (await q<{ id: string }>(sql`insert into users (email, password_hash, name) values (${`${tag}@test.kz`}, 'x', ${`Тест ${tag}`}) returning id`))[0].id;
    book = (await q<{ id: string }>(sql`insert into books (user_id, theme, title, author_name) values (${user}, 'love', 'Наша история', 'Айгерим') returning id`))[0].id;
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", "-y", src]);
  });

  afterAll(async () => {
    await q(sql`delete from users where id = ${user}`);
    rmSync(path.dirname(src), { recursive: true, force: true });
    rmSync(storageDir, { recursive: true, force: true });
  });

  it("загрузка кусками → очередь → H.264 720p с обложкой → страница по токену с подписью из ответа", async () => {
    const bytes = await fs.readFile(src);
    const file = await startUpload({ bookId: book, userId: user, name: "IMG_0001.MOV", size: bytes.length, mime: "video/quicktime", declaredSec: 3 });
    expect(file).toMatchObject({ kind: "video", status: "uploading", receivedBytes: 0 });
    expect(file.token).toMatch(/^[A-Za-z0-9]{10}$/);
    const half = Math.floor(bytes.length / 2);
    expect(await appendChunk(file, 0, bytes.subarray(0, half))).toBe(half);
    // Кусок дальше полученного — «загрузка сбилась»; повтор первого куска (ответ потерялся) безопасен.
    await expect(appendChunk((await findBookFile(book, file.id))!, half + 10, bytes.subarray(half + 10))).rejects.toMatchObject({ code: "fileChunk" });
    expect(await appendChunk((await findBookFile(book, file.id))!, 0, bytes.subarray(0, half))).toBe(half);
    await expect(finishUpload((await findBookFile(book, file.id))!)).rejects.toMatchObject({ code: "fileChunk" });
    expect(await appendChunk((await findBookFile(book, file.id))!, half, bytes.subarray(half))).toBe(bytes.length);
    expect((await finishUpload((await findBookFile(book, file.id))!)).status).toBe("queued");

    kickAnswerFiles();
    let done = await findBookFile(book, file.id);
    for (let i = 0; i < 120 && done?.status !== "ready" && done?.status !== "failed"; i++) {
      await new Promise((r) => setTimeout(r, 250));
      done = await findBookFile(book, file.id);
    }
    expect(done).toMatchObject({ status: "ready", kind: "video", durationSec: 3, width: 1280, height: 720, hasPoster: true, error: null });
    const out = storagePath(`answer-media/${book}/${file.id}/media.mp4`);
    expect((await fs.stat(out)).size).toBe(done!.bytes);
    expect((await fs.stat(storagePath(`answer-media/${book}/${file.id}/poster.jpg`))).size).toBeGreaterThan(0);
    // Исходник после обработки удалён.
    await expect(fs.stat(storagePath(`cache/answer-uploads/${file.id}.src`))).rejects.toThrow();

    await q(sql`insert into book_questions (book_id, position, chapter, prompt, title, media) values (${book}, 0, 'intro', 'Вопрос', 'Вопрос', ${JSON.stringify([{ id: "m1", kind: "video", url: `https://mybooks.kz/v/${file.token}`, title: "Пожелание бабушки", anchor: null, fileId: file.id }])}::jsonb)`);
    expect(await publicFile(file.token)).toMatchObject({ bookTitle: "Наша история", authorName: "Айгерим", caption: "Пожелание бабушки", file: { status: "ready" } });
    expect(await publicFile("zzzzzzzzzz")).toBeNull();
  });

  it("минуты книги: сверх бесплатных — отказ; после оплаты пакета — можно", async () => {
    expect((await bookFileQuota(book)).usedSec).toBe(3);
    const long = { bookId: book, userId: user, name: "voice.m4a", size: 1000, mime: "audio/mp4", declaredSec: 30 * 60 };
    await expect(startUpload(long)).rejects.toMatchObject({ code: "fileQuota" });
    await expect(startUpload({ ...long, declaredSec: 31 * 60 })).rejects.toMatchObject({ code: "fileTooLong" });
    await expect(startUpload({ ...long, name: "scan.pdf", mime: "application/pdf" })).rejects.toMatchObject({ code: "fileType" });
    const purchase = await createMediaPurchase(user, book, { id: "small", minutes: 30, price: 1990 });
    // Повторный клик — та же покупка.
    expect((await createMediaPurchase(user, book, { id: "small", minutes: 30, price: 1990 })).id).toBe(purchase.id);
    expect(await confirmMediaPurchase(purchase.id, "kaspi:1")).toBe(true);
    expect(await confirmMediaPurchase(purchase.id, "kaspi:1")).toBe(false);
    expect((await bookFileQuota(book)).minutes).toBe(60);
    const voice = await startUpload(long);
    expect(voice).toMatchObject({ kind: "audio", status: "uploading", declaredSec: 1800 });
    // Брошенная загрузка: через сутки убирается вместе с исходником и не занимает минуты.
    expect(await sweepAbandonedUploads(new Date(Date.now() + 25 * 3600_000))).toBeGreaterThanOrEqual(1);
    expect(await findBookFile(book, voice.id)).toBeNull();
    await expect(fs.stat(storagePath(`cache/answer-uploads/${voice.id}.src`))).rejects.toThrow();
  });

  it("файл без карточки в ответах через две недели удаляется, пока книга не заказана", async () => {
    const [row] = await q<{ id: string }>(sql`select id from answer_files where book_id = ${book} and status = 'ready'`);
    const later = new Date(Date.now() + 15 * 24 * 3600_000);
    // На файл ссылается ответ — остаётся.
    await sweepAbandonedUploads(later);
    expect(await findBookFile(book, row.id)).not.toBeNull();
    await q(sql`update book_questions set media = '[]'::jsonb where book_id = ${book}`);
    await q(sql`update books set status = 'ordered' where id = ${book}`);
    await sweepAbandonedUploads(later);
    expect(await findBookFile(book, row.id)).not.toBeNull();
    await q(sql`update books set status = 'draft' where id = ${book}`);
    await q(sql`update book_questions set media = ${JSON.stringify([{ id: "m1", kind: "video", url: "https://mybooks.kz/v/x", title: "", anchor: null, fileId: row.id }])}::jsonb where book_id = ${book}`);
  });

  it("удаление: запись и файлы, страница по токену больше не открывается", async () => {
    const [row] = await q<{ id: string; token: string }>(sql`select id, token from answer_files where book_id = ${book} and status = 'ready'`);
    await removeFile({ id: row.id, bookId: book });
    expect(await publicFile(row.token)).toBeNull();
    await expect(fs.stat(storagePath(`answer-media/${book}/${row.id}`))).rejects.toThrow();
  });
});
