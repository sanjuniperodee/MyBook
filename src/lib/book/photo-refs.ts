import { photoUrl } from "@/lib/urls";
import type { PhotoSpec } from "./cover-kit";
import { frameKey, parseFrames } from "./photo-frame";

type PhotoDims = { id: string; width: number; height: number };
type FrameBook = { photoFrames?: unknown };

const spec = (side: "cover" | "back", slot: number, p: PhotoDims, book: FrameBook, size: "thumb" | "view" | "full"): PhotoSpec => ({
  href: photoUrl(p.id, size),
  width: p.width,
  height: p.height,
  frame: parseFrames(book.photoFrames)[frameKey(side, slot)],
});

/** Фото лицевой стороны по местам шаблона (ids — coverPhotoIds): адрес, размеры снимка и кадр. Пустое место — undefined. */
export function coverPhotoRefs(ids: (string | null)[], photos: PhotoDims[], book: FrameBook, size: "thumb" | "view" | "full" = "thumb"): (PhotoSpec | undefined)[] {
  return ids.map((id, i) => {
    const p = id ? photos.find((x) => x.id === id) : undefined;
    return p ? spec("cover", i, p, book, size) : undefined;
  });
}

/** Фото оборота по порядку выбранных (как в редакторе и в печати). */
export function backPhotoRefs(list: PhotoDims[], book: FrameBook, size: "thumb" | "view" | "full" = "thumb"): PhotoSpec[] {
  return list.map((p, i) => spec("back", i, p, book, size));
}
