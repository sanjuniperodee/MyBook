"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, FileText, Images, LoaderCircle, Trash2, Upload, Video } from "lucide-react";
import type { BotMaterial, MaterialLang } from "@/modules/messaging/domain/botMaterials";
import { deleteBotMaterialAction, saveBotMaterialsAction } from "./actions";
import { cn } from "@/lib/class-names";

const LANGS: [MaterialLang, string][] = [
  ["any", "всем"],
  ["ru", "русским"],
  ["kk", "казахским"],
];

const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`);

/**
 * Подборка материалов AI-продажника — то, что менеджер присылает клиенту перед ценой: фото готовых книг, видео, пример
 * книги PDF. Бот отправляет её один раз за беседу: фото альбомом, потом видео, потом пример на языке клиента.
 */
export function BotMaterials({ initial }: { initial: BotMaterial[] }) {
  const [items, setItems] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const patch = (id: string, p: Partial<BotMaterial>) => {
    setItems((list) => list.map((m) => (m.id === id ? { ...m, ...p } : m)));
    setDirty(true);
  };
  const move = (i: number, d: -1 | 1) => {
    setItems((list) => {
      const next = [...list];
      const j = i + d;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setMsg(null);
    for (const f of Array.from(files)) {
      setUploading(f.name);
      const body = new FormData();
      body.set("file", f);
      body.set("lang", "any");
      const res = await fetch("/api/admin/bot/materials", { method: "POST", body }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as { material?: BotMaterial; error?: string } | null;
      if (!res?.ok || !data?.material) {
        setMsg({ ok: false, text: `${f.name}: ${data?.error ?? "не загрузился"}` });
        break;
      }
      setItems((list) => [...list, data.material!]);
    }
    setUploading(null);
    if (input.current) input.current.value = "";
  }

  const save = () =>
    start(async () => {
      const r = await saveBotMaterialsAction(items.map(({ id, caption, about, lang, on }) => ({ id, caption, about, lang, on })));
      if (r.error) setMsg({ ok: false, text: r.error });
      else {
        setDirty(false);
        setMsg({ ok: true, text: "Подборка сохранена" });
      }
    });

  const count = (k: BotMaterial["kind"]) => items.filter((m) => m.on && m.kind === k).length;

  return (
    <section className="space-y-3 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Images className="size-4" /> Материалы для клиента
        </h3>
        <span className="text-xs text-muted">
          {count("image")} фото · {count("video")} видео · {count("document")} PDF
        </span>
      </div>
      <p className="text-xs text-muted">
        Как делает менеджер: когда понятно, для кого книга и к какой дате, или клиент спрашивает «как это выглядит / сколько стоит», бот один раз присылает подборку — короткая подводка, фото
        альбомом, видео, пример книги на языке клиента, потом срок, цена и вопрос. Если менеджер уже присылал файлы в этом чате, бот их не повторяет. Подпись видит клиент; «что на файле» — только
        бот, чтобы понимать, что он отправил.
      </p>
      {msg ? <p className={cn("text-xs", msg.ok ? "text-emerald-700" : "text-red-700")}>{msg.text}</p> : null}

      {items.length ? (
        <ul className="divide-y divide-line rounded-lg border border-line bg-white">
          {items.map((m, i) => (
            <li key={m.id} className={cn("flex gap-3 p-2.5", !m.on && "opacity-50")}>
              <a href={`/api/admin/bot/materials/${m.id}`} target="_blank" rel="noreferrer" className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-cream" title="Открыть">
                {m.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/admin/bot/materials/${m.id}`} alt="" className="size-full object-cover" loading="lazy" />
                ) : m.kind === "video" ? (
                  <Video className="size-6 text-muted" />
                ) : (
                  <FileText className="size-6 text-muted" />
                )}
              </a>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="truncate font-medium text-ink">{m.name}</span>
                  <span className="shrink-0">{size(m.size)}</span>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <input value={m.caption} onChange={(e) => patch(m.id, { caption: e.target.value })} maxLength={300} placeholder={m.kind === "image" ? "Подпись (у фото обычно не нужна)" : "Подпись для клиента"} className="input h-8 text-sm" aria-label="Подпись" />
                  <input value={m.about} onChange={(e) => patch(m.id, { about: e.target.value })} maxLength={200} placeholder="Что на файле — для бота" className="input h-8 text-sm" aria-label="Что на файле" />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5">
                    Кому:
                    <select value={m.lang} onChange={(e) => patch(m.id, { lang: e.target.value as MaterialLang })} className="input h-7 py-0 text-xs">
                      {LANGS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={m.on} onChange={(e) => patch(m.id, { on: e.target.checked })} /> отправлять
                  </label>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-center gap-1">
                <button type="button" className="text-muted hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" className="text-muted hover:text-ink disabled:opacity-30" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Ниже">
                  <ArrowDown className="size-4" />
                </button>
                <button
                  type="button"
                  className="mt-auto text-muted hover:text-red-700"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await deleteBotMaterialAction(m.id);
                      setItems((list) => list.filter((x) => x.id !== m.id));
                    })
                  }
                  aria-label="Убрать из подборки"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Подборки пока нет — бот описывает книгу словами. Добавьте фото готовых книг, видео и пример книги PDF.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" multiple accept="image/*,video/*,application/pdf" className="hidden" onChange={(e) => void upload(e.target.files)} />
        <button type="button" className="btn btn-outline btn-sm" disabled={!!uploading} onClick={() => input.current?.click()}>
          {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} {uploading ? `Загружаю ${uploading}…` : "Добавить файлы"}
        </button>
        <span className="text-xs text-muted">фото до 5 МБ, видео до 16 МБ, PDF до 30 МБ</span>
        {dirty ? (
          <button type="button" className="btn btn-primary btn-sm ml-auto" disabled={pending} onClick={save}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null} Сохранить подборку
          </button>
        ) : null}
      </div>
    </section>
  );
}
