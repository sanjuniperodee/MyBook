/**
 * Предпросмотр книги в API v1: экранная сборка (растр полос настоящего PDF) и её ход. Картинки полос и PDF — файлы:
 * их отдают маршруты сайта по адресам из ответа (тот же Bearer). Сборка запускается сама, если её нет: опрашивайте
 * bookBuildProgress раз в секунду, пока status = building, потом снова bookBuild.
 */
import { z } from "zod";
import { route, schemas, uuid, type RouteDef } from "./core";

export const BookPage = z
  .object({
    n: z.number().int(),
    /** front, toc, opener, text, photo, gallery, end; blank — пустая перед главой, pad — добивка в конце. */
    kind: z.enum(["front", "toc", "opener", "text", "photo", "gallery", "end", "blank", "pad"]),
    chapterKey: z.string().nullable(),
  })
  .register(schemas, { id: "BookPage" });

export const BookBuild = z
  .object({
    fp: z.string(),
    pageCount: z.number().int(),
    contentPages: z.number().int(),
    trimMm: z.object({ w: z.number(), h: z.number() }),
    pages: z.array(BookPage),
    /** Глава → номер её начальной полосы (как в оглавлении). */
    chapterPages: z.record(z.string(), z.number().int()),
    /** Картинка полосы n: `${imageBase}/${n}?w=` + одна из imageWidths (WebP; пока книга не оплачена — со знаком). */
    imageBase: z.string(),
    imageWidths: z.array(z.number().int()),
  })
  .register(schemas, { id: "BookBuild" });

export const BuildState = z
  .object({
    /** ready — build готова; building — собирается (build — прошлая сборка или null); failed — сбой (build — прошлая). */
    status: z.enum(["ready", "building", "failed"]),
    build: BookBuild.nullable(),
    error: z.string().nullable(),
    /** failed: через сколько мс можно повторить (bookBuild с retry=1); 0 — уже. */
    retryInMs: z.number().int().nullable(),
    /** PDF-предпросмотр целиком (облегчённые фото, со знаком до оплаты). */
    pdfUrl: z.string(),
  })
  .register(schemas, { id: "BuildState" });

export const BuildProgress = z
  .object({
    /** null — сборка не идёт. */
    progress: z
      .object({
        state: z.enum(["queued", "running"]),
        stage: z.enum(["images", "flow", "final", "cover", "finish"]).nullable(),
        percent: z.number().int(),
        etaMs: z.number().int().nullable(),
        overrun: z.boolean(),
        ahead: z.number().int(),
      })
      .nullable(),
  })
  .register(schemas, { id: "BuildProgress" });

const BookParams = z.object({ bookId: uuid });

export const previewRoutes = {
  bookBuild: route({
    method: "GET",
    path: "/api/v1/books/{bookId}/build",
    auth: "user",
    tag: "preview",
    summary: "Экранная сборка книги: полосы и адреса картинок; нет — запускается (retry=1 — повтор после сбоя)",
    params: BookParams,
    query: z.object({ retry: z.enum(["1"]).optional() }),
    response: BuildState,
  }),
  bookBuildProgress: route({ method: "GET", path: "/api/v1/books/{bookId}/build/progress", auth: "user", tag: "preview", summary: "Ход идущей сборки (опрашивать раз в секунду)", params: BookParams, response: BuildProgress }),
} as const satisfies Record<string, RouteDef>;
