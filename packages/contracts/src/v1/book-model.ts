/**
 * Объёмная модель книги в API v1 — для 3D-книги приложения. Всё, что нужно сцене, считает сервер теми же функциями, что
 * 3D-книга сайта (lib/book/book-model.ts, flipbook.ts, formats.ts): размеры крышек, корешка и блока по печатным
 * параметрам, прямоугольники лица, оборота и корешка в картинке развёртки (та же вёрстка, что cover.pdf), ракурсы,
 * свет, подписи разворотов и надписи панели. Своих чисел у приложения нет — поменялись параметры типографии или
 * ракурсы на сайте, поменялась и книга в приложении.
 */
import { z } from "zod";
import { route, schemas, uuid, type RouteDef } from "./core";

const Rect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
const View = z.object({ rx: z.number(), ry: z.number() });

export const BookModel = z
  .object({
    pageCount: z.number().int(),
    /** Размеры, мм: крышка w×h, корешок d, толщина картона, блок после обреза, развёртка и стороны в ней. */
    dims: z.object({
      w: z.number(),
      h: z.number(),
      d: z.number(),
      boardMm: z.number(),
      block: z.object({ w: z.number(), h: z.number(), d: z.number() }),
      spread: z.object({ w: z.number(), h: z.number() }),
      rects: z.object({ front: Rect, back: Rect, spine: Rect }),
    }),
    /** Обложка целиком картинкой (оборот | корешок | лицо), путь от сайта с версией; &w= — ширина лица в картинке, одна из spreadWidths. */
    spreadUrl: z.string(),
    spreadWidths: z.array(z.number().int()),
    /** Листов вместе с крышками (позиции листания 0…sheets−1) и листов блока. */
    sheets: z.number().int(),
    leaves: z.number().int(),
    /** Сколько листов вокруг позиции рисовать по одному (остальные — стопками). */
    window: z.number().int(),
    /** Подпись разворота на каждой позиции листания: «Обложка», «Страницы 4–5», «Задняя обложка». */
    spreads: z.array(z.string()),
    views: z.object({
      initial: View,
      read: View,
      readZoom: z.number(),
      zoom: z.object({ min: z.number(), max: z.number(), step: z.number() }),
      tiltLimit: z.number(),
      /** Ракурсы по порядку кнопок: id, подпись, поворот. */
      list: z.array(z.object({ id: z.string(), label: z.string(), rx: z.number(), ry: z.number() })),
    }),
    /** Свет: вектор «на источник», освещённость в тени и наибольшая плёнка тени. */
    light: z.object({ x: z.number(), y: z.number(), z: z.number(), ambient: z.number(), shadeMax: z.number() }),
    /** Цвета бумаги (CSS): форзац — градиент из двух, срез — основа и середина, штрихи листов, фон сцены — центр и край. */
    paper: z.object({ endpaper: z.array(z.string()), edge: z.array(z.string()), edgeLine: z.string(), stage: z.array(z.string()) }),
    labels: z.object({
      read: z.string(),
      prev: z.string(),
      next: z.string(),
      zoomIn: z.string(),
      zoomOut: z.string(),
      autoOn: z.string(),
      autoOff: z.string(),
      reset: z.string(),
      /** «145×207 мм · корешок 4 мм · 104 стр.» */
      dims: z.string(),
      hint: z.string(),
      note: z.string(),
    }),
  })
  .register(schemas, { id: "BookModel" });

export const bookModelRoutes = {
  bookModel: route({
    method: "GET",
    path: "/api/v1/books/{bookId}/model",
    auth: "user",
    tag: "preview",
    summary: "Объёмная модель книги для 3D-книги: размеры, развёртка обложки, ракурсы, свет, подписи (pages — страниц в сборке)",
    params: z.object({ bookId: uuid }),
    query: z.object({ pages: z.coerce.number().int().min(1).max(2000).optional() }),
    response: BookModel,
  }),
} as const satisfies Record<string, RouteDef>;
