/**
 * Создаёт демонстрационную книгу с ответами и фото и собирает все PDF в папку.
 * Запуск: npx tsx --conditions=react-server scripts/sample-book.ts ./out
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { bookQuestions, books, photos, users } from "../src/lib/db/schema";
import { createBook } from "../src/lib/books";
import { hashPassword } from "../src/lib/auth";
import { putFile } from "../src/lib/storage";
import { processUpload } from "../src/lib/images";
import { loadBookBundle, printSpecText, renderPrintPackage, renderInterior, renderReadingPdf } from "../src/lib/pdf/render";

const LOREM = [
  "Мы встретились в самый обычный вторник, когда в Алматы шёл первый снег. Я опаздывала на встречу, а ты стоял у входа в кофейню и держал дверь — так неловко и так галантно одновременно, что я рассмеялась.",
  "Потом был разговор ни о чём, который почему-то длился три часа. Мы говорили о горах, о книгах, о том, что каждый из нас хотел бы успеть в жизни. Я помню, как в какой-то момент поймала себя на мысли: мне с тобой совершенно спокойно.",
  "Марғұлан, ты тогда сказал фразу, которую я запомнила навсегда: «Главное — не куда мы идём, а с кем». С тех пор прошло четыре года, и я каждый день убеждаюсь, что ты был прав.",
];

async function main() {
  const out = path.resolve(process.argv[2] ?? "./sample-out");
  await fs.mkdir(out, { recursive: true });
  const email = "demo@mybook.local";
  let user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) [user] = await db.insert(users).values({ email, passwordHash: await hashPassword("demo12345"), name: "Демо" }).returning();
  const book = await createBook(user.id, {
    theme: "love",
    authorName: "Алия",
    authorGender: "f",
    recipientName: "Марғұлан",
    recipientGender: "m",
    title: "Ты — моё всё",
  });
  await db.update(books).set({ subtitle: "Четыре года вместе", dedication: "Марғұлану — моему самому близкому человеку. С любовью, Алия.", backText: "Каждая страница этой книги — о тебе.", coverTemplate: process.argv[3] ?? "blossom" }).where(eq(books.id, book.id));
  const qs = await db.select().from(bookQuestions).where(eq(bookQuestions.bookId, book.id));
  let i = 0;
  for (const q of qs) {
    if (i++ % 3 === 2) continue;
    const n = 1 + (i % 3);
    await db.update(bookQuestions).set({ answer: LOREM.slice(0, n).join("\n\n"), hideHeading: i % 17 === 0 }).where(eq(bookQuestions.id, q.id));
  }
  // Сгенерированные тестовые фото
  const layouts = ["full", "bleed", "half", "half", "full"] as const;
  for (let k = 0; k < layouts.length; k++) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="${k % 2 ? 1600 : 3000}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${k * 60},60%,70%)"/><stop offset="1" stop-color="hsl(${k * 60 + 40},50%,35%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="50%" cy="45%" r="400" fill="#fff" opacity=".35"/></svg>`;
    const img = await processUpload(await sharp(Buffer.from(svg)).jpeg().toBuffer());
    const [ph] = await db.insert(photos).values({ bookId: book.id, position: k, storageKey: "tmp", thumbKey: "tmp", width: img.width, height: img.height, caption: k % 2 ? "" : `Фото №${k + 1}: наше лето`, layout: layouts[k] }).returning();
    const key = `photos/${book.id}/${ph.id}.jpg`;
    const tkey = `photos/${book.id}/${ph.id}_thumb.jpg`;
    await putFile(key, img.full);
    await putFile(tkey, img.thumb);
    await db.update(photos).set({ storageKey: key, thumbKey: tkey }).where(eq(photos.id, ph.id));
  }
  const bundle = (await loadBookBundle(book.id))!;
  let t = Date.now();
  const pkg = await renderPrintPackage(bundle);
  console.log("print package", Date.now() - t, "ms, pages", pkg.pageCount, "spine", pkg.spineMm);
  await fs.writeFile(path.join(out, "block.pdf"), pkg.interior);
  await fs.writeFile(path.join(out, "cover.pdf"), pkg.cover);
  await fs.writeFile(path.join(out, "spec.txt"), printSpecText(bundle, pkg, 1));
  t = Date.now();
  const preview = await renderInterior(bundle, "preview");
  console.log("preview", Date.now() - t, "ms");
  await fs.writeFile(path.join(out, "preview.pdf"), preview.pdf);
  t = Date.now();
  await fs.writeFile(path.join(out, "reading.pdf"), await renderReadingPdf(bundle));
  console.log("reading", Date.now() - t, "ms");
  console.log("book", book.id);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
