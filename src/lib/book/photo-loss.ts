/**
 * Сколько снимка срежется на его месте: фото заполняет кадр с обрезкой (cover) — на весь лист и в ячейке сетки.
 * Кадры — те же, что у PDF (photo-pages: pageFrame, photoPagePlan) по оформлению и формату собранной книги. По этой
 * доле редактор выбирает «целиком, без обрезки» для фото на всю страницу и предупреждает о потере.
 * Модуль общий для сервера и браузера.
 */
import type { BookFormat } from "./formats";
import { photoPages, type BookContent, type PhotoItem } from "./layout";
import { interiorMetrics } from "./page-geometry";
import { pageFrame, photoArea, photoPagePlan } from "./photo-pages";
import { interiorSizes } from "./typesetting";

/** С такой обрезки фото, которое ставят на всю страницу, по умолчанию вписывается целиком (pageFit: contain). */
export const CONTAIN_LOSS = 0.2;
/** С такой обрезки редактор предупреждает: метка у фото, общий совет и проверка готовности. */
export const WARN_LOSS = 0.3;

/** Доля снимка, которая срежется, если заполнить им кадр пропорций frameRatio: 0 — ничего, 0,5 — половина. */
export function coverLoss(img: { width: number; height: number }, frameRatio: number) {
  const r = img.width / Math.max(1, img.height);
  return 1 - Math.min(frameRatio / r, r / frameRatio);
}

/**
 * Обрезка каждого фото собранной книги на его месте (id → доля). На всю страницу в истории и под обрез — по листу
 * («целиком» — 0). На фотостранице — по его ячейке на этой странице, как раскладывает PDF (photoPages и photoPagePlan):
 * у сетки из двух и трёх снимков ячейки свои, подписи их уменьшают, а одиночный снимок сетки вписан целиком. Остальные
 * места вписывают снимок целиком или кадрируются по выбору автора (фото в тексте, фото главы) — 0.
 */
export function photoLosses(content: Pick<BookContent, "chapters" | "galleryPhotos" | "format" | "interior">): Map<string, number> {
  const out = new Map<string, number>();
  // Фото, которое сборка поставила дважды, — по первому месту (как photoPlaceOf).
  const put = (id: string, loss: number) => {
    if (!out.has(id)) out.set(id, loss);
  };
  const page = pageFrame(content.format).ratio;
  const onSheet = (p: PhotoItem) => (p.inline?.pageFit === "contain" ? 0 : coverLoss(p, page));
  const area = photoArea(content.format);
  const sizes = interiorSizes(content.interior, interiorMetrics[content.format.id].scale);
  const onPages = (photos: PhotoItem[]) => {
    for (const group of photoPages(photos)) {
      // Снимок под обрез — один на листе (PhotoPage в PDF).
      if (group.length === 1 && group[0].layout === "bleed") put(group[0].id, onSheet(group[0]));
      else photoPagePlan(group, area, content.interior, sizes).cells.forEach((c, i) => put(c.id, c.fit === "cover" ? coverLoss(group[i], c.img.w / c.img.h) : 0));
    }
  };
  for (const ch of content.chapters) {
    for (const it of ch.items) {
      for (const p of it.photos ?? []) put(p.id, 0);
      if (it.photoBefore) put(it.photoBefore.id, onSheet(it.photoBefore));
    }
    if (ch.openerPhoto) put(ch.openerPhoto.id, 0);
    onPages(ch.photos);
  }
  onPages(content.galleryPhotos);
  return out;
}

/** Фото переводят на всю страницу в истории: заметная обрезка — «целиком, без обрезки», иначе заполнить лист. */
export function defaultPageFit(img: { width: number; height: number }, format: BookFormat): "contain" | undefined {
  return coverLoss(img, pageFrame(format).ratio) >= CONTAIN_LOSS ? "contain" : undefined;
}
