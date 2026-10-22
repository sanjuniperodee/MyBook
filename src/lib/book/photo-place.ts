/**
 * Где стоит каждое фото книги (правила раскладки 2, «у каждого фото одно место»): в ответе, фото начала главы, после
 * главы, в альбоме в конце или не печатается. Место выводится только из собранного содержимого (assembleBookContent)
 * и снимков обложки — подписи под фото, листы выбора места, предупреждения при удалении и проверка готовности читают
 * его отсюда и не сравнивают ключи photos.chapter сами (служебные ключи альбома и «не печатается» знает только сборка).
 * Модуль общий для сервера и браузера.
 */
import { coverPhotosOf, isChapterPhotoKey, PHOTO_OFF_KEY, type BookContent, type CoverRefs } from "./layout";
import { GALLERY_KEY } from "./toc";

export type PhotoPlaceKind = "answer" | "opener" | "after" | "album" | "off";

export interface PhotoPlace {
  kind: PhotoPlaceKind;
  /** Глава, в которой фото печатается (убранная автором глава — та, куда влиты её истории); у альбома и «не печатается» — нет. */
  chapterKey?: string;
  /** Ответ, в котором стоит фото (и снимок обложки, который прежние правила в ответе прячут). */
  questionId?: string;
  /** Место выбрано правилом книги, а не автором. */
  auto: boolean;
  /** Автор выбрал главу, в которой ещё нечего печатать: пока фото стоит по правилу книги и ждёт её. */
  waitingFor?: string;
  /** Снимок стоит и на обложке: на лицевой стороне или на обороте. */
  onCover: "cover" | "back" | null;
}

/** Фото книги: PhotoItem или строка photos (глава вне ответа — выбор автора). */
type PlacePhoto = { id: string; chapter?: string | null; questionId?: string | null };

/**
 * Места всех фото книги по id — в порядке photos. Фото, которое сборка поставила дважды, получает первое место (ответ).
 * book — ссылки на снимки обложки; на обложке — только видные на ней (coverPhotos, cover-photos.ts: withCoverPhotos).
 */
export function photoPlaceOf(content: Pick<BookContent, "chapters" | "galleryPhotos">, photos: readonly PlacePhoto[], book: CoverRefs): Map<string, PhotoPlace> {
  const shown = coverPhotosOf(book);
  const front = new Set(shown.front);
  const back = new Set(shown.back);
  const onCover = (id: string): PhotoPlace["onCover"] => (front.has(id) ? "cover" : back.has(id) ? "back" : null);
  // Ключи глав, которые печатаются: сами главы и убранные автором (их истории — в главе-хозяине).
  const printed = new Set(content.chapters.flatMap((ch) => [ch.key, ...(ch.folded ?? []).map((f) => f.key)]));
  const byId = new Map(photos.map((p) => [p.id, p]));
  // Глава выбрана, но в ней ещё нечего печатать — фото стоит по правилу книги и ждёт её.
  const waiting = (p: PlacePhoto | undefined) => (p?.chapter && isChapterPhotoKey(p.chapter) && !printed.has(p.chapter) ? p.chapter : undefined);
  const found = new Map<string, Omit<PhotoPlace, "onCover">>();
  const put = (id: string, place: Omit<PhotoPlace, "onCover">) => {
    if (!found.has(id)) found.set(id, place);
  };

  for (const ch of content.chapters)
    for (const it of ch.items)
      for (const p of [...(it.photos ?? []), ...(it.photoBefore ? [it.photoBefore] : [])]) put(p.id, { kind: "answer", chapterKey: ch.key, questionId: p.questionId ?? it.id, auto: false });
  for (const ch of content.chapters) {
    // Прежние правила ставят на начальную полосу первое фото главы сами — такое место не выбрано автором.
    if (ch.openerPhoto) put(ch.openerPhoto.id, { kind: "opener", chapterKey: ch.key, auto: !ch.openerPhoto.opener });
    for (const p of ch.photos) {
      const pinned = !!p.chapter && printed.has(p.chapter);
      put(p.id, { kind: "after", chapterKey: ch.key, auto: !pinned, ...(pinned ? {} : withWaiting(waiting(byId.get(p.id)))) });
    }
  }
  for (const p of content.galleryPhotos) {
    const pinned = p.chapter === GALLERY_KEY;
    put(p.id, { kind: "album", auto: !pinned, ...(pinned ? {} : withWaiting(waiting(byId.get(p.id)))) });
  }

  const out = new Map<string, PhotoPlace>();
  for (const p of photos) {
    const place = found.get(p.id);
    if (place) {
      out.set(p.id, { ...place, onCover: onCover(p.id) });
      continue;
    }
    // Не печатается: так решил автор, или правило книги («не печатать», снимок обложки, фото обложки в ответе по прежним правилам).
    const chosen = p.chapter === PHOTO_OFF_KEY && !p.questionId;
    out.set(p.id, { kind: "off", auto: !chosen, ...(p.questionId ? { questionId: p.questionId } : {}), ...(chosen ? {} : withWaiting(waiting(p))), onCover: onCover(p.id) });
  }
  return out;
}

const withWaiting = (key: string | undefined) => (key ? { waitingFor: key } : {});
