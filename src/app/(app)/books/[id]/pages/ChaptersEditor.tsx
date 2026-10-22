"use client";

import { useState } from "react";
import { ChevronDown, ImagePlus, Images, RotateCcw, Undo2, X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { isChapterPhotoKey } from "@/lib/book/layout";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { GALLERY_KEY, isRemovedChapter, TOC_EPIGRAPH_MAX, TOC_TITLE_MAX, type SampleTocCandidate, type TocLines, type TocLineSetting } from "@/lib/book/toc";
import { cn } from "@/lib/class-names";
import { photoUrl } from "@/lib/urls";
import { StoryList, type StoryInfo } from "./StoryList";
import { chapterPhotoCount, chapterPhotoStatus, type ChapterPhotoStatus } from "./pages-photos";

const LETTERS = "c:__letters";

/** Какой лист фото открыть из «Глав книги»: фото главы или альбом в конце. */
export type PhotoSheetTarget = { kind: "chapter"; key: string } | { kind: "album" };

/** Фото глав в строках: места фото (photoPlaceOf под текущее оформление), есть ли в оформлении фото главы, альбом. */
export interface ChapterPhotoRows {
  places: ReadonlyMap<string, PhotoPlace>;
  openerDesign: boolean;
  /** Альбом в конце — строка видна, когда в нём есть фото. */
  album: { title: string; count: number } | null;
  onOpen: (target: PhotoSheetTarget) => void;
}

/**
 * Главы книги: своё название (во всей книге — начальная полоса, колонтитул, оглавление) и «убрать главу» — страницы
 * с её названием не будет, истории перейдут в предыдущую главу. Видно всегда, даже без страницы «Содержание».
 * Настройки — те же строки глав (toc.ts, ключ `c:<глава>`), сборку книги делает layout.ts (foldChapters).
 * У каждой главы — фото главы: выбрано (миниатюра), «без фото», не выбрано или его нет в оформлении; кнопка
 * открывает лист «Фото главы». Своя книга (blank): главы называет и собирает автор в редакторе — здесь только фото.
 */
export function ChaptersEditor({
  photos,
  blank = false,
  bookId,
  candidates,
  lines,
  stories,
  editable,
  onChange,
}: {
  /** Фото глав — кнопка «Фото главы» в карточке и строка альбома. */
  photos?: ChapterPhotoRows;
  /** Своя книга: названия и порядок глав — в редакторе, здесь только фото глав. */
  blank?: boolean;
  bookId: string;
  /** Истории книги по id ответа — для правки заголовков внутри глав. */
  stories: Readonly<Record<string, StoryInfo>>;
  /** Строки книги из образца разворота: главы (и убранные — folded) и истории по порядку. */
  candidates: readonly SampleTocCandidate[];
  lines: TocLines;
  editable: boolean;
  onChange: (lines: TocLines) => void;
}) {
  const m = useMessages();
  const t = m.books.pages;
  const [open, setOpen] = useState<string | null>(null);
  const chapters = candidates.filter((c) => c.kind === "chapter" && c.pageKey !== GALLERY_KEY);
  const storiesOf = (key: string) => candidates.filter((c) => c.kind === "section" && c.parent === key);
  if (!chapters.length || chapters.every((c) => c.key.startsWith("c:planned-"))) return <p className="text-sm text-muted">{t.chaptersLater}</p>;

  const setLine = (key: string, patch: TocLineSetting) => onChange(withChapterLine(lines, key, patch));

  const rows = chapterRows(chapters, lines, (key) => storiesOf(key).length);
  // Куда переносить истории: оставшиеся главы темы (не письма).
  const targets = rows.filter((r) => !r.removed && r.c.key !== LETTERS).map((r) => ({ key: r.c.pageKey, title: lines[r.c.key]?.title?.trim() || r.c.label }));
  const removedCount = rows.filter((r) => r.removed).length;

  return (
    <div>
      {removedCount ? <p className="mb-2 text-xs text-muted">{t.chaptersRemovedCount(removedCount)}</p> : null}
      <ul className="space-y-2">
        {rows.map(({ c, removed, number, into, count }) => {
          const s = lines[c.key];
          return (
            <li key={c.key} className={cn("rounded-2xl p-3 ring-1 transition", removed ? "bg-cream/60 ring-line/60" : "bg-white ring-line")}>
              <div className="flex items-center gap-2">
                <span className="w-7 shrink-0 text-right text-sm text-muted tabular-nums">{number ? `${number}.` : "—"}</span>
                {blank ? <span className="min-w-0 flex-1 truncate py-2 text-sm font-medium">{s?.title?.trim() || c.label}</span> : null}
                {blank ? null : <input
                  className={cn("input h-10 min-w-0 flex-1 text-sm font-medium", removed && "line-through opacity-50")}
                  value={s?.title ?? ""}
                  placeholder={c.label}
                  maxLength={TOC_TITLE_MAX}
                  aria-label={t.chapterNameAria(c.label)}
                  onChange={(e) => setLine(c.key, { title: e.target.value })}
                  disabled={!editable || removed}
                />}
                {blank ? null : s?.title && !removed ? (
                  <button type="button" className="shrink-0 rounded-lg p-2.5 text-muted hover:bg-cream hover:text-ink disabled:opacity-50 sm:p-1.5" title={t.chapterNameReset} aria-label={t.chapterNameReset} onClick={() => setLine(c.key, { title: "" })} disabled={!editable}>
                    <RotateCcw className="size-4" />
                  </button>
                ) : null}
                {blank || c.first ? null : removed ? (
                  <button type="button" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-wine hover:bg-white disabled:opacity-50" onClick={() => setLine(c.key, { hidden: false })} disabled={!editable}>
                    <Undo2 className="size-4" /> {t.chapterRestore}
                  </button>
                ) : (
                  // На телефоне — только крестик (подпись для чтения с экрана): иначе полю названия главы оставалось пол-слова.
                  <button type="button" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm text-muted hover:bg-cream hover:text-ink disabled:opacity-50 max-sm:px-0" onClick={() => setLine(c.key, { hidden: true })} disabled={!editable} title={t.chapterRemove}>
                    <X className="size-4" /> <span className="max-sm:sr-only">{t.chapterRemove}</span>
                  </button>
                )}
              </div>
              {removed || blank ? null : (
                <div className="mt-1.5 flex items-center gap-2 pl-9">
                  <input
                    className="input h-9 min-w-0 flex-1 text-sm italic"
                    value={s?.epigraph ?? ""}
                    placeholder={c.epigraph || t.chapterEpigraphPlaceholder}
                    maxLength={TOC_EPIGRAPH_MAX}
                    aria-label={t.chapterEpigraphAria(c.label)}
                    onChange={(e) => setLine(c.key, { epigraph: e.target.value })}
                    disabled={!editable}
                  />
                  {s?.epigraph ? (
                    <button type="button" className="shrink-0 rounded-lg p-2.5 text-muted hover:bg-cream hover:text-ink disabled:opacity-50 sm:p-1.5" title={t.chapterEpigraphReset} aria-label={t.chapterEpigraphReset} onClick={() => setLine(c.key, { epigraph: "" })} disabled={!editable}>
                      <RotateCcw className="size-4" />
                    </button>
                  ) : null}
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-9 text-xs text-muted">
                {blank ? null : <span>{removed ? (into ? t.chapterMovedInto(count, into) : t.chapterRemovedNoHost) : c.first ? `${t.chapterStories(count)} · ${t.chapterFirst}` : t.chapterStories(count)}</span>}
                {photos && !removed && isChapterPhotoKey(c.pageKey) ? (
                  <ChapterPhotoButton status={chapterPhotoStatus(c.pageKey, photos.places, lines, photos.openerDesign)} count={chapterPhotoCount(c.pageKey, photos.places)} onClick={() => photos.onOpen({ kind: "chapter", key: c.pageKey })} />
                ) : null}
                {count && !blank ? (
                  <button type="button" className="inline-flex items-center gap-1 font-medium text-wine hover:underline" aria-expanded={open === c.key} onClick={() => setOpen(open === c.key ? null : c.key)}>
                    {t.storiesToggle(count)} <ChevronDown className={cn("size-3.5 transition", open === c.key && "rotate-180")} />
                  </button>
                ) : null}
              </div>
              {open === c.key ? (
                <StoryList
                  bookId={bookId}
                  chapterKey={c.pageKey}
                  rows={storiesOf(c.key).map((s) => ({ id: s.key.slice(2), letter: c.key === LETTERS }))}
                  stories={stories}
                  targets={targets.filter((x) => x.key !== c.pageKey)}
                  editable={editable}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {photos?.album ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white p-3 ring-1 ring-line">
          <Images className="size-4 shrink-0 text-wine" aria-hidden />
          <span className="min-w-0 flex-1 text-sm font-medium">{m.books.pagesPhotos.albumRow(photos.album.title, photos.album.count)}</span>
          <button type="button" className="btn btn-outline btn-sm min-h-11" onClick={() => photos.onOpen({ kind: "album" })}>
            {m.books.pagesPhotos.albumEdit}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Строки глав с правкой строки key: пустое название и эпиграф не хранятся, строка без настроек убирается. «Без фото
 * главы» (noOpenerPhoto) этот блок не правит — переименование, «убрать» и эпиграф его не теряют.
 */
export function withChapterLine(lines: TocLines, key: string, patch: TocLineSetting): TocLines {
  const next = { ...lines[key], ...patch };
  const clean: TocLineSetting = {};
  if (next.title) clean.title = next.title.slice(0, TOC_TITLE_MAX);
  if (next.hidden) clean.hidden = true;
  if (next.epigraph) clean.epigraph = next.epigraph.slice(0, TOC_EPIGRAPH_MAX);
  if (next.noOpenerPhoto) clean.noOpenerPhoto = true;
  const rest = { ...lines };
  delete rest[key];
  return Object.keys(clean).length ? { ...rest, [key]: clean } : rest;
}

/** Номер главы и куда уйдут истории убранной — по текущим правкам, ещё до сохранения. */
function chapterRows(chapters: readonly SampleTocCandidate[], lines: TocLines, stories: (key: string) => number) {
  const rows: { c: SampleTocCandidate; removed: boolean; number: number | null; into: string; count: number }[] = [];
  let no = 0;
  let host = "";
  for (const c of chapters) {
    const removed = isRemovedChapter(c, lines);
    if (!removed) {
      no += 1;
      host = lines[c.key]?.title?.trim() || c.label;
    }
    rows.push({ c, removed, number: removed ? null : no, into: removed ? host : "", count: stories(c.key) });
  }
  return rows;
}

/**
 * Кнопка фото главы в строке: миниатюра выбранного фото (или значок) и «Фото главы · n», рядом — что с началом
 * главы: «без фото» (так решил автор), «Выбрать фото» (оформление ждёт фото, его нет), «нет фото в начале» (в этом
 * оформлении глава начинается без фото — фото главы встанут после её текста).
 */
export function ChapterPhotoButton({ status, count, onClick }: { status: ChapterPhotoStatus; count: number; onClick: () => void }) {
  const m = useMessages();
  const pp = m.books.pagesPhotos;
  return (
    <button type="button" className="-my-1.5 inline-flex min-h-11 items-center gap-2 rounded-lg text-left font-medium text-wine hover:underline" onClick={onClick} data-photo-status={status.kind}>
      {status.kind === "chosen" ? (
        // eslint-disable-next-line @next/next/no-img-element -- миниатюра фото главы
        <img src={photoUrl(status.photoId)} alt="" className="size-8 shrink-0 rounded-md object-cover ring-1 ring-line" />
      ) : (
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", status.kind === "needed" ? "border border-dashed border-amber-500 bg-amber-50 text-amber-700" : "bg-cream text-muted")}>
          <ImagePlus className="size-4" aria-hidden />
        </span>
      )}
      <span>{pp.rowBtn(count)}</span>
      {status.kind === "noDesign" ? <span className="font-normal text-muted">· {pp.rowNoOpener}</span> : null}
      {status.kind === "none" ? <span className="font-normal text-muted">· {pp.rowNoneChosen}</span> : null}
      {status.kind === "needed" ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">{m.editor.chapterStart.choose}</span> : null}
    </button>
  );
}
