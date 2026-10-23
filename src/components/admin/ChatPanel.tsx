"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, BadgePercent, BookOpen, Check, Mic, FileText, Forward, Trash2, LoaderCircle, Lock, MessageSquareQuote, Paperclip, Pencil, Receipt, ReceiptText, Reply, SendHorizontal, Sparkles, Wallet, X } from "lucide-react";
import { aiSuggestReplyAction, aiTemplateDraftAction } from "@/app/admin/ai-actions";
import { TemplateEditor } from "@/app/admin/templates/TemplateEditor";
import { deleteMessageAction, editMessageAction, markReadAction, sendInternalNoteAction, sendMessageAction, sendOfferAction } from "@/app/admin/chats/actions";
import { ask } from "@/components/ui/overlays";
import { AUDIO_EVENT, type AudioEvent } from "./chat/VoicePlayer";
import { ForwardDialog } from "./chat/ForwardDialog";
import { TemplateDialog } from "./chat/TemplateDialog";
import { VoiceRecorder, canRecordVoice } from "./chat/VoiceRecorder";
import { MediaViewer, type ViewerItem } from "./chat/MediaViewer";
import { MessageBubble, formatter, hasCaption, canForward, canRemove, isTemp, mediaSrc, selectable, snippet, time, type Msg } from "./chat/MessageBubble";
import { MentionTextarea } from "./MentionTextarea";
import { InvoiceDialog } from "./invoices/InvoiceDialog";
import { newIssueKey } from "./invoices/model";
import type { ChatOffers } from "@/modules/marketing";
import { fillTemplate } from "@/shared/domain/templates";
import { toast, toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";

/** Ближе стольких пикселей к низу — «внизу»: новые сообщения прокручивают ленту, дальше — только кнопка «↓». */
const NEAR_BOTTOM = 160;
/** Файлов за раз (как на сервере) и размер одного. */
const MAX_FILES = 10;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ACCEPT = "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar";

/** Выбранный файл перед отправкой: превью для фото и видео. */
type Draft = { id: string; file: File; url: string | null };

/**
 * Время — в часовом поясе магазина, как и во всей CRM (браузер менеджера может быть настроен иначе).
 * Пояс приходит от сервера (storeTimeZone): в браузере TZ процесса нет. День — та же формула, что zonedDay
 * из shared/domain/time, но без импорта: модуль не попадает в клиентские чанки чатов.
 */
const dayKey = (d: Date, tz: string) => formatter("en-CA", tz, "day", {}).format(d);

function dayLabel(iso: string, tz: string) {
  const d = new Date(iso);
  const today = new Date();
  const key = dayKey(d, tz);
  if (key === dayKey(today, tz)) return "Сегодня";
  if (key === dayKey(new Date(today.getTime() - 86_400_000), tz)) return "Вчера";
  const sameYear = key.slice(0, 4) === dayKey(today, tz).slice(0, 4);
  return formatter("ru-RU", tz, sameYear ? "date" : "date-year", { day: "numeric", month: "long", year: sameYear ? undefined : "numeric" }).format(d);
}

/** Те же поля — то же сообщение: ссылку на прежний объект оставляем, чтобы пузырь не перерисовывался впустую. */
function sameMsg(a: Msg, b: Msg) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Msg>;
  for (const k of keys) {
    if (a[k] === b[k]) continue;
    if (k === "replyTo" && a.replyTo && b.replyTo && (Object.keys(a.replyTo) as (keyof NonNullable<Msg["replyTo"]>)[]).every((f) => a.replyTo![f] === b.replyTo![f])) continue;
    return false;
  }
  return true;
}


/**
 * Переписка с клиентом и поле ответа. Список сообщений приходит с сервера и обновляется router.refresh() (ChatsLive);
 * отправленное показываем сразу (оптимистично), пока сервер его не подтвердит. Лента не прыгает вниз, пока сотрудник
 * читает старое: новые — кнопкой «↓». Сообщения: ответ (цитата), пересылка, правка и удаление своего, файлы,
 * просмотр фото и видео во весь экран, голосовые с волной, скоростью и расшифровкой.
 */
