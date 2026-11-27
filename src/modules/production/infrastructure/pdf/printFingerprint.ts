import { createHash } from "node:crypto";
import { buildBookContent } from "@/lib/book/book-content";
import { toPhotoItem } from "@/lib/book/layout";
import type { BookBundle } from "./render";

/**
 * Поля книги, которые не печатаются: служебные (кто, статус «открыта для правок», время правки) и приглашение близких.
 * Всё остальное в книге — в отпечатке: новое поле по умолчанию считается печатным (лишний раз согласовать — не страшно,
 * напечатать несогласованное — страшно).
 */
const NOT_PRINTED = new Set(["id", "userId", "status", "inviteToken", "inviteText", "occasion", "occasionDate", "createdAt", "updatedAt"]);

/** У фото не печатается только время записи (правка снимка — новый файл, storageKey). */
const PHOTO_NOT_PRINTED = new Set(["createdAt", "updatedAt"]);

const printed = (row: object, skip: Set<string>) => Object.fromEntries(Object.entries(row).filter(([k]) => !skip.has(k)));

/** JSON с ключами по алфавиту: порядок полей строки и jsonb не меняет отпечаток. */
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

/**
 * Отпечаток версии книги для печати — то, что клиент согласует (orders.layout_approved_fingerprint) и из чего собран
 * пакет для типографии (print_spec.fingerprint). В отличие от contentFingerprint (ключ кэша экранной сборки) учитывает
 * всё, что видно на обложке и обороте: названия, имена на обложке, получателя и его скрытие, шаблон, конструктор
 * обложки и оборота, фото обложки и их кадры, текст оборота — то есть все печатные поля книги и все поля фото.
 *
 * Не зависит от версии правил вёрстки (LAYOUT_VERSION) и от года печати: выкатка новой вёрстки или 1 января не делают
 * согласованную клиентом книгу «изменённой» — согласовывают содержимое, а пакет собирается из согласованной версии.
 */
export function printFingerprint(bundle: BookBundle): string {
  const book = printed(bundle.book, NOT_PRINTED);
  const photos = bundle.photos.map((p) => printed(p, PHOTO_NOT_PRINTED));
  // Содержимое — то же, что верстается (тексты глав, письма, раскладка фото), с годом 0: год печати не меняет версию.
  const content = buildBookContent(bundle.book, bundle.questions, bundle.photos.map(toPhotoItem), bundle.chapters, 0, bundle.letters ?? []);
  return createHash("sha1").update("print-v1").update(stable(content)).update(stable(book)).update(stable(photos)).digest("hex").slice(0, 16);
}
