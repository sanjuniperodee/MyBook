"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus, LoaderCircle } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { apiFetch } from "@/lib/client-api";
import type { EditorPhoto } from "@/lib/book/editor-model";
import { photoUrl } from "@/lib/urls";
import { cn } from "@/lib/class-names";
import { Drawer } from "./Drawer";

/** Фото в ответ: загрузить новые (сразу встают в текущий ответ) или выбрать из фото книги. */
export function PhotoPicker({
  bookId,
  photos,
  questionId,
  questionLabel,
  onAttach,
  onDetach,
  onUploaded,
  onClose,
  otherLabel,
}: {
  bookId: string;
  photos: EditorPhoto[];
  questionId: string;
  questionLabel: string;
  onAttach: (id: string) => void;
  onDetach: (id: string) => void;
  onUploaded: (list: EditorPhoto[]) => void;
  onClose: () => void;
  otherLabel: (questionId: string) => string;
}) {
  const t = useMessages().editor.picker;
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      files.slice(0, 6).forEach((f) => form.append("files", f));
      const res = await apiFetch<{ photos: EditorPhoto[]; errors: string[] }>(`/api/books/${bookId}/photos`, { method: "POST", body: form });
      // Загруженные фото сразу вставляем в текущий ответ
      for (const p of res.photos) await apiFetch(`/api/books/${bookId}/photos/${p.id}`, { method: "PATCH", json: { questionId } });
      onUploaded(res.photos.map((p) => ({ ...p, questionId })));
      if (res.errors.length) setError(res.errors.join(", "));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <Drawer onClose={onClose} title={t.title}>
      <p className="text-sm text-muted">
        {t.intro} «<span className="text-ink">{questionLabel}</span>».
      </p>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void upload([...(e.target.files ?? [])])} />
      <button className="btn btn-primary mt-4 w-full" onClick={() => input.current?.click()} disabled={uploading}>
        {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} {uploading ? t.uploading : t.upload}
      </button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {photos.length ? (
        <>
          <div className="mt-6 mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{t.bookPhotos}</div>
          <div className="grid grid-cols-2 gap-2">
            {photos.map((p) => {
              const here = p.questionId === questionId;
              const elsewhere = !!p.questionId && !here;
              return (
                <button
                  key={p.id}
                  onClick={() => (here ? onDetach(p.id) : onAttach(p.id))}
                  className={cn("group relative overflow-hidden rounded-xl text-left ring-offset-2 ring-offset-paper", here ? "ring-2 ring-wine" : "ring-1 ring-line hover:ring-ink/30")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(p.id)} alt={p.caption} className="aspect-square w-full object-cover" />
                  {here ? (
                    <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-wine text-white">
                      <Check className="size-3.5" />
                    </span>
                  ) : null}
                  {elsewhere ? (
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1 text-[11px] text-white" title={otherLabel(p.questionId!)}>
                      {t.inAnswer(otherLabel(p.questionId!))}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">{t.hint}</p>
        </>
      ) : null}
    </Drawer>
  );
}
