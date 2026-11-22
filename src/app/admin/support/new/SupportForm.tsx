"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, MessagesSquare, Film, Image as ImageIcon, Mic, Paperclip, Square, Trash2 } from "lucide-react";
import { Field } from "@/components/ui/Field";
import { cn } from "@/lib/class-names";
import { ChatSelect, type ChatPick } from "../ChatPicker";
import type { ChatHit } from "../actions";
import { SUPPORT_KIND_LABELS, SUPPORT_KINDS, type SupportKind } from "@/shared/domain/support";

interface Initial {
  /** Чат, из которого открыли форму (?c=…). */
  chat: ChatHit | null;
  notifyPhone: string;
  clientPhone: string;
  place: string;
}

interface Item {
  id: string;
  file: File;
  recorded: boolean;
  url: string | null;
}

const KIND_HINTS: Record<SupportKind, string> = {
  bug: "Что делали, что ожидали и что получилось вместо этого. Если есть ошибка на экране — скриншот.",
  change: "Что именно поменять или добавить и зачем — как должно быть в итоге.",
  question: "Что хотите узнать.",
  other: "Опишите своими словами.",
};

const mb = (n: number) => (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0);

function iconFor(file: File) {
  if (file.type.startsWith("image/")) return ImageIcon;
  if (file.type.startsWith("video/")) return Film;
  if (file.type.startsWith("audio/") || /\.(opus|ogg|oga|m4a|mp3|wav|aac|amr)$/i.test(file.name)) return Mic;
  return FileText;
}

/** Формат записи, который умеет браузер: Chrome и Android — webm/opus, Safari — mp4/aac. */
function recorderType(): { mime: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mime: "", ext: "webm" };
  for (const [mime, ext] of [
    ["audio/webm;codecs=opus", "webm"],
    ["audio/mp4", "m4a"],
    ["audio/ogg;codecs=opus", "ogg"],
  ] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return { mime: "", ext: "webm" };
}

/**
 * Форма обращения: тип, описание, голосовые прямо с микрофона, файлы (выбрать, перетащить, вставить скриншот из буфера),
 * где и что ожидали, чей это вопрос, срочность и номер для уведомления. Отправка — одним запросом с прогрессом загрузки.
 */
