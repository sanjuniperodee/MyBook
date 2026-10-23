"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { usefulUi } from "@/lib/content/tools/ui";
import { analyzePhoto, looksMessengerCompressed, photoUseIds, type Verdict } from "@/lib/tools/photos";
import type { FormatId } from "@/lib/book/formats";
import { cn } from "@/lib/class-names";
import { Choice } from "./Choice";

interface Item {
  id: number;
  name: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  error?: boolean;
}

const MAX_FILES = 60;

const tone: Record<Verdict, string> = {
  great: "border-emerald-200 bg-emerald-50 text-emerald-800",
  ok: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-wine/30 bg-rose/40 text-wine",
};

/** Читает размеры снимка в браузере: файл никуда не загружается. */
function readImage(file: File, id: number): Promise<Item> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ id, name: file.name, url, width: img.naturalWidth, height: img.naturalHeight, bytes: file.size });
    img.onerror = () => resolve({ id, name: file.name, url, width: 0, height: 0, bytes: file.size, error: true });
    img.src = url;
  });
}

export function PhotoChecker() {
  const ui = usefulUi[useLocale()].photo;
  const [format, setFormat] = useState<FormatId>("a5");
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const counter = useRef(0);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    const all = urls.current;
    return () => all.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const add = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name)).slice(0, MAX_FILES);
    const read = await Promise.all(list.map((f) => readImage(f, counter.current++)));
    urls.current.push(...read.map((r) => r.url));
    setItems((prev) => [...prev, ...read].slice(0, MAX_FILES));
  };

  const ok = items.filter((i) => !i.error);
  const analyses = ok.map((i) => ({ item: i, a: analyzePhoto(i, format) }));
  const anyPlace = analyses.filter(({ a }) => a.worst !== "low").length;
  const limited = ok.length - anyPlace;

  return (
    <div className="card p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label">{ui.formatLabel}</span>
          <Choice label={ui.formatLabel} value={format} onChange={setFormat} options={(["a5", "square"] as const).map((id) => ({ id, label: ui.format[id] }))} />
        </div>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void add(e.dataTransfer.files);
        }}
        className={cn("mt-6 flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition", over ? "border-wine bg-rose/30" : "border-line bg-cream/40 hover:border-wine/40")}
      >
        <ImagePlus className="size-8 text-wine" aria-hidden />
        <span className="font-medium">{ui.dropTitle}</span>
        <span className="text-sm text-muted">{ui.dropHint}</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <p className="mt-3 text-sm text-muted">{ui.privacy}</p>

      {items.length ? (
        <div className="mt-8" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium text-ink" data-testid="photo-summary">
              {ui.summary(ok.length, anyPlace, limited)}
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                urls.current.forEach((u) => URL.revokeObjectURL(u));
                urls.current = [];
                setItems([]);
              }}
            >
              <X className="size-4" /> {ui.clear}
            </button>
          </div>

          <ul className="mt-4 space-y-4">
            {items.map((it) => {
              if (it.error)
                return (
                  <li key={it.id} className="rounded-2xl border border-wine/30 bg-rose/40 p-4 text-sm text-wine">
                    {ui.unreadable(it.name)}
                  </li>
                );
              const a = analyses.find((x) => x.item.id === it.id)!.a;
              return (
                <li key={it.id} className="grid gap-4 rounded-2xl border border-line bg-white p-4 sm:grid-cols-[120px_1fr]" data-testid="photo-card">
                  {/* eslint-disable-next-line @next/next/no-img-element -- локальный снимок из blob: оптимизировать нечего */}
                  <img src={it.url} alt={it.name} className="h-28 w-full rounded-xl object-cover sm:w-[120px]" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{it.name}</span>
                      <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", tone[a.worst])}>{ui.headline[a.worst]}</span>
                    </div>
                    <div className="mt-1 text-sm text-muted">{ui.size(it.width, it.height, ((it.width * it.height) / 1e6).toFixed(1), (it.bytes / 1048576).toFixed(1))}</div>
                    <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                      {photoUseIds.map((id) => {
                        const u = a.uses.find((x) => x.id === id)!;
                        return (
                          <li key={id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-ink-soft">{ui.use[id]}</span>
                            <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs tabular-nums", tone[u.verdict])}>
                              {u.dpi} dpi · {ui.verdict[u.verdict]}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-3 text-xs leading-relaxed text-muted">{ui.maxSize(a.maxCm.sharp, a.maxCm.soft)}</p>
                    {looksMessengerCompressed(it.name, it) ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">{ui.messenger}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-8 rounded-2xl bg-cream/60 p-5">
        <h3 className="font-medium">{ui.tipsTitle}</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-soft">
          {ui.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
