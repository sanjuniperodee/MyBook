import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";
import type { ReactElement } from "react";
import { Font, pdf, type DocumentProps } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import type { Locale } from "@/i18n/config";
import { fontFaces, type FontKey } from "@/lib/book/fonts";
import { hyphenateWord } from "@/lib/book/hyphenate";

let registered = false;
/** Язык книги, которая сейчас верстается: сборки идут строго по одной (renderPdf), поэтому переменной достаточно. */
let hyphenLang: Locale | undefined;

export function fontsDir() {
  return path.join(process.cwd(), "assets", "fonts");
}

export function ensureFonts() {
  if (registered) return;
  for (const key of Object.keys(fontFaces) as FontKey[]) {
    const def = fontFaces[key];
    Font.register({
      family: def.family,
      fonts: def.faces.map((f) => ({ src: path.join(fontsDir(), f.file), fontWeight: f.weight, fontStyle: f.style })),
    });
  }
  // Переносы — общие с HTML-превью (lib/book/hyphenate.ts): слоги слова по языку книги.
  Font.registerHyphenationCallback((word) => hyphenateWord(word, hyphenLang));
  registered = true;
}

let renderQueue: Promise<unknown> = Promise.resolve();

/** Байты файлов шрифтов: свежий объект fontkit для каждого документа создаётся из них без чтения диска. */
const fontBytes = new Map<string, Buffer>();

/**
 * Каждому документу — свои объекты шрифтов. fontkit хранит в объекте шрифта состояние подмножества, и составной глиф
 * одного документа (Ғ в Geologica = Г + штрих) портил другой: в следующем документе с тем же шрифтом буква пропадала
 * («үлнар» вместо «Гүлнар»). Загруженные шрифты остаются загруженными — заменяется только объект, из тех же байтов
 * (fontkit разбирает таблицы лениво, это дёшево). Font.reset не подходит: react-pdf 4.9 после него шрифт не перечитывает.
 */
function freshFonts() {
  const families = Font.getRegisteredFonts() as Record<string, { sources: { src: unknown; data: unknown }[] }>;
  for (const family of Object.values(families))
    for (const source of family.sources) {
      if (!source.data || typeof source.src !== "string" || !source.src.endsWith(".ttf")) continue;
      let bytes = fontBytes.get(source.src);
      if (!bytes) fontBytes.set(source.src, (bytes = readFileSync(source.src)));
      source.data = fontkit.create(bytes);
    }
}

/**
 * renderToBuffer из react-pdf, но с размонтированием документа после сборки. react-pdf создаёт для каждого документа
 * корень React и не отпускает его: дерево документа (сотни тысяч узлов у большой книги) оставалось в памяти навсегда.
 * Блок книги верстается 10–12 раз (проходы доводки), и за одну сборку набегало ~60 МБ на проход (замер 17.11:
 * книга на 140 фото — 0,6 ГБ), а сайт копил то же после каждой экранной сборки.
 */
async function renderAndRelease(document: ReactElement<DocumentProps>): Promise<Buffer> {
  const instance = pdf(document);
  try {
    const stream = await instance.toBuffer();
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk);
    return Buffer.concat(chunks);
  } finally {
    // Дважды: у корня React два дерева (текущее и запасное), и каждое держит свой документ — с его опциями и
    // замыканиями (onLayout держал раскладку прохода целиком). После двух пустых обновлений пусты оба.
    const empty = null as unknown as ReactElement<DocumentProps>;
    instance.updateContainer(empty);
    instance.updateContainer(empty);
    // Сам корень React остаётся в списке корней навсегда и держит контейнер react-pdf, а тот — документ (дерево узлов
    // с раскладкой): контейнер не очищается при размонтировании.
    (instance.container as { document: unknown }).document = null;
  }
}

/**
 * Собирает PDF строго по одному на процесс. Шрифты react-pdf общие для всех документов, и две сборки
 * одновременно портят подмножество шрифта: из надписей пропадают буквы (заказ №14 — «ИТАЛИЙ» на титуле).
 */
export function renderPdf(document: ReactElement<DocumentProps>, language?: Locale): Promise<Buffer> {
  // Каждый документ — со своими объектами шрифтов (freshFonts): иначе буквы пропадают и при сборках по очереди.
  const run = renderQueue.then(() => {
    freshFonts();
    hyphenLang = language;
    return renderAndRelease(document);
  });
  renderQueue = run.catch(() => undefined);
  return run;
}

/**
 * Только раскладка документа (как onRender у react-pdf: _INTERNAL__LAYOUT__DATA_), без самого PDF: черновые проходы
 * доводки вёрстки читают одну раскладку, а запись файла (рисование, подмножества шрифтов, сжатие) им не нужна.
 * Объекты шрифтов не меняются (freshFonts): подмножество шрифта портит только запись файла, а ширины глифов те же —
 * и разобранные глифы остаются в кэше fontkit между проходами. Очередь — общая со сборкой PDF.
 */
export function layoutPdf(document: ReactElement<DocumentProps>, language?: Locale): Promise<unknown> {
  const run = renderQueue.then(async () => {
    hyphenLang = language;
    const instance = pdf(document);
    const container = instance.container as { document: unknown };
    try {
      // Типы layout объявляют один аргумент, а react-pdf передаёт вторым хранилище шрифтов (так же, как здесь).
      const layout = layoutDocument as unknown as (doc: unknown, fonts: unknown) => Promise<unknown>;
      return await layout(container.document, Font);
    } finally {
      const empty = null as unknown as ReactElement<DocumentProps>;
      instance.updateContainer(empty);
      instance.updateContainer(empty);
      container.document = null;
    }
  });
  renderQueue = run.catch(() => undefined);
  return run;
}

/** Подбирает ближайшее зарегистрированное начертание, чтобы react-pdf не падал на отсутствующем весе. */
export function face(key: FontKey, weight = 400, italic = false): { fontFamily: string | string[]; fontWeight: number; fontStyle: "normal" | "italic" } {
  const def = fontFaces[key];
  const style = italic ? "italic" : "normal";
  const candidates = def.faces.filter((f) => f.style === style);
  const pool = candidates.length ? candidates : def.faces;
  const best = pool.reduce((a, b) => (Math.abs(b.weight - weight) < Math.abs(a.weight - weight) ? b : a));
  // Знаки, которых нет в шрифте (₸, №, многоточие), react-pdf берёт из запасного — он идёт вторым в списке.
  const fontFamily: string | string[] = def.fallback ? [def.family, fontFaces[def.fallback].family] : def.family;
  return { fontFamily, fontWeight: best.weight, fontStyle: best.style };
}
