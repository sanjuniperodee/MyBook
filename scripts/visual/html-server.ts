import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Route } from "playwright";
import type { FixtureBook } from "../../tests/fixtures/books";
// Не React-хук, несмотря на имя: под другим именем правило хуков не путает его с ними.
import { photoFiles, useFixtureStorage as openFixtureStorage } from "../../tests/fixtures/photos";
import { photoNamesFor } from "./books";
import { standHtml, type StandAssets } from "./html-assets";
import type { StandView } from "./html-data";

/**
 * Ответы стенда html-snapshot на запросы страницы — как их отдаёт сайт: страница и ресурсы стенда, шрифты,
 * фото книг (/api/photos/<id>: превью, файл хранилища, копия для просмотра), а фоны обложек
 * (/api/covers/<файл>) и снимки шаблонов (/api/cover-photos/<ключ>) — обработчиками маршрутов из src/app/api,
 * вызванными в Node. Всё прочее стенд не отдаёт: такой запрос — ошибка снимка.
 */

export const ORIGIN = "http://stand.local";

type Fulfill = Parameters<Route["fulfill"]>[0];

export interface StandServer {
  /** Ответ на запрос страницы вида; undefined — такого стенд не отдаёт. */
  respond(url: URL, view: StandView): Promise<Fulfill | undefined>;
  close(): Promise<void>;
}

/** Обработчик маршрута сайта; исключение (notFound) или не 200 — стенд такого не отдаёт. */
async function route<P>(get: (req: Request, ctx: { params: Promise<P> }) => Promise<Response>, url: URL, params: P): Promise<Fulfill | undefined> {
  const res = await get(new Request(url), { params: Promise.resolve(params) }).catch(() => null);
  if (res?.status !== 200) return undefined;
  return { contentType: res.headers.get("content-type") ?? undefined, body: Buffer.from(await res.arrayBuffer()) };
}

/**
 * Хранилище — своё на каждый запуск (временный каталог): копии фото для просмотра (photoViewFile) кэшируются
 * в нём, и снимок одного дерева не возьмёт копию, построенную кодом другого.
 */
export async function startStandServer(assets: StandAssets, books: FixtureBook[]): Promise<StandServer> {
  const names = photoNamesFor(books);
  const storage = await mkdtemp(path.join(tmpdir(), "mybook-stand-"));
  await openFixtureStorage(storage, names);
  const [files, { photoViewFile }, covers, coverPhotos] = await Promise.all([
    photoFiles(names),
    import("@/modules/authoring/infrastructure/photoView"),
    import("@/app/api/covers/[file]/route"),
    import("@/app/api/cover-photos/[key]/route"),
  ]);
  const file = (key: string) => {
    const data = files.get(key);
    if (!data) throw new Error(`Нет фото ${key} в наборе`);
    return data;
  };
  const photos = new Map(books.flatMap((b) => b.bundle.photos.map((p) => [p.id, { thumb: file(p.thumbKey), full: file(p.storageKey), key: p.storageKey }] as const)));

  async function respond(url: URL, view: StandView): Promise<Fulfill | undefined> {
    if (url.origin !== ORIGIN) return undefined;
    if (url.pathname === "/") return { contentType: "text/html", body: standHtml(view) };
    if (url.pathname === "/stand.js") return { contentType: "text/javascript", body: assets.js };
    if (url.pathname === "/stand.css") return { contentType: "text/css", body: assets.css };
    if (url.pathname === "/favicon.ico") return { status: 404 };
    const [, dir, name] = url.pathname.match(/^\/(fonts|api\/photos|api\/covers|api\/cover-photos)\/([^/]+)$/) ?? [];
    const font = dir === "fonts" ? assets.fonts.get(name) : undefined;
    if (font) return { contentType: "font/woff2", path: font };
    // Как /api/photos/[id]: full — файл хранилища, view — уменьшенная копия для 3D-книги, иначе превью.
    const photo = dir === "api/photos" ? photos.get(name) : undefined;
    const size = url.searchParams.get("size");
    if (photo) return { contentType: "image/jpeg", body: size === "full" ? photo.full : size === "view" ? await photoViewFile(photo.key) : photo.thumb };
    if (dir === "api/covers") return route(covers.GET, url, { file: name });
    if (dir === "api/cover-photos") return route(coverPhotos.GET, url, { key: name });
    return undefined;
  }

  return { respond, close: () => rm(storage, { recursive: true, force: true }) };
}
