/**
 * Предпросмотр книги в API v1: та же экранная сборка, что у сайта (previews.build / progressOf), в плоском виде для
 * клиентов. Картинки полос и PDF отдают маршруты сайта по адресам из ответа.
 */
import type { z } from "zod";
import type { BookBuild as BookBuildDto, BuildState } from "@mybook/contracts";
import { PAGE_IMAGE_WIDTHS, type BookBuild, type BookBuildState } from "@/lib/book/book-build";
import { apiBook, HttpError } from "@/server/api";
import { container } from "@/server/container";
import type { Handlers } from "../app";

const toBuild = (b: BookBuild): z.output<typeof BookBuildDto> => ({
  fp: b.fp,
  pageCount: b.pageCount,
  contentPages: b.contentPages,
  trimMm: b.trimMm,
  pages: b.pages.map((p) => ({ n: p.n, kind: p.kind, chapterKey: p.chapterKey ?? null })),
  chapterPages: b.chapterPages,
  imageBase: b.imageBase,
  imageWidths: [...PAGE_IMAGE_WIDTHS],
});

function toState(bookId: string, s: BookBuildState): z.output<typeof BuildState> {
  const pdfUrl = `/api/books/${bookId}/preview`;
  if (s.status === "ready") return { status: "ready", build: toBuild(s.build), error: null, retryInMs: null, pdfUrl };
  const build = s.previous ? toBuild(s.previous) : null;
  if (s.status === "building") return { status: "building", build, error: null, retryInMs: null, pdfUrl };
  return { status: "failed", build, error: s.error, retryInMs: s.retryInMs ?? 0, pdfUrl };
}

export const previewHandlers: Pick<Handlers, "bookBuild" | "bookBuildProgress"> = {
  async bookBuild({ req, input }) {
    await apiBook(req, input.bookId);
    const state = await container().previews.build(input.bookId, { retry: input.retry === "1" });
    if (!state) throw new HttpError(404, "bookNotFound");
    return toState(input.bookId, state);
  },

  async bookBuildProgress({ req, input }) {
    await apiBook(req, input.bookId);
    const p = container().previews.progressOf(input.bookId);
    return { progress: p ? { ...p, percent: Math.round(p.percent), etaMs: p.etaMs === null ? null : Math.round(p.etaMs) } : null };
  },
};
