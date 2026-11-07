"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, BadgePercent, BookOpen, Check, Mic, FileText, Forward, Trash2, LoaderCircle, Lock, MessageSquareQuote, MessagesSquare, Paperclip, Pencil, Receipt, ReceiptText, Reply, SendHorizontal, Sparkles, TriangleAlert, Wallet, X } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { aiSuggestReplyAction, aiTemplateDraftAction } from "@/app/admin/ai-actions";
import { TemplateEditor } from "@/app/admin/templates/TemplateEditor";
import { deleteMessageAction, editMessageAction, markReadAction, resendMessageAction, sendInternalNoteAction, sendMessageAction, sendOfferAction } from "@/app/admin/chats/actions";
import { ask, promptText } from "@/components/ui/overlays";
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

/** Отказ сервера на файл; all — отказ не про этот файл (подпись, доступ): остальные из пачки тоже не уйдут. */
class UploadError extends Error {
  constructor(
    message: string,
    readonly all: boolean,
  ) {
    super(message);
  }
}

type UploadResult = { name: string; id?: string; status?: string; error?: string };

/** Черновик текста (и ответа) диалога — в sessionStorage: переключились на другой чат и вернулись — текст на месте. */
const draftKey = (conversationId: string) => `chat-draft:${conversationId}`;