export function SupportForm({ initial, filesMax, fileMaxMb, canPickChat, className }: { initial: Initial; filesMax: number; fileMaxMb: number; canPickChat: boolean; className?: string }) {
  const [pick, setPick] = useState<ChatPick | null>(null);
  const [picking, setPicking] = useState(!!initial.chat && canPickChat);
  const [kind, setKind] = useState<SupportKind>("bug");
  const [urgent, setUrgent] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState<{ number: number; phone: string } | null>(null);
  const [recording, setRecording] = useState<{ startedAt: number } | null>(null);
  const [now, setNow] = useState(0);
  const [micError, setMicError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  // Свежий список файлов для обработчиков, созданных раньше (конец записи голосового).
  const itemsRef = useRef<Item[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  // Ушли со страницы посреди записи — отпускаем микрофон.
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [recording]);

  // Ссылки предпросмотра освобождаем, когда файл убрали или форма ушла.
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const all = urls.current;
    return () => all.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  function add(files: File[], recorded = false) {
    let problem = "";
    let room = filesMax - itemsRef.current.length;
    const added: Item[] = [];
    for (const file of files) {
      if (room <= 0) {
        problem = `Не больше ${filesMax} файлов в одном обращении`;
        break;
      }
      if (file.size > fileMaxMb * 1024 * 1024) {
        problem = `«${file.name}» больше ${fileMaxMb} МБ — сожмите или пришлите ссылкой в описании`;
        continue;
      }
      const preview = file.type.startsWith("image/") || file.type.startsWith("audio/") || recorded;
      const url = preview ? URL.createObjectURL(file) : null;
      if (url) urls.current.add(url);
      added.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, recorded, url });
      room--;
    }
    setError(problem);
    if (added.length) setItems((prev) => [...prev, ...added]);
  }

  function remove(id: string) {
    const it = items.find((x) => x.id === id);
    if (it?.url) {
      URL.revokeObjectURL(it.url);
      urls.current.delete(it.url);
    }
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  async function startRecording() {
    setMicError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicError("Этот браузер не записывает звук. Запишите голосовое в WhatsApp и приложите файлом.");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const type = recorderType();
      const rec = new MediaRecorder(media, type.mime ? { mimeType: type.mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        media.getTracks().forEach((t) => t.stop());
        stream.current = null;
        const mime = rec.mimeType || type.mime || "audio/webm";
        const blob = new Blob(chunks, { type: mime });
        if (blob.size) add([new File([blob], `голосовое-${new Date().toLocaleTimeString("ru-RU").replace(/:/g, "-")}.${type.ext}`, { type: mime })], true);
        setRecording(null);
      };
      rec.start(1000);
      recorder.current = rec;
      setNow(Date.now());
      setRecording({ startedAt: Date.now() });
    } catch {
      setMicError("Нет доступа к микрофону — разрешите его в настройках браузера или приложите голосовое файлом.");
    }
  }

  function stopRecording() {
    recorder.current?.stop();
    recorder.current = null;
  }

  // Скриншот из буфера (Ctrl+V / «Вставить» на телефоне) — сразу во вложения.
  function onPaste(e: React.ClipboardEvent) {
    const files = [...e.clipboardData.files];
    if (files.length) {
      e.preventDefault();
      add(files.map((f, i) => (f.name && f.name !== "image.png" ? f : new File([f], `скриншот-${Date.now()}-${i + 1}.${f.type.split("/")[1] || "png"}`, { type: f.type }))));
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (recording) {
      setError("Сначала остановите запись голосового");
      return;
    }
    const form = new FormData(e.currentTarget);
    form.set("kind", kind);
    form.set("urgency", urgent ? "urgent" : "normal");
    form.set("device", `${navigator.platform || ""} ${window.screen.width}×${window.screen.height}`.trim());
    if (pick) {
      form.set("conversationId", pick.chat.id);
      form.set("messageIds", JSON.stringify(pick.ids));
    }
    for (const it of items) form.append(it.recorded ? "voice" : "files", it.file, it.file.name);
    const description = String(form.get("description") ?? "").trim();
    if (picking && !pick) {
      setError("Отметьте сообщения клиента и нажмите «Взять в обращение» — или закройте выбор чата");
      return;
    }
    if (!description && !items.length && !pick) {
      setError("Опишите, что случилось, или приложите голосовое, скриншот или видео");
      return;
    }
    setError("");
    setProgress(0);
    // XHR, а не fetch: видео с экрана весят десятки мегабайт — нужен прогресс загрузки.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/support");
    xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgress(Math.round((ev.loaded / ev.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      let res: { number?: number; phone?: string; error?: string } = {};
      try {
        res = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 413) return setError("Файлы слишком большие — отправьте часть, остальное вторым обращением");
      if (xhr.status >= 400 || !res.number) return setError(res.error || "Не получилось отправить — попробуйте ещё раз");
      setDone({ number: res.number, phone: res.phone ?? "" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Нет связи — проверьте интернет и отправьте ещё раз");
    };
    xhr.send(form);
  }

  function again() {
    items.forEach((it) => it.url && URL.revokeObjectURL(it.url));
    setItems([]);
    setDone(null);
    setUrgent(false);
    setKind("bug");
    setPick(null);
    setPicking(false);
  }

  if (done) {
    return (
      <div className={cn("rounded-[14px] border border-line bg-white p-6 sm:p-8", className)} role="status">
        <CheckCircle2 className="size-8 text-success" aria-hidden />
        <h2 className="mt-3 font-serif text-[28px] leading-tight font-medium">Обращение №{done.number} принято</h2>
        <p className="mt-2 leading-relaxed text-ink-soft">
          Если проблема из чата с клиентом — откройте обращение и приложите переписку: так разберёмся быстрее. Когда исправим, напишем в WhatsApp{done.phone ? ` на +${done.phone}` : ""}.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <a href={`/admin/support/${done.number}`} className="btn btn-primary">
            Открыть обращение №{done.number}
          </a>
          <button type="button" className="btn btn-outline" onClick={again}>
            Новое обращение
          </button>
        </div>
      </div>
    );
  }

  const seconds = recording ? Math.max(0, Math.floor((now - recording.startedAt) / 1000)) : 0;
  const busy = progress !== null;

  return (
    <form ref={formRef} onSubmit={submit} onPaste={onPaste} className={cn("space-y-8", className)} noValidate>
      <fieldset>
        <legend className="label">Что случилось</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {SUPPORT_KINDS.map((k) => (
            <button key={k} type="button" className={cn("chip min-h-11", kind === k && "chip-on")} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {SUPPORT_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </fieldset>

      {canPickChat ? (
        <section aria-labelledby="support-chat" className="rounded-[14px] border border-line bg-sunken/40 p-4">
          <h2 id="support-chat" className="label">
            Переписка с клиентом
          </h2>
          <p className="-mt-1 mb-3 text-sm text-muted">Выберите чат клиента в CRM и отметьте, что он писал по этой проблеме, — так будет точнее, чем пересказ. Голосовые расшифруем.</p>
          {pick && !picking ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <MessagesSquare className="size-4 text-muted" aria-hidden />
              <span>
                <span className="font-medium">{pick.chat.contact || `+${pick.chat.chatId}`}</span> · {pick.ids.length} сообщ.
              </span>
              <button type="button" className="text-xs underline" onClick={() => setPicking(true)}>
                изменить
              </button>
              <button type="button" className="text-xs text-muted underline" onClick={() => setPick(null)}>
                убрать
              </button>
            </div>
          ) : picking ? (
            <ChatSelect
              initialQuery={initial.clientPhone}
              initialChat={pick?.chat ?? initial.chat}
              initialIds={pick?.ids}
              pickLabel="Взять в обращение"
              onCancel={() => setPicking(false)}
              onPick={(p) => {
                setPick(p);
                setPicking(false);
                setError("");
              }}
            />
          ) : (
            <button type="button" className="btn btn-outline" onClick={() => setPicking(true)} disabled={busy}>
              <MessagesSquare className="size-4" aria-hidden /> Выбрать чат и сообщения
            </button>
          )}
        </section>
      ) : null}

      <Field label="Опишите подробно" hint={`${KIND_HINTS[kind]} Можно коротко, если выбрали сообщения клиента, или записать голосовое ниже.`}>
        <textarea name="description" className="input min-h-40" maxLength={10000} placeholder="Например: клиентка Айгерим, книга «Мама». В редакторе на телефоне текст главы 3 сам стирается, когда она печатает. Нужно, чтобы текст сохранялся." />
      </Field>

      <section aria-labelledby="support-files">
        <h2 id="support-files" className="label">
          Голосовые, скриншоты, видео, файлы
        </h2>
        <p className="-mt-1 mb-3 text-sm text-muted">
          Голосовые клиента из WhatsApp — сохраните на телефон и выберите, или после отправки приложите переписку из чата CRM. Скриншот можно вставить из буфера (Ctrl+V). До {filesMax} файлов, каждый до {fileMaxMb} МБ.
        </p>
        <div
          className={cn("rounded-[14px] border border-dashed border-line-strong bg-white p-4 transition-colors", dragOver && "border-ink bg-sunken")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            add([...e.dataTransfer.files]);
          }}
        >
          <div className="flex flex-wrap gap-2">
            {recording ? (
              <button type="button" className="btn btn-danger" onClick={stopRecording}>
                <Square className="size-4" aria-hidden /> Остановить · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
              </button>
            ) : (
              <button type="button" className="btn btn-outline" onClick={startRecording} disabled={busy}>
                <Mic className="size-4" aria-hidden /> Записать голосовое
              </button>
            )}
            <button type="button" className="btn btn-outline" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Paperclip className="size-4" aria-hidden /> Приложить файлы
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                add([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </div>
          {micError ? <p className="mt-2 text-sm text-danger">{micError}</p> : null}
          {items.length ? (
            <ul className="mt-4 space-y-2">
              {items.map((it) => {
                const Icon = iconFor(it.file);
                return (
                  <li key={it.id} className="flex items-center gap-3 rounded-[10px] bg-sunken px-3 py-2">
                    {it.url && it.file.type.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element -- локальный предпросмотр blob:
                      <img src={it.url} alt="" className="size-12 shrink-0 rounded-[6px] object-cover" />
                    ) : (
                      <Icon className="size-5 shrink-0 text-muted" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{it.recorded ? "Голосовое (записано здесь)" : it.file.name}</div>
                      {it.url && !it.file.type.startsWith("image/") ? <audio src={it.url} controls preload="metadata" className="mt-1 h-9 w-full max-w-sm" /> : <div className="text-xs text-muted tabular-nums">{mb(it.file.size)} МБ</div>}
                    </div>
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(it.id)} aria-label={`Убрать ${it.file.name}`} disabled={busy}>
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Где это" optional hint="Ссылка на страницу, название книги, номер заказа, телефон или компьютер">
          <input name="place" className="input" defaultValue={initial.place} maxLength={2000} />
        </Field>
        <Field label="Как должно быть" optional hint="Что ожидали увидеть">
          <input name="expected" className="input" maxLength={4000} />
        </Field>
      </div>

      <Field label="Телефон клиента" optional hint="Найдём его книгу, заказ и переписку">
        <input name="clientPhone" className="input" inputMode="tel" autoComplete="off" defaultValue={initial.clientPhone} placeholder="+7 7xx xxx xx xx" maxLength={40} />
      </Field>

      <label className="flex min-h-11 items-start gap-3 text-sm text-ink-soft">
        <input type="checkbox" className="mt-0.5 size-4 accent-wine" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
        <span>
          <span className="font-medium text-ink">Срочно</span> — клиент ждёт или горит заказ
        </span>
      </label>

      <div className="border-t border-line pt-8 sm:max-w-sm">
        <Field label="Ваш WhatsApp для уведомления" hint="Сюда напишем, когда исправим. По умолчанию — номер из вашей учётки">
          <input name="notifyPhone" className="input" inputMode="tel" autoComplete="tel" required defaultValue={initial.notifyPhone} placeholder="+7 7xx xxx xx xx" maxLength={40} />
        </Field>
      </div>

      {error ? (
        <p className="field-error text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary btn-lg w-full sm:w-auto" disabled={busy}>
        {busy ? (progress && progress < 100 ? `Загружаем… ${progress}%` : "Отправляем…") : "Отправить обращение"}
      </button>
    </form>
  );
}
