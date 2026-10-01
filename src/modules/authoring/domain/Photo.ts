import { AggregateRoot } from "@/shared/domain";
import type { InlinePhotoStyle } from "@/lib/book/inline-photo";
import { normalizeStyle } from "@/lib/book/inline-photo";

export interface PhotoProps {
  bookId: string;
  position: number;
  storageKey: string;
  thumbKey: string;
  width: number;
  height: number;
  caption: string;
  layout: "full" | "bleed" | "half";
  questionId: string | null;
  inline: InlinePhotoStyle | null;
}

export const MAX_PHOTOS = 120;

/** Фото книги: в галерее главы или внутри ответа на вопрос. */
export class Photo extends AggregateRoot<PhotoProps> {
  static restore(id: string, props: PhotoProps) {
    return new Photo(id, props);
  }

  /** Широкие кадры по умолчанию занимают полстраницы. */
  static uploaded(id: string, input: { bookId: string; position: number; storageKey: string; thumbKey: string; width: number; height: number }) {
    return new Photo(id, { ...input, caption: "", layout: input.width > input.height * 1.15 ? "half" : "full", questionId: null, inline: null });
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

  update(patch: { caption?: string; layout?: PhotoProps["layout"]; questionId?: string | null; inline?: InlinePhotoStyle | null }) {
    if (patch.caption !== undefined) this.props.caption = patch.caption.trim().slice(0, 200);
    if (patch.layout !== undefined) this.props.layout = patch.layout;
    if (patch.questionId !== undefined) this.props.questionId = patch.questionId;
    if (patch.inline !== undefined) this.props.inline = patch.inline ? normalizeStyle(patch.inline) : null;
  }

  /** Поворот на 90° по часовой: меняются размеры и ключи файлов, точка фокуса поворачивается вместе с кадром. */
  rotated(files: { storageKey: string; thumbKey: string }) {
    const previous = { storageKey: this.props.storageKey, thumbKey: this.props.thumbKey };
    const inline = this.props.inline ? { ...this.props.inline, focusX: 1 - this.props.inline.focusY, focusY: this.props.inline.focusX } : null;
    this.props = { ...this.props, ...files, width: this.props.height, height: this.props.width, inline };
    return previous;
  }
}