/** Копия, у которой отправка «упала» (сеть), а сервер сообщение записал: настоящее уже в ленте — копию прячем. */
function landed(t: Msg, fresh: Msg[]) {
  if (!isTemp(t) || t.status !== "error" || t.type !== "text") return false;
  const at = new Date(t.at).getTime();
  return fresh.some((m) => m.direction === "out" && m.type === "text" && m.authorId === t.authorId && !!m.internal === !!t.internal && m.text.trim() === t.text.trim() && Math.abs(new Date(m.at).getTime() - at) < 120_000);
}

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
  // Сенсорный экран: Enter — новая строка (как в мессенджерах на телефоне), отправка — кнопкой.
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(window.matchMedia("(pointer: coarse)").matches), []);
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
  /** Очередь загрузки файлов: по одному и по порядку, даже если пока идёт пачка, отправили следующую. */
  const uploads = useRef<Promise<void>>(Promise.resolve());

  // Превью файлов (черновики и ещё не подтверждённые сервером копии): освобождаем память браузера, когда превью больше
  // не показывается — убрали файл, сервер прислал своё сообщение, закрыли диалог. Не на каждое изменение списка.
  const blobs = useRef(new Set<string>());
  const objectUrl = useCallback((b: Blob) => {
    const url = URL.createObjectURL(b);
    blobs.current.add(url);
    return url;
  }, []);
  const revoke = useCallback((url: string | null | undefined) => {
    if (url && blobs.current.delete(url)) URL.revokeObjectURL(url);
  }, []);
  useEffect(() => {
    const set = blobs.current;
    return () => {
      set.forEach((url) => URL.revokeObjectURL(url));
      set.clear();
    };
  }, []);

  // Черновик этого диалога: при открытии — из sessionStorage, дальше каждое изменение туда же (отправили — пусто).
  const restored = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey(conversationId)) ?? "null") as { text?: string; replyToId?: string | null } | null;
      if (saved?.text) setText(saved.text);
      const reply = saved?.replyToId ? messages.find((m) => m.id === saved.replyToId) : null;
      if (reply) setReplyTo(reply);
    } catch {
      // sessionStorage недоступен (приватный режим) — без черновика
    }
    restored.current = true;
    // Только при открытии: ChatPanel пересоздаётся на каждый диалог (key), сообщения потом меняются сами.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    return [...fresh, ...local.filter((m) => !ids.has(m.id) && !landed(m, fresh))].sort((a, b) => a.at.localeCompare(b.at));
  }, [fresh, local]);

  // Сервер прислал своё сообщение — локальная копия больше не нужна, её превью файла освобождаем.
  useEffect(() => {
    const ids = new Set(fresh.map((m) => m.id));
    setLocal((l) => {
      const gone = l.filter((m) => ids.has(m.id));
      if (!gone.length) return l;
      gone.forEach((m) => revoke(m.localSrc));
      return l.filter((m) => !ids.has(m.id));
    });
  }, [fresh, revoke]);

  useEffect(() => {
    if (!restored.current || editing) return;
    try {
      if (text.trim() || replyTo) sessionStorage.setItem(draftKey(conversationId), JSON.stringify({ text, replyToId: replyTo?.id ?? null }));
      else sessionStorage.removeItem(draftKey(conversationId));
    } catch {
      // нет sessionStorage — черновик не сохраняется
    }
  }, [conversationId, text, replyTo, editing]);

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
      return [...d, ...ok.slice(0, Math.max(0, room)).map((file) => ({ id: `${file.name}-${file.size}-${Math.random()}`, file, url: /^(image|video)\//.test(file.type) ? objectUrl(file) : null }))];
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
    drafts.forEach((d) => revoke(d.url));
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

  const onAction = (kind: "retry" | "discard" | "reply" | "forward" | "edit" | "remove" | "copy" | "select" | "template", m: Msg) => {
    if (kind === "discard") {
      setLocal((l) => l.filter((x) => x.id !== m.id));
      revoke(m.localSrc);
    } else if (kind === "retry" && isTemp(m)) {
      // Не дошло до сервера: та же копия уходит ещё раз; текст, возвращённый в поле ввода, там больше не нужен.
      setText((t) => (t.trim() === m.text.trim() ? "" : t));
      sendText(m.text, !!m.internal, m.replyTo ?? null, m.id);
    } else if (kind === "retry") {
      start(async () => {
        const r = await resendMessageAction(conversationId, m.id);
        toast(r.error ?? "Отправлено", r.error ? "error" : "success");
        router.refresh();
      });
    } else if (kind === "template") {
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
                className={cn(first ? "mt-3" : "mt-0.5", selected && selectable(m) && "relative -mx-3 cursor-pointer py-0.5 pr-3 pl-10 transition-colors sm:-mx-6 sm:pr-6", selected?.has(m.id) && "bg-rose/60")}
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
                  <span aria-hidden className={cn("absolute top-1/2 left-3 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border sm:left-6", selected.has(m.id) ? "border-wine bg-wine text-white" : "border-line-strong bg-white")}>
                    {selected.has(m.id) ? <Check className="size-3.5" /> : null}
                  </span>
                ) : null}
                {sep ? (
                  <div className="sticky top-2 z-10 mb-3 text-center">
                    {/* «Сегодня/Вчера» считают сервер и браузер — около полуночи они могут разойтись на день. */}
                    <span className="inline-block rounded-md border border-line bg-white px-2.5 py-0.5 text-xs font-medium text-ink-soft" suppressHydrationWarning>
                      {day}
                    </span>
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

  /** Один файл — один запрос: пачка в 10 видео не упирается в предел запроса на сервере (80 МБ). */
  const uploadOne = async (file: File, caption: string, replyToId: string | null): Promise<UploadResult> => {
    const form = new FormData();
    form.append("files", file, file.name);
    form.set("caption", caption);
    if (replyToId) form.set("replyToId", replyToId);
    const res = await fetch(`/api/admin/chats/${conversationId}/files`, { method: "POST", body: form });
    // Ответ не JSON: предел размера на сервере (413) или страница ошибки прокси.
    const data = (await res.json().catch(() => null)) as { results?: UploadResult[]; error?: string } | null;
    if (res.status === 413) throw new UploadError("файл больше, чем принимает сервер (до 50 МБ)", false);
    if (!res.ok) throw new UploadError(data?.error ?? `сервер не принял файл (ошибка ${res.status})`, res.status === 400 || res.status === 401 || res.status === 403);
    const r = data?.results?.[0];
    if (!r) throw new UploadError("сервер не ответил — обновите чат и проверьте, ушёл ли файл", false);
    return r;
  };

  /**
   * Файлы — по одному, в фоне: поле ввода не ждёт загрузки, текст можно писать и отправлять. Каждый файл — своя копия в
   * ленте; ушёл — копия получает id сервера и пропадает, когда придёт серверное сообщение.
   */
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
    const patch = (id: string, p: Partial<Msg>) => setLocal((l) => l.map((m) => (m.id === id ? { ...m, ...p } : m)));
    const run = async () => {
      for (const [i, d] of list.entries()) {
        const t = temps[i];
        try {
          const r = await uploadOne(d.file, i === 0 ? caption : "", i === 0 ? (reply?.id ?? null) : null);
          if (r.error) toast(`Не ушло: ${d.file.name} — ${r.error}`, "error");
          if (r.id) patch(t.id, { id: r.id, status: r.status ?? "sent", error: r.error ?? null });
          else patch(t.id, { status: "error", error: r.error ?? "не отправилось" });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (err instanceof UploadError && err.all) {
            // Подпись не пропустили (реквизиты) или нет доступа — не ушло ничего из остатка: файлы и подпись — обратно
            // в черновик, чтобы поправить и отправить заново.
            const rest = temps.slice(i).map((x) => x.id);
            setLocal((l) => l.filter((m) => !rest.includes(m.id)));
            setDrafts((cur) => [...list.slice(i).map((x) => ({ ...x, id: `${x.id}-again` })), ...cur]);
            if (i === 0) setText((cur) => (cur.trim() ? cur : caption));
            toast(message, "error");
            break;
          }
          patch(t.id, { status: "error", error: message });
          toast(`${d.file.name}: ${message}`, "error");
        }
      }
      router.refresh();
    };
    uploads.current = uploads.current.then(run).catch(toastError);
  };

  /** Голосовое: запись браузера уходит на сервер, тот перекодирует её в формат голосовых WhatsApp. Сразу показываем своё, со звуком. */
  const sendVoice = ({ blob, mime, ms }: { blob: Blob; mime: string; ms: number }) => {
    const reply = replyTo;
    setRecording(false);
    setReplyTo(null);
    const url = objectUrl(blob);
    const tempId = `tmp-${Date.now()}`;
    setLocal((l) => [...l, { id: tempId, direction: "out", type: "audio", text: "", mediaUrl: null, localSrc: url, status: "pending", error: null, author: vars.manager || "Вы", at: new Date().toISOString(), authorId: me, replyTo: reply ? { id: reply.id, text: reply.text, type: reply.type, direction: reply.direction, author: reply.author } : null }]);
    start(async () => {
      const form = new FormData();
      form.set("voice", blob, `voice.${/mp4|aac/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : "webm"}`);
      form.set("durationMs", String(ms));
      if (reply) form.set("replyToId", reply.id);
      try {
        const res = await fetch(`/api/admin/chats/${conversationId}/voice`, { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { id?: string; status?: string; error?: string | null };
        if (!res.ok) throw new Error(data.error ?? (res.status === 413 ? "Голосовое слишком длинное для сервера" : "Голосовое не отправилось"));
        if (data.error) toast(data.error, "error");
        // Копия со звуком остаётся до серверного сообщения (тогда и освобождается запись), а не пропадает до обновления.
        if (data.id) setLocal((l) => l.map((m) => (m.id === tempId ? { ...m, id: data.id!, status: data.status ?? "sent", error: data.error ?? null } : m)));
        else setLocal((l) => l.filter((m) => m.id !== tempId));
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
    setText("");
    setReplyTo(null);
    const internal = mode === "note";
    sendText(body, internal, reply && !internal ? { id: reply.id, text: reply.text, type: reply.type, direction: reply.direction, author: reply.author } : null);
  };

  /** Текст клиенту или заметка: сразу в ленте копией (tmp-), сервер подтверждает. tempId — повтор той же копии. */
  const sendText = (body: string, internal: boolean, reply: Msg["replyTo"], tempId = `tmp-${Date.now()}`) => {
    setLocal((l) => [
      ...l.filter((m) => m.id !== tempId),
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
        replyTo: reply ?? null,
      },
    ]);
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
          const reason = await promptText({
            title: "Отправить с реквизитами?",
            text: `${res.blocked} Если отправить всё же нужно, напишите причину — руководитель её увидит.`,
            confirmLabel: "Отправить",
            input: { required: true, placeholder: "Например, номер курьера по просьбе клиента", maxLength: 200 },
          });
          if (!reason) {
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
        // Текст не пропал: снова в поле ввода, если оно пустое; у копии в ленте — «Повторить» и «Убрать».
        setText((t) => (t.trim() ? t : body));
        toastError(err);
      }
    });
  };

  const canAttach = canSend && mode === "client" && !editing;
  const note = mode === "note";
  /** Иконка-инструмент в поле ответа: 44 px под палец, 36 — под курсор. */
  const tool = "flex size-11 shrink-0 items-center justify-center rounded-[10px] text-ink-soft transition-colors hover:bg-sunken hover:text-ink disabled:opacity-40 lg:size-9";
  const tab = (on: boolean) => cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors max-lg:h-11", on ? (note ? "bg-white/70 text-warning" : "bg-sunken text-ink") : "text-muted hover:text-ink");
  const empty = !text.trim() && !(drafts.length && mode === "client");
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
          className="absolute inset-0 z-30 m-2 flex items-center justify-center rounded-[14px] border-2 border-dashed border-wine bg-white/90 text-sm font-medium text-wine"
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
      {/* Кнопка «↓» — у низа ленты, а не панели: выросшее поле ввода её не перекрывает. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-canvas px-3 pt-2 pb-4 sm:px-6" data-testid="chat-messages">
          <div ref={content} className="mx-auto max-w-3xl">
            {all.length === 0 ? (
              <EmptyState compact icon={MessagesSquare} title="Сообщений пока нет" className="mt-10">
                {canSend ? "Напишите первым — ответ уйдёт клиенту в его мессенджер." : "Когда клиент напишет, переписка появится здесь."}
              </EmptyState>
            ) : null}
            {rows}
          </div>
        </div>
        {!atBottom ? (
          <button type="button" onClick={() => toBottom(true)} className="absolute right-4 bottom-3 z-20 flex size-11 items-center justify-center rounded-full border border-line bg-white text-ink-soft shadow-soft transition-colors hover:text-ink" aria-label={unseen ? `К новым сообщениям: ${unseen}` : "К новым сообщениям"}>
            <ArrowDown className="size-5" strokeWidth={1.8} />
            {unseen ? <span className="absolute -top-1.5 -right-1 min-w-5 rounded-full bg-wine px-1.5 text-xs leading-5 font-semibold text-white tabular-nums">{unseen}</span> : null}
          </button>
        ) : null}
      </div>
      {viewer !== null && gallery.length ? <MediaViewer items={gallery} index={Math.min(viewer, gallery.length - 1)} onIndex={setViewer} onClose={() => setViewer(null)} /> : null}
      {forwarding && picked.length ? <ForwardDialog conversationId={conversationId} messageIds={picked.map((m) => m.id)} preview={picked.length === 1 ? snippet(picked[0]) : `Сообщений: ${picked.length}`} onClose={() => setForwarding(false)} onDone={stopSelecting} /> : null}
      {templating && templateText ? <TemplateDialog initialText={templateText.slice(0, 2000)} onClose={() => setTemplating(false)} onDone={stopSelecting} /> : null}
      {tplDraft?.loading ? (
        <div className="fixed inset-x-0 bottom-24 z-[90] flex justify-center" role="status">
          <div className="flex items-center gap-2 rounded-[10px] bg-ink px-4 py-2.5 text-sm text-white shadow-soft">
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
            <div className="rounded-[10px] bg-info-bg px-3.5 py-2.5 text-sm text-info">
              <p className="flex items-center gap-1.5 font-medium">
                <Sparkles className="size-4" aria-hidden /> {tplDraft.replaced.length ? "Данные клиента заменены подстановками" : "Подстановки не понадобились"}
              </p>
              {tplDraft.replaced.length ? (
                <ul className="mt-1 space-y-0.5 text-xs">
                  {tplDraft.replaced.map((r) => (
                    <li key={`${r.was}-${r.with}`}>
                      «{r.was}» заменено на {r.with}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs">В этом сообщении нет данных конкретного клиента — шаблон получился обычным текстом. Подстановки можно добавить кнопками ниже.</p>
              )}
              <p className="mt-1 text-xs">Проверьте текст и название — потом нажмите «Создать шаблон». В чате он будет по «/».</p>
            </div>
          }
        />
      ) : null}
      {invoice && invoiceKey ? <InvoiceDialog issueKey={invoiceKey} dealId={invoice.dealId} conversationId={conversationId} onClose={() => setInvoiceKey(null)} /> : null}
      {selected ? (
        <div className="flex items-center gap-2 border-t border-line bg-white px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-4" data-testid="chat-selection-bar">
          <button type="button" onClick={stopSelecting} className="btn btn-ghost btn-icon btn-sm max-lg:size-11" aria-label="Отменить выбор">
            <X className="size-5" />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{picked.length ? `Выбрано: ${picked.length}` : "Выберите сообщения"}</span>
          {canSend ? (
            <button type="button" className="btn btn-outline btn-sm max-sm:w-11 max-sm:px-0" disabled={!templateText || sending} onClick={() => setTemplating(true)} title={templateText ? "Сохранить текст выбранных сообщений как шаблон быстрого ответа" : "В выбранных нет текста"} aria-label="В шаблон">
              <MessageSquareQuote className="size-4" /> <span className="max-sm:hidden">В шаблон</span>
            </button>
          ) : null}
          <button type="button" className="btn btn-outline btn-sm max-sm:w-11 max-sm:px-0" disabled={!canForwardPicked || sending} onClick={() => setForwarding(true)} title={canForwardPicked || !picked.length ? undefined : "Заметки пересылать нельзя"} aria-label="Переслать">
            <Forward className="size-4" /> <span className="max-sm:hidden">Переслать</span>
          </button>
          <button type="button" className="btn btn-outline btn-sm text-danger max-sm:w-11 max-sm:px-0" disabled={!canRemovePicked || sending} onClick={removePicked} title={canRemovePicked || !picked.length ? undefined : "Удалить можно только свои сообщения за последние двое суток"} aria-label="Удалить">
            <Trash2 className="size-4" /> <span className="max-sm:hidden">Удалить</span>
          </button>
        </div>
      ) : null}
      <div className={cn("relative border-t border-line bg-white px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4", selected && "hidden")}>
        <div className="relative mx-auto max-w-3xl">
          {showTemplates && mode === "client" ? (
            <div className="absolute right-0 bottom-full left-0 z-20 mb-2 flex max-h-80 flex-col overflow-hidden rounded-[14px] border border-line bg-white shadow-soft" role="dialog" aria-label="Шаблоны ответов">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <span className="text-sm font-semibold">Шаблоны ответов</span>
                <span className="hidden text-xs text-muted sm:inline">в поле ввода — «/» и название</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-1">
                {templates.length === 0 ? <p className="px-4 py-5 text-center text-sm text-muted">Шаблонов пока нет — создайте первый ниже.</p> : null}
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="block min-h-11 w-full rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-sunken"
                    onClick={() => {
                      setText(fillTemplate(t.text, vars));
                      setShowTemplates(false);
                      input.current?.focus();
                    }}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {t.title}
                      {t.own ? <span className="badge badge-accent">мой</span> : null}
                    </span>
                    <span className="line-clamp-1 text-xs text-muted">{t.text}</span>
                  </button>
                ))}
              </div>
              <Link href="/admin/templates" className="flex min-h-11 items-center gap-2 border-t border-line px-4 text-sm font-medium text-wine hover:bg-sunken/60">
                <Pencil className="size-4" aria-hidden /> Мои шаблоны: создать и изменить
              </Link>
            </div>
          ) : null}
          {showOffers && offers ? (
            <div className="absolute bottom-full left-0 z-20 mb-2 w-[min(22rem,100%)] space-y-1 rounded-[14px] border border-line bg-white p-1.5 shadow-soft" data-testid="offers" role="dialog" aria-label="Оплата и скидка">
              <button type="button" disabled={!offers.order || sending} className="flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-sm transition-colors hover:bg-sunken disabled:opacity-50 disabled:hover:bg-transparent" onClick={() => offer({ kind: "order" })}>
                <Receipt className="size-4 shrink-0 text-wine" aria-hidden /> {offers.order ? `Ссылка на оплату заказа №${offers.order.number}` : "Неоплаченного заказа нет"}
              </button>
              <button type="button" disabled={!offers.book || sending} className="flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-sm transition-colors hover:bg-sunken disabled:opacity-50 disabled:hover:bg-transparent" onClick={() => offer({ kind: "book" })}>
                <BookOpen className="size-4 shrink-0 text-wine" aria-hidden /> {offers.book ? `Ссылка на книгу «${offers.book.title}»` : "Книги в работе нет"}
              </button>
              {offers.maxDiscount > 0 ? (
                <div className="rounded-[10px] border border-line p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <BadgePercent className="size-4 text-wine" aria-hidden /> Персональная скидка
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <select className="input h-9 min-w-0 flex-1 text-sm" value={discount.percent} onChange={(e) => setDiscount((d) => ({ ...d, percent: Number(e.target.value) }))} aria-label="Размер скидки">
                      {[5, 10, 15, 20, 25, 30].filter((p) => p <= offers.maxDiscount).map((p) => (
                        <option key={p} value={p}>
                          {p}%
                        </option>
                      ))}
                    </select>
                    <select className="input h-9 min-w-0 flex-1 text-sm" value={discount.hours} onChange={(e) => setDiscount((d) => ({ ...d, hours: Number(e.target.value) }))} aria-label="Срок действия">
                      <option value={24}>на сутки</option>
                      <option value={48}>на 2 дня</option>
                      <option value={72}>на 3 дня</option>
                      <option value={168}>на неделю</option>
                    </select>
                  </div>
                  <button type="button" className="btn btn-dark btn-sm mt-2 w-full" disabled={sending} onClick={() => offer({ kind: "discount", ...discount })}>
                    Отправить промокод
                  </button>
                  <p className="mt-1.5 text-xs text-muted">Одноразовый промокод; по ссылке скидка применится сама.</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {sendDisabledReason && mode === "client" ? (
            <p className="mb-2 flex items-start gap-2 rounded-[10px] bg-warning-bg px-3 py-2 text-xs text-warning">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {sendDisabledReason}
            </p>
          ) : null}
          {paymentWarning && mode === "client" ? (
            <p className="mb-2 flex items-start gap-2 rounded-[10px] bg-warning-bg px-3 py-2 text-xs text-warning" data-testid="chat-payment-warning">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {paymentWarning}
            </p>
          ) : null}
          <div className={cn("rounded-[14px] border transition-[border-color,box-shadow,background-color] duration-150", note ? "border-warning/40 bg-warning-bg focus-within:ring-[3px] focus-within:ring-warning/15" : "border-line-strong bg-white focus-within:border-wine/60 focus-within:ring-[3px] focus-within:ring-wine/12")} data-mode={mode}>
            <div className="flex items-center gap-1 px-1.5 pt-1.5" role="group" aria-label="Кому сообщение">
              {canSend ? (
                <button type="button" aria-pressed={mode === "client"} onClick={() => setMode("client")} className={tab(mode === "client")}>
                  Клиенту
                </button>
              ) : null}
              <button type="button" aria-pressed={note} onClick={() => (setMode("note"), setReplyTo(null))} className={tab(note)}>
                <Lock className="size-3.5" aria-hidden /> Заметка для коллег
              </button>
              {!touch ? <span className="ml-auto hidden truncate pr-2 text-xs text-muted xl:inline">Enter — отправить, Shift+Enter — новая строка</span> : null}
            </div>
            {replyTo || editing ? (
              <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg border-l-2 border-wine bg-sunken py-1 pr-1 pl-3 text-[13px]">
                {editing ? <Pencil className="size-4 shrink-0 text-wine" aria-hidden /> : <Reply className="size-4 shrink-0 text-wine" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-wine">{editing ? "Изменение сообщения" : replyTo!.direction === "in" ? "Ответ клиенту" : `Ответ на: ${replyTo!.author ?? "сообщение"}`}</div>
                  <div className="truncate text-ink-soft">{snippet((editing ?? replyTo)!)}</div>
                </div>
                <button type="button" onClick={cancelCompose} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-white hover:text-ink max-lg:size-11" aria-label={editing ? "Отменить изменение" : "Отменить ответ"}>
                  <X className="size-4" />
                </button>
              </div>
            ) : null}
            {drafts.length && mode === "client" ? (
              <div className="flex gap-2 overflow-x-auto px-2.5 pt-2.5 pb-0.5">
                {drafts.map((d) => (
                  <div key={d.id} className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-line bg-sunken">
                    {d.url && d.file.type.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.url} alt="" className="size-full object-cover" />
                    ) : d.url ? (
                      <video src={d.url} muted className="size-full object-cover" />
                    ) : (
                      <span className="flex size-full flex-col items-center justify-center gap-0.5 p-1 text-center text-xs leading-tight text-ink-soft" title={d.file.name}>
                        <FileText className="size-4 shrink-0" aria-hidden />
                        <span className="line-clamp-2 w-full break-all">{d.file.name}</span>
                      </span>
                    )}
                    {/* Кружок маленький, а нажать можно на весь угол превью (на телефоне — 44 px). */}
                    <button type="button" onClick={() => (setDrafts((l) => l.filter((x) => x.id !== d.id)), revoke(d.url))} className="absolute top-0 right-0 flex items-start justify-end p-0.5 max-lg:size-11" aria-label={`Убрать файл ${d.file.name}`}>
                      <span className="rounded-full bg-black/60 p-0.5 text-white">
                        <X className="size-3" />
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {aiHint ? (
              <div className="mx-2 mt-2 flex items-start gap-2 rounded-lg bg-info-bg py-1.5 pr-1 pl-3 text-xs text-info" data-testid="ai-hint">
                <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 py-0.5">{aiHint}</span>
                <button type="button" onClick={() => setAiHint(null)} className="flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-white/60 max-lg:-my-2 max-lg:size-11" aria-label="Скрыть подсказку">
                  <X className="size-3.5" />
                </button>
              </div>
            ) : null}
            {recording ? (
              <div className="flex items-center gap-2 p-1.5">
                <VoiceRecorder onSend={sendVoice} onCancel={() => setRecording(false)} />
              </div>
            ) : null}
            <div className={cn(recording && "hidden")}>
              <MentionTextarea
                ref={input}
                value={text}
                onValueChange={setText}
                wrapperClassName="block"
                mentionables={mentionables}
                slashItems={mode === "client" && !editing && canSend ? slashItems : undefined}
                onKeyDown={(e) => {
                  // На телефоне Enter — новая строка, отправка — кнопкой; на компьютере Enter отправляет, Shift+Enter — строка.
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !touch) {
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
                placeholder={editing ? "Новый текст (Esc — отмена)" : note ? (narrow ? "Заметка для коллег…" : "Заметка видна только сотрудникам. @имя — позвать коллегу") : drafts.length ? "Подпись к файлам (необязательно)" : narrow ? "Сообщение…" : "Написать клиенту… (/ — шаблоны)"}
                className="block max-h-40 min-h-11 w-full resize-none border-0 bg-transparent px-3 py-2.5 text-[14px] leading-relaxed outline-none field-sizing-content placeholder:text-muted"
                aria-label="Текст сообщения"
              />
              <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
                {mode === "client" && !editing ? (
                  <>
                    <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => (e.target.files?.length && addFiles(e.target.files), (e.target.value = ""))} />
                    {canSend ? (
                      <button type="button" className={tool} onClick={() => fileInput.current?.click()} title="Прикрепить фото, видео или файл (можно перетащить в чат или вставить Ctrl+V)" aria-label="Прикрепить файл">
                        <Paperclip className="size-[18px]" strokeWidth={1.8} />
                      </button>
                    ) : null}
                    <button type="button" className={cn(tool, showTemplates && "bg-sunken text-ink")} onClick={() => (setShowTemplates((v) => !v), setShowOffers(false))} title="Шаблоны ответов" aria-label="Шаблоны" aria-expanded={showTemplates}>
                      <MessageSquareQuote className="size-[18px]" strokeWidth={1.8} />
                    </button>
                    {offers ? (
                      <button type="button" className={cn(tool, showOffers && "bg-sunken text-ink")} onClick={() => (setShowOffers((v) => !v), setShowTemplates(false))} title="Оплата и скидка" aria-label="Оплата и скидка" aria-expanded={showOffers}>
                        <Wallet className="size-[18px]" strokeWidth={1.8} />
                      </button>
                    ) : null}
                    {invoice ? (
                      <button type="button" className={tool} onClick={() => (setInvoiceKey(newIssueKey()), setShowOffers(false), setShowTemplates(false))} title="Счёт на оплату: ссылка клиенту в чат" aria-label="Счёт">
                        <ReceiptText className="size-[18px]" strokeWidth={1.8} />
                      </button>
                    ) : null}
                    {ai ? (
                      <button type="button" className={cn(tool, "text-info hover:text-info")} onClick={suggest} disabled={thinking} title="AI: подсказать ответ (вы сможете поправить текст перед отправкой)" aria-label="Подсказать ответ">
                        {thinking ? <LoaderCircle className="size-[18px] animate-spin" /> : <Sparkles className="size-[18px]" strokeWidth={1.8} />}
                      </button>
                    ) : null}
                  </>
                ) : null}
                <span className="flex-1" />
                {canSend && micOk && mode === "client" && !editing && empty ? (
                  <button type="button" className="btn btn-primary btn-icon shrink-0 lg:size-9 lg:rounded-lg" disabled={sending} onClick={() => setRecording(true)} aria-label="Записать голосовое" title="Записать голосовое сообщение">
                    <Mic className="size-[18px]" />
                  </button>
                ) : (
                  <button type="button" className={cn("btn shrink-0 max-lg:w-11 max-lg:px-0 lg:h-9 lg:rounded-lg lg:px-3.5 lg:text-sm", note ? "btn-dark" : "btn-primary")} disabled={empty || sending} onClick={send} aria-label={editing ? "Сохранить" : note ? "Добавить заметку" : "Отправить"}>
                    {sending ? <LoaderCircle className="size-4 animate-spin" /> : editing ? <Check className="size-4" /> : <SendHorizontal className="size-4" />}
                    <span className="max-lg:hidden">{editing ? "Сохранить" : note ? "В заметку" : "Отправить"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
