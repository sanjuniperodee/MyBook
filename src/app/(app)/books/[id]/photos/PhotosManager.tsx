"use client";

import { useRef, useState } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ImagePlus, LoaderCircle, Trash2, TriangleAlert } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { Alert } from "@/components/ui/Alert";
import { photoUrl } from "@/lib/urls";
import { getFormat } from "@/lib/book/formats";
import { effectiveDpi, photoAreaMm } from "@/lib/book/layout";
import { cn } from "@/lib/utils";

export interface ManagedPhoto {
  id: string;
  caption: string;
  layout: "full" | "bleed" | "half";
  width: number;
  height: number;
}

const layouts: { id: ManagedPhoto["layout"]; label: string; hint: string }[] = [
  { id: "full", label: "В рамке", hint: "Фото целиком на странице с полями и подписью" },
  { id: "bleed", label: "На всю страницу", hint: "Фото заполняет страницу до края, края обрезаются" },
  { id: "half", label: "Половина", hint: "Два фото на одной странице" },
];

export function PhotosManager({ bookId, format, initial, editable }: { bookId: string; format: string; initial: ManagedPhoto[]; editable: boolean }) {
  const [photos, setPhotos] = useState(initial);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const captionTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const fmt = getFormat(format);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const upload = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|avif|tiff?)$/i.test(f.name));
    if (!images.length) return;
    setErrors([]);
    setUploading({ done: 0, total: images.length });
    const errs: string[] = [];
    for (let i = 0; i < images.length; i += 3) {
      const chunk = images.slice(i, i + 3);
      const form = new FormData();
      chunk.forEach((f) => form.append("files", f));
      try {
        const res = await apiFetch<{ photos: ManagedPhoto[]; errors: string[] }>(`/api/books/${bookId}/photos`, { method: "POST", body: form });
        setPhotos((p) => [...p, ...res.photos]);
        errs.push(...res.errors);
      } catch (e) {
        errs.push((e as Error).message);
        if ((e as Error).message.includes("до ")) break;
      }
      setUploading({ done: Math.min(i + 3, images.length), total: images.length });
    }
    setErrors(errs);
    setUploading(null);
    if (input.current) input.current.value = "";
  };

  const update = async (id: string, patch: Partial<ManagedPhoto>) => {
    setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      await apiFetch(`/api/books/${bookId}/photos/${id}`, { method: "PATCH", json: patch });
    } catch (e) {
      setErrors([(e as Error).message]);
    }
  };

  const updateCaption = (id: string, caption: string) => {
    setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, caption } : p)));
    const t = captionTimers.current.get(id);
    if (t) clearTimeout(t);
    captionTimers.current.set(
      id,
      setTimeout(() => void update(id, { caption }), 700),
    );
  };

  const remove = async (id: string) => {
    if (!confirm("Удалить фото из книги?")) return;
    const prev = photos;
    setPhotos((ps) => ps.filter((p) => p.id !== id));
    try {
      await apiFetch(`/api/books/${bookId}/photos/${id}`, { method: "DELETE" });
    } catch (e) {
      setPhotos(prev);
      setErrors([(e as Error).message]);
    }
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const prev = photos;
    const next = arrayMove(photos, photos.findIndex((p) => p.id === active.id), photos.findIndex((p) => p.id === over.id));
    setPhotos(next);
    try {
      await apiFetch(`/api/books/${bookId}/photos/order`, { method: "PUT", json: { ids: next.map((p) => p.id) } });
    } catch (err) {
      setPhotos(prev);
      setErrors([(err as Error).message]);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        if (!editable || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!editable || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragOver(false);
        void upload([...e.dataTransfer.files]);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-medium sm:text-5xl">Фотографии</h1>
          <p className="mt-2 text-muted">{photos.length ? "Перетаскивайте карточки, чтобы изменить порядок." : "Загрузите самые тёплые кадры — они появятся между главами."}</p>
        </div>
        {editable ? (
          <>
            <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void upload([...(e.target.files ?? [])])} />
            <button className="btn btn-primary btn-lg" onClick={() => input.current?.click()} disabled={!!uploading}>
              {uploading ? <LoaderCircle className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
              {uploading ? `Загружаем ${uploading.done}/${uploading.total}` : "Добавить фото"}
            </button>
          </>
        ) : null}
      </div>

      {errors.length ? (
        <Alert className="mt-6">
          {errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </Alert>
      ) : null}

      {photos.length === 0 ? (
        <button
          disabled={!editable}
          onClick={() => input.current?.click()}
          className={cn(
            "mt-10 flex w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-24 text-center transition",
            dragOver ? "border-wine bg-wine/5" : "border-line hover:border-ink/30",
          )}
        >
          <ImagePlus className="size-12 text-muted" strokeWidth={1.3} />
          <div className="mt-4 text-lg font-medium">Фотографий пока нет</div>
          <div className="mt-1 text-sm text-muted">Перетащите файлы сюда или нажмите, чтобы выбрать. JPG, PNG, WEBP до 25 МБ.</div>
        </button>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
            <div className={cn("mt-8 grid gap-5 rounded-3xl sm:grid-cols-2 lg:grid-cols-3", dragOver && "outline-2 outline-offset-8 outline-wine outline-dashed")}>
              {photos.map((p, i) => {
                const fit = p.layout === "bleed" ? "cover" : "contain";
                const dpi = effectiveDpi(p, photoAreaMm(fmt, p.layout), fit);
                return (
                  <SortablePhoto key={p.id} id={p.id} disabled={!editable}>
                    {(handle) => (
                      <div className="card overflow-hidden">
                        <div className="relative aspect-[4/3] bg-cream">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photoUrl(p.id)} alt={p.caption} className="h-full w-full object-cover" loading="lazy" />
                          <span className="absolute top-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white">{i + 1}</span>
                          {editable ? (
                            <div className="absolute top-3 right-3 flex gap-1.5">
                              <button {...handle} className="flex size-9 cursor-grab items-center justify-center rounded-full bg-white/90 shadow active:cursor-grabbing" aria-label="Перетащить">
                                <GripVertical className="size-4" />
                              </button>
                              <button onClick={() => remove(p.id)} className="flex size-9 items-center justify-center rounded-full bg-white/90 text-red-700 shadow" aria-label="Удалить">
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          ) : null}
                          {dpi < 150 ? (
                            <span className="absolute inset-x-3 bottom-3 flex items-center gap-1.5 rounded-lg bg-amber-500/95 px-2.5 py-1.5 text-xs text-white" title={`${dpi} dpi при печати`}>
                              <TriangleAlert className="size-3.5 shrink-0" /> Низкое разрешение — фото может быть нечётким
                            </span>
                          ) : null}
                        </div>
                        <div className="space-y-3 p-4">
                          <input
                            className="input h-10 text-sm"
                            placeholder="Подпись к фото (необязательно)"
                            value={p.caption}
                            maxLength={200}
                            onChange={(e) => updateCaption(p.id, e.target.value)}
                            disabled={!editable || p.layout === "bleed"}
                            title={p.layout === "bleed" ? "У фото на всю страницу подписи нет" : undefined}
                          />
                          <div className="grid grid-cols-3 gap-1 rounded-xl bg-cream/70 p-1">
                            {layouts.map((l) => (
                              <button
                                key={l.id}
                                title={l.hint}
                                disabled={!editable}
                                onClick={() => update(p.id, { layout: l.id })}
                                className={cn("rounded-lg py-1.5 text-xs font-medium transition", p.layout === l.id ? "bg-white shadow-soft" : "text-muted hover:text-ink")}
                              >
                                {l.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </SortablePhoto>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortablePhoto({ id, disabled, children }: { id: string; disabled: boolean; children: (handle: Record<string, unknown>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={cn(isDragging && "opacity-80 shadow-lift")}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}
