import { AggregateRoot } from "@/shared/domain";
import type { InlinePhotoStyle } from "@/lib/book/inline-photo";
import { normalizeStyle } from "@/lib/book/inline-photo";
import { normalizeCrop, rotateCrop, type PhotoCrop } from "@/lib/book/photo-crop";

export interface PhotoProps {
  bookId: string;
  position: number;
  storageKey: string;
  thumbKey: string;
  width: number;
  height: number;
  caption: string;
  layout: "full" | "bleed" | "half" | "grid";
  questionId: string | null;
  inline: InlinePhotoStyle | null;
  /** Кадр автора (точка и приближение); null — по правилу места. */
  crop: PhotoCrop | null;
  /** Глава, выбранная автором для фото вне историй; null — по правилу книги. */
  chapter?: string | null;
  /** Снимок начала главы chapter. */
  opener?: boolean;
}

/** Ключ главы: темы — латиница, своей книги — uuid, письма — __letters. */
const CHAPTER_KEY = /^[\w-]{1,80}$/;

export const MAX_PHOTOS = 120;

/** Фото книги: в галерее главы или внутри ответа на вопрос. */
export class Photo extends AggregateRoot<PhotoProps> {
  static restore(id: string, props: PhotoProps) {
    return new Photo(id, props);
  }

  /** Широкие кадры по умолчанию занимают полстраницы. */
  static uploaded(id: string, input: { bookId: string; position: number; storageKey: string; thumbKey: string; width: number; height: number }) {
    return new Photo(id, { ...input, caption: "", layout: input.width > input.height * 1.15 ? "half" : "full", questionId: null, inline: null, crop: null, chapter: null, opener: false });
  }

  get bookId() {
    return this.props.bookId;
  }
  get storageKey() {
    return this.props.storageKey;
  }
  get thumbKey() {
    return this.props.thumbKey;
  }

  get chapter() {
    return this.props.chapter ?? null;
  }

  update(patch: { caption?: string; layout?: PhotoProps["layout"]; questionId?: string | null; inline?: InlinePhotoStyle | null; crop?: Partial<PhotoCrop> | null; chapter?: string | null; opener?: boolean }) {
    if (patch.caption !== undefined) this.props.caption = patch.caption.trim().slice(0, 200);
    if (patch.layout !== undefined) this.props.layout = patch.layout;
    if (patch.questionId !== undefined) this.props.questionId = patch.questionId;
    if (patch.inline !== undefined) this.props.inline = patch.inline ? normalizeStyle(patch.inline) : null;
    if (patch.crop !== undefined) this.props.crop = normalizeCrop(patch.crop);
    if (patch.chapter !== undefined) {
      this.props.chapter = patch.chapter && CHAPTER_KEY.test(patch.chapter) ? patch.chapter : null;
      if (!this.props.chapter) this.props.opener = false;
    }
    // Снимок начала — только у фото с выбранной главой; фото в ответе им не бывает.
    if (patch.opener !== undefined) this.props.opener = patch.opener && !!this.props.chapter && !this.props.questionId;
    // Вставили в ответ — фото больше не «фото главы».
    if (this.props.questionId) {
      this.props.chapter = null;
      this.props.opener = false;
    }
  }

  /** Поворот на 90° по часовой: меняются размеры и ключи файлов, точка фокуса поворачивается вместе с кадром. */
  rotated(files: { storageKey: string; thumbKey: string }) {
    const previous = { storageKey: this.props.storageKey, thumbKey: this.props.thumbKey };
    const inline = this.props.inline ? { ...this.props.inline, focusX: 1 - this.props.inline.focusY, focusY: this.props.inline.focusX } : null;
    this.props = { ...this.props, ...files, width: this.props.height, height: this.props.width, inline, crop: rotateCrop(this.props.crop) };
    return previous;
  }
}
