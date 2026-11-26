import type { z } from "zod";
import type { BookBuild as BookBuildDto, BuildProgress as BuildProgressDto, BuildState } from "@mybook/contracts";
import { PAGE_IMAGE_WIDTHS, type BookBuild, type BookBuildState, type BuildProgress } from "@/lib/book/book-build";

/**
 * Экранная сборка предпросмотра и её ход в формате API v1 — общие для mybook-api и бэкенда на Nest (ADR 0014).
 */

export const toBuildDto = (b: BookBuild): z.output<typeof BookBuildDto> => ({
  fp: b.fp,
  pageCount: b.pageCount,
  contentPages: b.contentPages,
  trimMm: b.trimMm,
  pages: b.pages.map((p) => ({ n: p.n, kind: p.kind, chapterKey: p.chapterKey ?? null })),
  chapterPages: b.chapterPages,
  imageBase: b.imageBase,
  imageWidths: [...PAGE_IMAGE_WIDTHS],
});

export function toBuildStateDto(bookId: string, s: BookBuildState): z.output<typeof BuildState> {
  const pdfUrl = `/api/books/${bookId}/preview`;
  if (s.status === "ready") return { status: "ready", build: toBuildDto(s.build), error: null, retryInMs: null, pdfUrl };
  const build = s.previous ? toBuildDto(s.previous) : null;
  if (s.status === "building") return { status: "building", build, error: null, retryInMs: null, pdfUrl };
  return { status: "failed", build, error: s.error, retryInMs: s.retryInMs ?? 0, pdfUrl };
}

export function toBuildProgressDto(p: BuildProgress | null): z.output<typeof BuildProgressDto> {
  return {
    progress: p ? { ...p, percent: Math.round(p.percent), etaMs: p.etaMs === null ? null : Math.round(p.etaMs) } : null,
  };
}