export function ChatPanel({
  conversationId,
  messages,
  canSend,
  templates,
  vars,
  sendDisabledReason,
  paymentWarning = null,
  className,
  mentionables = [],
  offers = null,
  ai = false,
  invoice = null,
  timeZone,
  me = "",
}: {
  conversationId: string;
  messages: Msg[];
  canSend: boolean;
  templates: { id: string; title: string; text: string; own?: boolean }[];
  vars: { name: string; order: number | null; link: string; manager: string; fields?: Record<string, string> };
  sendDisabledReason?: string | null;
  /** Оплата сейчас не работает (кассир Kaspi отключён) — жёлтая плашка над полем ввода; сообщения при этом уходят. */
  paymentWarning?: string | null;
  className?: string;
  mentionables?: string[];
  offers?: ChatOffers | null;
  /** Подключён AI-помощник: кнопка «Подсказать ответ». */
  ai?: boolean;
  /** Можно выставить счёт (chats.send + deals.edit, сотрудник ведёт диалог и сделку): кнопка «Счёт». Сделки нет — заведётся при выпуске. */
  invoice?: { dealId: string | null } | null;
  /** Часовой пояс магазина — storeTimeZone() на сервере. */
  timeZone: string;
  /** Текущий сотрудник: своё сообщение можно изменить и удалить. */
  me?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  /** Заметка AI к подсказанному черновику: чего хочет клиент и на каком этапе (видна над полем ввода, пока не отправили). */
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [local, setLocal] = useState<Msg[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showOffers, setShowOffers] = useState(false);
  const [discount, setDiscount] = useState({ percent: 10, hours: 48 });
  const [mode, setMode] = useState<"client" | "note">(canSend ? "client" : "note");
  // Ключ формы счёта — новый на каждое открытие диалога: повторное нажатие «Выставить» не выпустит второй счёт.
  const [invoiceKey, setInvoiceKey] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<Msg | null>(null);
  /** Режим выбора (как в WhatsApp): отмеченные сообщения для пересылки и удаления; null — обычная лента. */
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [templating, setTemplating] = useState(false);
  /** Идёт запись голосового. */
  const [recording, setRecording] = useState(false);
  /** «Создать шаблон» из сообщения: ИИ готовит черновик (loading), потом открывается редактор. */
  const [tplDraft, setTplDraft] = useState<{ loading: true } | { loading: false; title: string; text: string; replaced: { was: string; with: string }[]; ai: boolean } | null>(null);
  // Микрофон есть не везде (и не на http): узнаём после монтирования, чтобы разметка сервера и клиента совпала.
  const [micOk, setMicOk] = useState(false);
  // Узкий экран: короткая подсказка в поле ввода (длинная переносилась на три строки).
  const [narrow, setNarrow] = useState(false);
  useEffect(() => setNarrow(window.matchMedia("(max-width: 639px)").matches), []);
  useEffect(() => setMicOk(canRecordVoice()), []);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dragging, setDragging] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  // Время для окон правки и удаления («изменить» пропадает через 15 минут) — обновляется раз в полминуты.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const [sending, start] = useTransition();
  const [thinking, think] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stick = useRef(true);
  const lastCount = useRef(0);
  const forceBottom = useRef(true);

  // Каждое обновление страницы приносит все сообщения новыми объектами. Неизменившиеся берём прежними — на них держится memo пузыря.
  const known = useRef(new Map<string, Msg>());
  const fresh = useMemo(() => {
    const next = new Map<string, Msg>();
    const list = messages.map((m) => {
      const prev = known.current.get(m.id);
      const same = prev && sameMsg(prev, m) ? prev : m;
      next.set(m.id, same);
      return same;
    });
    known.current = next;
    return list;
  }, [messages]);

  // Серверная версия сообщения вытесняет локальную копию.
  const all = useMemo(() => {
    const ids = new Set(fresh.map((m) => m.id));
    return [...fresh, ...local.filter((m) => !ids.has(m.id))].sort((a, b) => a.at.localeCompare(b.at));
  }, [fresh, local]);

  // Фото и видео диалога — для просмотра во весь экран с листанием.
  const gallery = useMemo<ViewerItem[]>(
    () =>
      all
        .filter((m) => !m.deleted && !m.internal && (m.type === "image" || m.type === "video") && mediaSrc(m))
        .map((m) => ({ id: m.id, type: m.type as "image" | "video", src: mediaSrc(m)!, caption: m.text, meta: `${m.direction === "in" ? "Клиент" : (m.author ?? "Мы")} · ${dayLabel(m.at, timeZone)}, ${time(m.at, timeZone)}`, download: !!m.gateway || !!m.localSrc })),
    [all, timeZone],
  );

  useEffect(() => {
    void markReadAction(conversationId).then(() => window.dispatchEvent(new Event("crm:refresh")));
  }, [conversationId, messages.length]);

  const toBottom = useCallback((smooth: boolean) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    stick.current = true;
    setAtBottom(true);
    setUnseen(0);
  }, []);

  // Новые сообщения: внизу (или своё) — прокрутить; сотрудник читает выше — счётчик на кнопке «↓», лента не прыгает.
  useLayoutEffect(() => {
    const added = all.length - lastCount.current;
    lastCount.current = all.length;
    if (forceBottom.current) {
      forceBottom.current = false;
      toBottom(false);
      return;
    }
    if (added <= 0) return;
    const last = all[all.length - 1];
    const mine = last && last.direction === "out" && (isTemp(last) || last.authorId === me);
    if (stick.current || mine) toBottom(true);
    else setUnseen((n) => n + all.slice(-added).filter((m) => m.direction === "in").length || n);
  }, [all, me, toBottom]);

  // Фото догружаются и меняют высоту ленты: если были внизу — остаёмся внизу.
  useEffect(() => {
    const el = content.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => stick.current && scroller.current && (scroller.current.scrollTop = scroller.current.scrollHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    stick.current = near;
    setAtBottom(near);
    if (near) setUnseen(0);
  };

  // Новые сообщения приносит обновление страницы чатов (ChatsLive): событие SSE о любом диалоге, опрос — страховка.

  // Превью выбранных файлов — освобождаем память браузера.
  useEffect(() => () => drafts.forEach((d) => d.url && URL.revokeObjectURL(d.url)), [drafts]);

  const jump = (id: string) => {
    const el = scroller.current?.querySelector(`[data-mid="${id}"]`);
    if (!el) return toast("Сообщение выше, чем загружено в ленту", "error");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(id);
    window.setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1600);
  };

  const addFiles = (list: FileList | File[]) => {
    const files = [...list];
    const big = files.filter((f) => f.size > MAX_FILE_BYTES);
    if (big.length) toast(`Больше 50 МБ — не отправить: ${big.map((f) => f.name).join(", ")}`, "error");
    const ok = files.filter((f) => f.size <= MAX_FILE_BYTES && f.size > 0);
    setDrafts((d) => {
      const room = MAX_FILES - d.length;
      if (ok.length > room) toast(`Не больше ${MAX_FILES} файлов за раз`, "error");
      return [...d, ...ok.slice(0, Math.max(0, room)).map((file) => ({ id: `${file.name}-${file.size}-${Math.random()}`, file, url: /^(image|video)\//.test(file.type) ? URL.createObjectURL(file) : null }))];
    });
    setMode("client");
    input.current?.focus();
  };

  const offer = (req: Parameters<typeof sendOfferAction>[1]) => {
    setShowOffers(false);
    start(async () => {
      try {
        const r = await sendOfferAction(conversationId, req);
        toast(r.message, r.ok ? "success" : "error");
        router.refresh();
      } catch (err) {
        toastError(err);
      }
    });
  };

  const suggest = () =>
    think(async () => {
      try {
        const r = await aiSuggestReplyAction(conversationId);
        if (!r.ok) return toast(r.message, "error");
        setText(r.text);
        setAiHint(r.hint ?? null);
        if (!r.text) toast("AI считает, что отвечать сейчас не нужно", "success");
        input.current?.focus();
      } catch (err) {
        toastError(err);
      }
    });

  const cancelCompose = () => {
    if (editing) setText("");
    setEditing(null);
    setReplyTo(null);
  };

  const startEdit = (m: Msg) => {
    setReplyTo(null);
    setDrafts([]);
    setEditing(m);
    setMode(m.internal ? "note" : "client");
    setText(m.text);
    requestAnimationFrame(() => input.current?.focus());
  };

  // Шаблоны для «/» в поле ввода — с уже подставленными данными диалога.
  const slashItems = useMemo(() => templates.map((t) => ({ id: t.id, title: t.title, own: t.own, text: fillTemplate(t.text, vars) })), [templates, vars]);

  const toggleSelected = (id: string) =>
    setSelected((s) => {
      if (!s) return s;
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const stopSelecting = useCallback(() => {
    setSelected(null);
    setForwarding(false);
    setTemplating(false);
  }, []);

  // Отмеченные сообщения в порядке ленты (удалённые и пропавшие отсеиваются).
  const picked = useMemo(() => (selected ? all.filter((m) => selected.has(m.id) && selectable(m)) : []), [all, selected]);
  const canForwardPicked = canSend && picked.length > 0 && picked.every(canForward);
  // Текст для шаблона: тексты отмеченных сообщений клиентов и менеджеров (не заметок) по порядку, без заглушек вложений.
  const templateText = picked
    .filter((m) => !m.internal && hasCaption(m))
    .map((m) => m.text.trim())
    .join("\n");
  const canRemovePicked = canSend && picked.length > 0 && picked.every((m) => canRemove(m, me, now));

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !forwarding && !templating && stopSelecting();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, forwarding, templating, stopSelecting]);

  const removePicked = () =>
    void (async () => {
      const list = picked;
      const one = list.length === 1 ? list[0] : null;
      const question = one ? (one.internal ? "Удалить заметку?" : one.status === "error" ? "Удалить неотправленное сообщение?" : "Удалить сообщение у всех? Клиент увидит «Сообщение удалено».") : `Удалить сообщения (${list.length})? Клиент увидит «Сообщение удалено».`;
      if (!(await ask(question, true))) return;
      start(async () => {
        const errors = new Set<string>();
        for (const m of list) {
          const r = await deleteMessageAction(conversationId, m.id);
          if (r.error) errors.add(r.error);
        }
        if (errors.size) toast([...errors].join("; "), "error");
        stopSelecting();
        router.refresh();
      });
    })();

  const onAction = (kind: "reply" | "forward" | "edit" | "remove" | "copy" | "select" | "template", m: Msg) => {
    if (kind === "template") {
      setTplDraft({ loading: true });
      void aiTemplateDraftAction(conversationId, m.id)
        .then((r) => {
          if (!r.ok) {
            toast(r.message, "error");
            return setTplDraft(null);
          }
          setTplDraft({ loading: false, title: r.title, text: r.text, replaced: r.replaced, ai: r.ai });
        })
        .catch((err) => {
          toastError(err);
          setTplDraft(null);
        });
    } else if (kind === "forward" || kind === "remove" || kind === "select") setSelected(new Set([m.id]));
    else if (kind === "reply") {
      setEditing(null);
      setReplyTo(m);
      setMode("client");
      input.current?.focus();
    } else if (kind === "copy") void navigator.clipboard?.writeText(m.text).then(() => toast("Скопировано", "success"));
    else if (kind === "edit") startEdit(m);
  };

  /** Голосовое закончилось — следующее голосовое подряд (как в мессенджере). */
  const onVoiceEnded = (id: string) => {
    const i = all.findIndex((m) => m.id === id);
    const next = all[i + 1];
    if (next && next.type === "audio" && !next.deleted) window.dispatchEvent(new CustomEvent<AudioEvent>(AUDIO_EVENT, { detail: { id: next.id, action: "play" } }));
  };

  // Набор текста перерисовывает панель на каждую букву — ленту не трогаем: обработчики стабильные, строки в useMemo.
  const latest = useRef({ onAction, jump, onVoiceEnded, toggleSelected, gallery });
  latest.current = { onAction, jump, onVoiceEnded, toggleSelected, gallery };
  const h = useMemo(
    () => ({
      onAction: (kind: Parameters<typeof onAction>[0], m: Msg) => latest.current.onAction(kind, m),
      jump: (id: string) => latest.current.jump(id),
      onVoiceEnded: (id: string) => latest.current.onVoiceEnded(id),
      toggleSelected: (id: string) => latest.current.toggleSelected(id),
      openMedia: (id: string) => setViewer(Math.max(0, latest.current.gallery.findIndex((g) => g.id === id))),
    }),
    [],
  );

  const rows = useMemo(() => {
    let lastDay = "";
    return all.map((m, i) => {
            const day = dayLabel(m.at, timeZone);
            const sep = day !== lastDay;
            lastDay = day;
            // Подряд от одного отправителя в пределах 5 минут — одной группой: плотнее, хвостик у последнего.
            const prev = all[i - 1];
            const next = all[i + 1];
            const same = (a?: Msg, b?: Msg) => !!a && !!b && a.direction === b.direction && !!a.internal === !!b.internal && a.author === b.author && Math.abs(new Date(b.at).getTime() - new Date(a.at).getTime()) < 5 * 60_000 && dayLabel(a.at, timeZone) === dayLabel(b.at, timeZone);
            const first = sep || !same(prev, m);
            const last = !same(m, next);
            return (
              <div
                key={m.id}
                className={cn(first ? "mt-3" : "mt-0.5", selected && selectable(m) && "relative -mx-3 cursor-pointer py-0.5 pr-3 pl-10 transition-colors sm:-mx-6 sm:pr-6", selected?.has(m.id) && "bg-wine/10")}
                // Идёт выбор: клик в любом месте сообщения отмечает его, а не открывает фото или ссылку.
                onClickCapture={
                  selected && selectable(m)
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        h.toggleSelected(m.id);
                      }
                    : undefined
                }
              >
                {selected && selectable(m) ? (
                  <span aria-hidden className={cn("absolute top-1/2 left-3 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border sm:left-6", selected.has(m.id) ? "border-wine bg-wine text-white" : "border-line bg-white")}>
                    {selected.has(m.id) ? <Check className="size-3.5" /> : null}
                  </span>
                ) : null}
                {sep ? (
                  <div className="sticky top-1 z-10 mb-3 text-center">
                    <span className="rounded-full bg-white/95 px-3 py-1 text-[11px] font-medium text-ink-soft shadow-sm ring-1 ring-line">{day}</span>
                  </div>
                ) : null}
                <MessageBubble
                  first={first}
                  last={last}
                  m={m}
                  me={me}
                  now={now}
                  timeZone={timeZone}
                  conversationId={conversationId}
                  canSend={canSend}
                  highlighted={highlight === m.id}
                  selecting={!!selected}
                  onAction={h.onAction}
                  onOpenMedia={h.openMedia}
                  onJump={h.jump}
                  onVoiceEnded={h.onVoiceEnded}
                />
              </div>
            );
          });
  }, [all, timeZone, selected, highlight, me, now, conversationId, canSend, h]);

  const sendFiles = (caption: string, reply: Msg | null) => {
    const list = drafts;
    setDrafts([]);
    const at = Date.now();
    const temps: Msg[] = list.map((d, i) => ({
      id: `tmp-${at}-${i}`,
      direction: "out",
      type: /^image\/(jpeg|png|webp)$/.test(d.file.type) ? "image" : /^video\/(mp4|quicktime|3gpp)$/.test(d.file.type) ? "video" : d.file.type.startsWith("audio/") ? "audio" : "document",
      text: i === 0 ? caption : "",
      mediaUrl: null,
      localSrc: d.url ?? undefined,
      fileName: d.file.name,
      status: "pending",
      error: null,
      author: vars.manager || "Вы",
      at: new Date(at + i).toISOString(),
      authorId: me,
    }));
    setLocal((l) => [...l, ...temps]);
    start(async () => {
      const form = new FormData();
      list.forEach((d) => form.append("files", d.file, d.file.name));
      form.set("caption", caption);
      if (reply) form.set("replyToId", reply.id);
      try {
        const res = await fetch(`/api/admin/chats/${conversationId}/files`, { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { results?: { name: string; id?: string; status?: string; error?: string }[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Файлы не отправились");
        const failed = (data.results ?? []).filter((r) => r.error);
        if (failed.length) toast(`Не ушло: ${failed.map((f) => `${f.name} — ${f.error}`).join("; ")}`, "error");
        // Сервер записал сообщения — локальные копии уходят после обновления.
        setLocal((l) => l.filter((m) => !temps.some((t) => t.id === m.id)));
        router.refresh();
      } catch (err) {
        setLocal((l) => l.map((m) => (temps.some((t) => t.id === m.id) ? { ...m, status: "error", error: (err as Error).message } : m)));
        toastError(err);
      }
    });
  };

  /** Голосовое: запись браузера уходит на сервер, тот перекодирует её в формат голосовых WhatsApp. Сразу показываем своё, со звуком. */
  const sendVoice = ({ blob, mime, ms }: { blob: Blob; mime: string; ms: number }) => {
    const reply = replyTo;
    setRecording(false);
    setReplyTo(null);
    const url = URL.createObjectURL(blob);
    const tempId = `tmp-${Date.now()}`;
    setLocal((l) => [...l, { id: tempId, direction: "out", type: "audio", text: "", mediaUrl: null, localSrc: url, status: "pending", error: null, author: vars.manager || "Вы", at: new Date().toISOString(), authorId: me, replyTo: reply ? { id: reply.id, text: reply.text, type: reply.type, direction: reply.direction, author: reply.author } : null }]);
    start(async () => {
      const form = new FormData();
      form.set("voice", blob, `voice.${/mp4|aac/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : "webm"}`);
      form.set("durationMs", String(ms));
      if (reply) form.set("replyToId", reply.id);
      try {
        const res = await fetch(`/api/admin/chats/${conversationId}/voice`, { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { error?: string | null };
        if (!res.ok) throw new Error(data.error ?? "Голосовое не отправилось");
        if (data.error) toast(data.error, "error");
        setLocal((l) => l.filter((m) => m.id !== tempId));
        router.refresh();
      } catch (err) {
        setLocal((l) => l.map((m) => (m.id === tempId ? { ...m, status: "error", error: (err as Error).message } : m)));
        toastError(err);
      }
    });
  };

  const send = () => {
    setAiHint(null);
    const body = text.trim();
    if (sending) return;
    if (editing) {
      if (!body || body === editing.text) return cancelCompose();
      const target = editing;
      setEditing(null);
      setText("");
      start(async () => {
        const r = await editMessageAction(conversationId, target.id, body);
        if (r.error) {
          toast(r.error, "error");
          setEditing(target);
          setText(body);
        }
        router.refresh();
      });
      return;
    }
    const reply = replyTo;
    if (drafts.length && mode === "client") {
      setText("");
      setReplyTo(null);
      return sendFiles(body, reply);
    }
    if (!body) return;
    const tempId = `tmp-${Date.now()}`;
    const internal = mode === "note";
    setLocal((l) => [
      ...l,
      {
        id: tempId,
        direction: "out",
        type: "text",
        text: body,
        mediaUrl: null,
        status: internal ? "sent" : "pending",
        error: null,
        author: vars.manager || "Вы",
        at: new Date().toISOString(),
        internal,
        authorId: me,
        replyTo: reply && !internal ? { id: reply.id, text: reply.text, type: reply.type, direction: reply.direction, author: reply.author } : null,
      },
    ]);
    setText("");
    setReplyTo(null);
    start(async () => {
      try {
        if (internal) {
          const res = await sendInternalNoteAction(conversationId, body);
          setLocal((l) => l.map((m) => (m.id === tempId ? { ...m, id: res.id } : m)));
          router.refresh();
          return;
        }
        let res = await sendMessageAction(conversationId, body, undefined, reply?.id ?? null);
        if ("blocked" in res) {
          // Номер, карта или реквизиты: не отправляем, пока менеджер не объяснит зачем (руководитель увидит причину).
          const reason = window.prompt(`${res.blocked}\n\nЕсли отправить всё же нужно, напишите причину — руководитель её увидит:`);
          if (!reason?.trim()) {
            setLocal((l) => l.filter((m) => m.id !== tempId));
            setText(body);
            return;
          }
          res = await sendMessageAction(conversationId, body, reason, reply?.id ?? null);
          if ("blocked" in res) throw new Error(res.blocked);
        }
        const sent = res;
        setLocal((l) => l.map((m) => (m.id === tempId ? { ...m, id: sent.id, status: sent.status, error: sent.error } : m)));
        router.refresh();
      } catch (err) {
        setLocal((l) => l.map((m) => (m.id === tempId ? { ...m, status: "error", error: (err as Error).message } : m)));
        toastError(err);
      }
    });
  };

  const canAttach = canSend && mode === "client" && !editing;
  return (
    <div
      className={cn("relative flex min-h-0 flex-col", className)}
      onDragEnter={(e) => {
        if (!canAttach || ![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => canAttach && [...e.dataTransfer.types].includes("Files") && e.preventDefault()}
    >
      {dragging ? (
        <div
          className="absolute inset-0 z-30 m-2 flex items-center justify-center rounded-2xl border-2 border-dashed border-wine bg-white/85 text-sm font-medium text-wine"
          onDragLeave={() => setDragging(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
        >
          <Paperclip className="mr-2 size-5" /> Отпустите — файлы прикрепятся к сообщению
        </div>
      ) : null}
      <div
        ref={scroller}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto bg-[#f4efe7] px-3 py-4 sm:px-6"
        style={{ backgroundImage: "radial-gradient(rgba(122,31,43,0.07) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
        data-testid="chat-messages"
      >
        <div ref={content} className="mx-auto max-w-3xl">
          {all.length === 0 ? (
            <div className="mx-auto mt-16 max-w-xs rounded-2xl bg-white/80 px-5 py-6 text-center text-sm text-muted shadow-sm">Сообщений пока нет — напишите первым 👋</div>
          ) : null}
          {rows}
        </div>
      </div>
      {!atBottom ? (
        <button type="button" onClick={() => toBottom(true)} className="absolute right-4 bottom-28 z-20 flex size-11 items-center justify-center rounded-full border border-line bg-white text-ink shadow-lg hover:bg-cream" aria-label="К новым сообщениям">
          <ArrowDown className="size-5" />
          {unseen ? <span className="absolute -top-1.5 -right-1 min-w-5 rounded-full bg-emerald-600 px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums">{unseen}</span> : null}
        </button>
      ) : null}
      {viewer !== null && gallery.length ? <MediaViewer items={gallery} index={Math.min(viewer, gallery.length - 1)} onIndex={setViewer} onClose={() => setViewer(null)} /> : null}
      {forwarding && picked.length ? <ForwardDialog conversationId={conversationId} messageIds={picked.map((m) => m.id)} preview={picked.length === 1 ? snippet(picked[0]) : `Сообщений: ${picked.length}`} onClose={() => setForwarding(false)} onDone={stopSelecting} /> : null}
      {templating && templateText ? <TemplateDialog initialText={templateText.slice(0, 2000)} onClose={() => setTemplating(false)} onDone={stopSelecting} /> : null}
      {tplDraft?.loading ? (
        <div className="fixed inset-x-0 bottom-24 z-[90] flex justify-center" role="status">
          <div className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm text-white shadow-xl">
            <Sparkles className="size-4 animate-pulse" /> Готовлю шаблон…
          </div>
        </div>
      ) : null}
      {tplDraft && !tplDraft.loading ? (
        <TemplateEditor
          tpl={null}
          initial={{ title: tplDraft.title, text: tplDraft.text }}
          manager={vars.manager}
          onClose={() => setTplDraft(null)}
          onSaved={() => {
            setTplDraft(null);
            router.refresh();
          }}
          notice={
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-sm text-violet-900">
              <p className="flex items-center gap-1.5 font-medium">
                <Sparkles className="size-4" /> {tplDraft.replaced.length ? "Данные клиента заменены подстановками" : "Подстановки не понадобились"}
              </p>
              {tplDraft.replaced.length ? (
                <p className="mt-1 text-xs">{tplDraft.replaced.map((r) => `«${r.was}» → ${r.with}`).join(" · ")}</p>
              ) : (
                <p className="mt-1 text-xs">В этом сообщении нет данных конкретного клиента — шаблон получился обычным текстом. Подстановки можно добавить кнопками ниже.</p>
              )}
              <p className="mt-1 text-xs opacity-80">Проверьте текст и название — потом нажмите «Создать шаблон». В чате он будет по «/».</p>
            </div>
          }
        />
      ) : null}
      {invoice && invoiceKey ? <InvoiceDialog issueKey={invoiceKey} dealId={invoice.dealId} conversationId={conversationId} onClose={() => setInvoiceKey(null)} /> : null}
      {selected ? (
        <div className="flex items-center gap-2 border-t border-line bg-white px-3 py-3 sm:px-4" data-testid="chat-selection-bar">
          <button type="button" onClick={stopSelecting} className="rounded-full p-2 text-muted hover:bg-cream hover:text-ink" aria-label="Отменить выбор">
            <X className="size-5" />
          </button>
          <span className="flex-1 text-sm font-medium">{picked.length ? `Выбрано: ${picked.length}` : "Выберите сообщения"}</span>
          {canSend ? (
            <button type="button" className="btn btn-sm btn-outline" disabled={!templateText || sending} onClick={() => setTemplating(true)} title={templateText ? "Сохранить текст выбранных сообщений как шаблон быстрого ответа" : "В выбранных нет текста"}>
              <MessageSquareQuote className="size-4" /> В шаблон
            </button>
          ) : null}
          <button type="button" className="btn btn-sm" disabled={!canForwardPicked || sending} onClick={() => setForwarding(true)} title={canForwardPicked || !picked.length ? undefined : "Заметки пересылать нельзя"}>
            <Forward className="size-4" /> Переслать
          </button>
          <button type="button" className="btn btn-sm text-red-700" disabled={!canRemovePicked || sending} onClick={removePicked} title={canRemovePicked || !picked.length ? undefined : "Удалить можно только свои сообщения за последние двое суток"}>
            <Trash2 className="size-4" /> Удалить
          </button>
        </div>
      ) : null}
      <div className={cn("relative border-t px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4", selected && "hidden", mode === "note" ? "border-amber-200 bg-amber-50/70" : "border-line bg-white")}>
        {showTemplates && mode === "client" ? (
          <div className="absolute right-3 bottom-full left-3 z-20 mb-2 flex max-h-72 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-xl">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {templates.length === 0 ? <p className="px-4 py-5 text-center text-sm text-muted">Шаблонов пока нет</p> : null}
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="block w-full px-4 py-2.5 text-left hover:bg-cream/60"
                  onClick={() => {
                    setText(fillTemplate(t.text, vars));
                    setShowTemplates(false);
                    input.current?.focus();
                  }}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {t.title}
                    {t.own ? <span className="rounded-full bg-rose px-1.5 py-px text-[10px] font-medium text-wine">мой</span> : null}
                  </span>
                  <span className="line-clamp-1 text-xs text-muted">{t.text}</span>
                </button>
              ))}
            </div>
            <Link href="/admin/templates" className="flex items-center gap-2 border-t border-line bg-cream/40 px-4 py-2 text-xs font-medium text-wine hover:bg-cream">
              <Pencil className="size-3.5" /> Мои шаблоны — создать и изменить
            </Link>
          </div>
        ) : null}
        {showOffers && offers ? (
          <div className="absolute bottom-full left-3 z-20 mb-2 w-80 space-y-1 rounded-xl border border-line bg-white p-2 shadow-xl" data-testid="offers">
            <button type="button" disabled={!offers.order || sending} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-cream/60 disabled:opacity-40" onClick={() => offer({ kind: "order" })}>
              <Receipt className="size-4 text-wine" /> {offers.order ? `Ссылка на оплату заказа №${offers.order.number}` : "Неоплаченного заказа нет"}
            </button>
            <button type="button" disabled={!offers.book || sending} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-cream/60 disabled:opacity-40" onClick={() => offer({ kind: "book" })}>
              <BookOpen className="size-4 text-wine" /> {offers.book ? `Ссылка на книгу «${offers.book.title}»` : "Книги в работе нет"}
            </button>
            {offers.maxDiscount > 0 ? (
              <div className="rounded-lg border border-line p-2">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <BadgePercent className="size-4 text-wine" /> Персональная скидка
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <select className="input h-8 text-sm" value={discount.percent} onChange={(e) => setDiscount((d) => ({ ...d, percent: Number(e.target.value) }))} aria-label="Размер скидки">
                    {[5, 10, 15, 20, 25, 30].filter((p) => p <= offers.maxDiscount).map((p) => (
                      <option key={p} value={p}>
                        {p}%
                      </option>
                    ))}
                  </select>
                  <select className="input h-8 text-sm" value={discount.hours} onChange={(e) => setDiscount((d) => ({ ...d, hours: Number(e.target.value) }))} aria-label="Срок действия">
                    <option value={24}>на сутки</option>
                    <option value={48}>на 2 дня</option>
                    <option value={72}>на 3 дня</option>
                    <option value={168}>на неделю</option>
                  </select>
                  <button type="button" className="btn btn-sm h-8" disabled={sending} onClick={() => offer({ kind: "discount", ...discount })}>
                    Отправить
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted">Одноразовый промокод; по ссылке скидка применится сама.</p>
              </div>
            ) : null}
          </div>
        ) : null}
        {sendDisabledReason && mode === "client" ? <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{sendDisabledReason}</p> : null}
        {paymentWarning && mode === "client" ? (
          <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="chat-payment-warning">
            {paymentWarning}
          </p>
        ) : null}
        {replyTo || editing ? (
          <div className="mb-2 flex items-center gap-2 rounded-xl border-l-4 border-wine bg-cream/60 px-3 py-1.5 text-xs">
            {editing ? <Pencil className="size-4 shrink-0 text-wine" /> : <Reply className="size-4 shrink-0 text-wine" />}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-wine">{editing ? "Изменение сообщения" : replyTo!.direction === "in" ? "Ответ клиенту" : `Ответ на: ${replyTo!.author ?? "сообщение"}`}</div>
              <div className="truncate text-ink-soft">{snippet((editing ?? replyTo)!)}</div>
            </div>
            <button type="button" onClick={cancelCompose} className="rounded-full p-1 text-muted hover:bg-white" aria-label="Отменить">
              <X className="size-4" />
            </button>
          </div>
        ) : null}
        {drafts.length && mode === "client" ? (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {drafts.map((d) => (
              <div key={d.id} className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-line bg-cream/60">
                {d.url && d.file.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.url} alt="" className="size-full object-cover" />
                ) : d.url ? (
                  <video src={d.url} muted className="size-full object-cover" />
                ) : (
                  <span className="flex size-full flex-col items-center justify-center gap-0.5 p-1 text-center text-[9px] leading-tight break-all text-ink-soft">
                    <FileText className="size-4" />
                    {d.file.name.slice(0, 24)}
                  </span>
                )}
                <button type="button" onClick={() => setDrafts((l) => l.filter((x) => x.id !== d.id))} className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white" aria-label="Убрать файл">
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {aiHint ? (
          <div className="mb-2 flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900" data-testid="ai-hint">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{aiHint}</span>
            <button type="button" onClick={() => setAiHint(null)} className="shrink-0 rounded p-0.5 text-violet-700 hover:bg-violet-100" aria-label="Скрыть подсказку">
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
        <div className="mb-2 flex items-center gap-2 text-xs">
          <div className="inline-flex shrink-0 rounded-full bg-cream/70 p-0.5 whitespace-nowrap">
            {canSend ? (
              <button type="button" onClick={() => setMode("client")} className={cn("rounded-full px-3 py-1 font-medium transition", mode === "client" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}>
                Клиенту
              </button>
            ) : null}
            <button type="button" onClick={() => (setMode("note"), setReplyTo(null))} className={cn("flex items-center gap-1 rounded-full px-3 py-1 font-medium transition", mode === "note" ? "bg-amber-500 text-white shadow-sm" : "text-muted hover:text-ink")}>
              <Lock className="size-3" /> Заметка для коллег
            </button>
          </div>
          <span className="ml-auto hidden truncate text-[11px] text-muted 2xl:inline">Enter — отправить · Shift+Enter — новая строка</span>
        </div>
        {recording ? (
          <div className="flex items-center gap-2">
            <VoiceRecorder onSend={sendVoice} onCancel={() => setRecording(false)} />
          </div>
        ) : null}
        <div className={cn("flex items-end gap-2", recording && "hidden")}>
          <div className={cn("flex min-w-0 flex-1 flex-wrap items-end gap-0.5 rounded-[22px] border px-1.5 py-1 transition focus-within:ring-2 sm:flex-nowrap", mode === "note" ? "border-amber-300 bg-white focus-within:ring-amber-200" : "border-line bg-[#fbf9f5] focus-within:border-wine/40 focus-within:ring-wine/10")}>
          {mode === "client" && !editing ? (
            <>
              <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => (e.target.files?.length && addFiles(e.target.files), (e.target.value = ""))} />
              {canSend ? (
                <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-cream hover:text-ink" onClick={() => fileInput.current?.click()} title="Прикрепить фото, видео или файл (можно перетащить в чат или вставить Ctrl+V)" aria-label="Прикрепить файл">
                  <Paperclip className="size-5" />
                </button>
              ) : null}
              <button type="button" className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-cream hover:text-ink", showTemplates && "bg-cream text-ink")} onClick={() => (setShowTemplates((v) => !v), setShowOffers(false))} title="Шаблоны ответов" aria-label="Шаблоны">
                <MessageSquareQuote className="size-5" />
              </button>
              {offers ? (
                <button type="button" className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-cream hover:text-ink", showOffers && "bg-cream text-ink")} onClick={() => (setShowOffers((v) => !v), setShowTemplates(false))} title="Оплата и скидка" aria-label="Оплата и скидка">
                  <Wallet className="size-5" />
                </button>
              ) : null}
              {invoice ? (
                <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-cream hover:text-ink" onClick={() => (setInvoiceKey(newIssueKey()), setShowOffers(false), setShowTemplates(false))} title="Счёт на оплату: ссылка клиенту в чат" aria-label="Счёт">
                  <ReceiptText className="size-5" />
                </button>
              ) : null}
              {ai ? (
                <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-cream hover:text-ink text-violet-700 hover:text-violet-800" onClick={suggest} disabled={thinking} title="AI: подсказать ответ (вы сможете поправить текст перед отправкой)" aria-label="Подсказать ответ">
                  {thinking ? <LoaderCircle className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
                </button>
              ) : null}
            </>
          ) : null}
          <MentionTextarea
            ref={input}
            value={text}
            onValueChange={setText}
            wrapperClassName="order-first basis-full sm:order-none sm:basis-auto"
            mentionables={mentionables}
            slashItems={mode === "client" && !editing && canSend ? slashItems : undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              } else if (e.key === "Escape" && (replyTo || editing)) {
                e.preventDefault();
                cancelCompose();
              } else if (e.key === "ArrowUp" && !text && !editing) {
                // ↑ в пустом поле — изменить своё последнее сообщение (как в мессенджерах).
                const lastOwn = [...all].reverse().find((m) => m.authorId === me && m.direction === "out" && m.type === "text" && !m.deleted && !isTemp(m) && (m.internal || Date.now() - new Date(m.at).getTime() < 15 * 60_000));
                if (lastOwn) {
                  e.preventDefault();
                  startEdit(lastOwn);
                }
              }
            }}
            onPaste={(e) => {
              const files = [...e.clipboardData.files];
              if (files.length && canAttach) {
                e.preventDefault();
                addFiles(files);
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={editing ? "Новый текст… (Esc — отмена)" : mode === "note" ? "Заметка видна только сотрудникам. @имя — позвать коллегу" : drafts.length ? "Подпись к файлам (необязательно)…" : narrow ? "Сообщение…" : "Написать сообщение… (/ — шаблоны)"}
            className="max-h-40 min-h-9 w-full resize-none border-0 bg-transparent px-2 py-2 text-[14px] outline-none field-sizing-content placeholder:text-muted/80"
            aria-label="Текст сообщения"
          />
          </div>
          {canSend && micOk && mode === "client" && !editing && !text.trim() && !drafts.length ? (
            <button type="button" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-wine text-white shadow-md transition hover:bg-wine-dark disabled:opacity-40" disabled={sending} onClick={() => setRecording(true)} aria-label="Записать голосовое" title="Записать голосовое сообщение">
              <Mic className="size-5" />
            </button>
          ) : (
            <button
              type="button"
              className={cn("flex size-11 shrink-0 items-center justify-center rounded-full text-white shadow-md transition disabled:opacity-40 disabled:shadow-none", mode === "note" ? "bg-amber-500 hover:bg-amber-600" : "bg-wine hover:bg-wine-dark")}
              disabled={(!text.trim() && !(drafts.length && mode === "client")) || sending}
              onClick={send}
              aria-label={editing ? "Сохранить" : "Отправить"}
            >
              {sending ? <LoaderCircle className="size-5 animate-spin" /> : editing ? <Pencil className="size-5" /> : <SendHorizontal className="ml-0.5 size-5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
