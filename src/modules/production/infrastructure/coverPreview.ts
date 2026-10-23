import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { inPdfThread } from "./pdf/pool";
import { slots } from "./pdf/queue";
import type { BookBundle } from "./pdf/render";

/**
 * Картинки оформления для ИИ-дизайнера: он смотрит на свою работу глазами. Обложка и первые страницы книги рисуются той
 * же вёрсткой PDF, что уйдёт в печать, и растрируются poppler'ом. Нет растра или вёрстка не вышла — null: дизайнер
 * просто обойдётся без осмотра.
 */

/** Не больше одного растра за раз: pdftoppm занимает ядро, а рядом идёт вёрстка и сам сайт. */
const rasterSlot = slots(1);

export interface PreviewPicture {
  mime: "image/png";
  data: string;
}

function pdftoppm(args: string[], encoding: "buffer" = "buffer"): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile("pdftoppm", args, { encoding, maxBuffer: 64 << 20, timeout: 45_000 }, (err, stdout, stderr) => (err ? reject(new Error(`pdftoppm: ${stderr.toString().trim() || err.message}`)) : resolve(stdout)));
  });
}

async function inTemp<T>(fn: (dir: string) => Promise<T>): Promise<T | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "mybook-preview-"));
  try {
    return await fn(dir);
  } catch (err) {
    console.error("[design-ai] preview", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Лицевая крышка обложки одной картинкой шириной widthPx. */
export function renderCoverPreview(bundle: BookBundle, widthPx = 760): Promise<PreviewPicture | null> {
  return inTemp(async (dir) => {
    const file = path.join(dir, "cover.pdf");
    await writeFile(file, await inPdfThread({ task: "coverPreview", bundle }));
    const ppm = await rasterSlot(() => pdftoppm(["-f", "1", "-l", "1", "-scale-to-x", String(widthPx), "-scale-to-y", "-1", file]));
    const header = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(ppm.subarray(0, 64).toString("latin1"));
    if (!header) return null;
    const [width, height] = [Number(header[1]), Number(header[2])];
    const raw = ppm.subarray(header[0].length, header[0].length + width * height * 3);
    if (raw.length < width * height * 3) return null;
    const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 6 }).toBuffer();
    return { mime: "image/png" as const, data: png.toString("base64") };
  });
}

const SAMPLE_TEXT = {
  ru: [
    "Я помню тот день так ясно, будто это было вчера. Мы вышли из дома рано утром, когда город ещё спал, и пошли к реке. Воздух был прохладным и пах свежим хлебом, а по дороге нам встретился старый сосед, который всегда здоровался первым.",
    "Потом всё было как в сказке: мы смеялись, строили планы и не замечали, как бежит время. Тогда мне казалось, что так будет всегда, и я до сих пор благодарна судьбе за каждую из тех минут.",
    "Если бы меня спросили, чему научила меня жизнь, я бы ответила просто: ценить тех, кто рядом, говорить им об этом вслух и не откладывать добрые слова на потом.",
  ],
  kk: [
    "Мен ол күнді кеше ғана болғандай анық еске аламын. Қала әлі ұйқыда тұрғанда үйден ерте шығып, өзенге қарай жүрдік. Ауа салқын, жаңа піскен нанның иісі аңқып тұрды.",
    "Содан кейін бәрі ертегідей болды: күлдік, жоспар құрдық, уақыттың қалай өтіп жатқанын байқамадық. Сол сәттердің әрқайсысы үшін тағдырға әлі күнге дейін ризамын.",
    "Өмір маған не үйретті деп сұраса, қарапайым жауап берер едім: жаныңдағы адамдарды бағалау, оларға мұны дауыстап айту және жылы сөздерді кейінге қалдырмау.",
  ],
} as const;

/**
 * Короткая выборка книги для осмотра страниц: по два вопроса из первых двух глав (с настоящими ответами, а где их нет —
 * с образцом текста), без фото — получаются титул, выходные данные, оглавление, начальные полосы и текст.
 */
export function sampleBundle(b: BookBundle): BookBundle {
  const sample = SAMPLE_TEXT[b.book.language === "kk" ? "kk" : "ru"];
  const sorted = [...b.questions].sort((x, y) => x.position - y.position);
  const chapters: string[] = [];
  for (const q of sorted) if (!chapters.includes(q.chapter)) chapters.push(q.chapter);
  const picked = chapters.slice(0, 2).flatMap((c) => {
    const own = sorted.filter((q) => q.chapter === c);
    return [...own.filter((q) => q.answer.trim()), ...own.filter((q) => !q.answer.trim())].slice(0, 2);
  });
  const questions = picked.sort((x, y) => x.position - y.position).map((q, i) => ({ ...q, answer: q.answer.trim() ? q.answer.slice(0, 1200) : sample[i % sample.length], media: [] }));
  return { ...b, book: { ...b.book, photoPlacement: "none" as const, showToc: true }, questions, photos: [], letters: [] };
}

/** Первые страницы книги (титул, выходные данные, оглавление, главы, текст) одним листом из мелких картинок. */
export function renderPagesPreview(bundle: BookBundle, cell = 360): Promise<PreviewPicture | null> {
  return inTemp(async (dir) => {
    const file = path.join(dir, "book.pdf");
    await writeFile(file, await inPdfThread({ task: "pagesPreview", bundle: sampleBundle(bundle) }));
    await rasterSlot(() => pdftoppm(["-png", "-f", "1", "-l", "8", "-scale-to-x", String(cell), "-scale-to-y", "-1", file, path.join(dir, "p")]));
    const names = (await readdir(dir)).filter((n) => /^p-\d+\.png$/.test(n)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    if (!names.length) return null;
    const tiles = await Promise.all(names.map((n) => readFile(path.join(dir, n))));
    const metas = await Promise.all(tiles.map((t) => sharp(t).metadata()));
    const w = metas[0].width ?? cell;
    const h = metas[0].height ?? Math.round(cell * 1.42);
    const cols = Math.min(4, tiles.length);
    const rows = Math.ceil(tiles.length / cols);
    const gap = 10;
    const sheet = await sharp({ create: { width: cols * (w + gap) + gap, height: rows * (h + gap) + gap, channels: 3, background: "#C8C8C8" } })
      .composite(tiles.map((input, i) => ({ input, left: gap + (i % cols) * (w + gap), top: gap + Math.floor(i / cols) * (h + gap) })))
      .png({ compressionLevel: 6 })
      .toBuffer();
    return { mime: "image/png" as const, data: sheet.toString("base64") };
  });
}
