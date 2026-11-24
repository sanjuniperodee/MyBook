"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, Check, CheckSquare, Clock, Copy, Eye, EyeOff, History, Image as ImageIcon, Link2, ListChecks, LoaderCircle, MessageSquare, MoreHorizontal, Paperclip, Plus, Repeat, Tag, Trash2, Upload, UserPlus, Video, X } from "lucide-react";
import { MentionTextarea } from "@/components/admin/MentionTextarea";
import { confirmDialog, toast, toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { BOARD_COLORS, boardColorNames, priorityLabels, recurrenceLabels, type BoardColor, type TaskPriority, type TaskRecurrence } from "@/shared/domain/boards";
import { boardsApi, onBoardEvent, type CardDetail, type Staff } from "./client";
import { Avatars, LabelChip, Menu, Popover, colorOf, dueLabel, fromLocalInput, kindLabels, localInput } from "./ui";

const REMIND = [
  { v: "", label: "Не напоминать" },
  { v: "0", label: "В срок" },
  { v: "15", label: "За 15 минут" },
  { v: "60", label: "За час" },
  { v: "180", label: "За 3 часа" },
  { v: "1440", label: "За день" },
];

const fmtSize = (n: number) => (n < 1024 ? `${n} Б` : n < 1024 * 1024 ? `${Math.round(n / 1024)} КБ` : `${(n / 1024 / 1024).toFixed(1)} МБ`);
const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Строка журнала карточки по-человечески. */
function activityText(a: CardDetail["activity"][number], labels: Map<string, string>) {
  const d = a.data as Record<string, string | undefined | string[]>;
  switch (a.kind) {
    case "created":
      return `создал(а) карточку в «${d.column}»`;
    case "moved":
      return d.from ? `перенёс(ла) из «${d.from}» в «${d.to}»${d.board ? ` на доску «${d.board}»` : ""}` : `перенёс(ла) в «${d.to}»`;
    case "done":
      return "отметил(а) выполненной";
    case "reopened":
      return "вернул(а) в работу";
    case "archived":
      return "убрал(а) в архив";
    case "restored":
      return "вернул(а) из архива";
    case "assignees":
      return "изменил(а) исполнителей";
    case "label.added":
      return `добавил(а) метку «${labels.get(String(d.labelId)) ?? "—"}»`;
    case "label.removed":
      return `снял(а) метку «${labels.get(String(d.labelId)) ?? "—"}»`;
    case "checklist.added":
      return `добавил(а) чек-лист «${d.title}»`;
    case "item.done":
      return `отметил(а) «${d.text}»`;
    case "item.undone":
      return `снял(а) отметку «${d.text}»`;
    case "file.added":
      return `приложил(а) «${d.name}»`;
    case "file.removed":
      return `удалил(а) вложение «${d.name}»`;
    case "rule":
      return `сработало правило «${d.name}»`;
    case "recurring":
      return "создана по повтору";
    case "updated":
      return d.dueAt !== undefined ? (d.dueAt ? `поставил(а) срок ${dueLabel(String(d.dueAt))}` : "убрал(а) срок") : d.title ? `переименовал(а) в «${d.title}»` : d.description ? "изменил(а) описание" : d.recurrence !== undefined ? "изменил(а) повтор" : "изменил(а) карточку";
    default:
      return a.kind;
  }
}

/**
 * Карточка задачи целиком (окно поверх доски, на телефоне — на весь экран): исполнители и наблюдатели, метки, приоритет,
 * даты, напоминание, описание, связи, чек-листы, вложения, комментарии с @упоминаниями, журнал, повтор, обложка, время.
 * Каждое изменение сохраняется сразу; карточка перечитывается и при чужих правках (живые события).
 */
export function CardDialog({ id, staff, me, onClose, onChanged, inline }: { id: string; staff: Staff[]; me: string; onClose: () => void; onChanged?: () => void; /** На странице задачи — листом, а не окном. */ inline?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [card, setCard] = useState<CardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const names = new Map(staff.map((s) => [s.id, s.label]));

  const load = useCallback(async () => {
    try {
      setCard(await boardsApi.card(id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось открыть карточку");
    }
  }, [id]);

  useEffect(() => {
    boardsApi.card(id).then(setCard, (e: unknown) => setError(e instanceof Error ? e.message : "Не удалось открыть карточку"));
    return onBoardEvent((e) => (!e.taskId || e.taskId === id) && void load());
  }, [id, load]);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open && !inline) d.showModal();
  }, [inline]);

  /** Выполнить изменение: сохранить, перечитать карточку и сообщить доске. */
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok);
      await load();
      onChanged?.();
    } catch (e) {
      toastError(e);
    }
  };

  if (inline)
    return (
      <section className="panel overflow-hidden" aria-label={card ? `Карточка «${card.title}»` : "Карточка"} data-testid="card-inline">
        {card ? <CardBody card={card} names={names} staff={staff} me={me} run={run} onClose={onClose} inline /> : <p className="p-6 text-sm text-muted">{error ?? "Загружаю карточку…"}</p>}
      </section>
    );
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-white p-0 text-ink backdrop:bg-ink/45 sm:m-auto sm:h-auto sm:max-h-[min(92dvh,56rem)] sm:max-w-[56rem] sm:rounded-[var(--r-sheet)] sm:border sm:border-line sm:shadow-lift"
      aria-label={card ? `Карточка «${card.title}»` : "Карточка"}
      data-testid="card-dialog"
    >
      {!card ? (
        <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted">
          {error ? (
            <>
              {error}
              <button className="btn btn-ghost btn-sm" onClick={onClose}>
                Закрыть
              </button>
            </>
          ) : (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden /> Загружаю карточку…
            </>
          )}
        </div>
      ) : (
        <CardBody card={card} names={names} staff={staff} me={me} run={run} onClose={onClose} />
      )}
    </dialog>
  );
}

function CardBody({ card: c, names, staff, me, run, onClose, inline }: { card: CardDetail; names: Map<string, string>; staff: Staff[]; me: string; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; onClose: () => void; inline?: boolean }) {
  const ed = c.editable;
  const labelMap = new Map(c.labels.map((l) => [l.id, l.name]));
  const watching = c.watcherIds.includes(me);
  const [title, setTitle] = useState(c.title);
  const [desc, setDesc] = useState(c.description);
  const [editingDesc, setEditingDesc] = useState(false);
  const [comment, setComment] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  // Карточку поменяли (здесь или коллега) — поля показывают новое; описание в правке не трогаем.
  const [seen, setSeen] = useState({ title: c.title, desc: c.description });
  if (seen.title !== c.title || seen.desc !== c.description) {
    setSeen({ title: c.title, desc: c.description });
    if (seen.title !== c.title) setTitle(c.title);
    if (seen.desc !== c.description && !editingDesc) setDesc(c.description);
  }

  const upload = async (files: FileList | File[]) => {
    setUploading(true);
    try {
      for (const f of Array.from(files).slice(0, 10)) await boardsApi.upload(c.id, f);
    } catch (e) {
      toastError(e);
    } finally {
      setUploading(false);
      await run(async () => {});
    }
  };

  const colName = c.columns.find((x) => x.id === c.columnId)?.name;
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/admin/tasks/${c.id}`;

  return (
    <div
      className={cn("flex flex-col", !inline && "h-full max-h-[inherit]")}
      onDragOver={(e) => ed && e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        if (!ed || !e.dataTransfer.files.length) return;
        e.preventDefault();
        void upload(e.dataTransfer.files);
      }}
    >
      {c.cover ? "image" in c.cover ? <img src={c.cover.image} alt="" className="max-h-44 w-full bg-sunken object-cover" /> : <div className="h-10 w-full shrink-0" style={{ background: colorOf(c.cover.color) }} /> : null}
      <header className="flex items-start gap-2 border-b border-line px-4 pt-3 pb-3 sm:px-6">
        <button
          type="button"
          disabled={!ed}
          onClick={() => run(() => boardsApi.done(c.id, !c.doneAt), c.doneAt ? "Вернули в работу" : "Выполнено")}
          className={cn("mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border-2", c.doneAt ? "border-success bg-success text-white" : "border-line-strong text-transparent hover:border-success hover:text-success")}
          aria-label={c.doneAt ? "Вернуть в работу" : "Отметить выполненной"}
          title={c.doneAt ? "Вернуть в работу" : "Отметить выполненной"}
        >
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <textarea
            value={title}
            readOnly={!ed}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
            onBlur={() => title.trim() && title.trim() !== c.title && run(() => boardsApi.updateCard(c.id, { title }))}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())}
            rows={1}
            maxLength={200}
            aria-label="Название карточки"
            className={cn("field-sizing-content w-full resize-none rounded-[var(--r-ctl)] bg-transparent px-1 py-0.5 text-lg leading-snug font-semibold outline-none focus:bg-sunken", c.doneAt && "text-muted line-through")}
          />
          <p className="px-1 text-xs text-muted">
            {c.board ? (
              <>
                {c.archived ? "В архиве · " : ""}в колонке <b className="font-semibold text-ink-soft">{colName ?? "—"}</b> на доске{" "}
                <a href={`/admin/tasks/boards/${c.board.id}`} className="font-semibold text-ink-soft hover:text-wine">
                  {c.board.name}
                </a>
              </>
            ) : (
              "Без доски"
            )}
            {c.createdById ? ` · поставил(а) ${names.get(c.createdById) ?? "сотрудник"}` : " · поставила CRM"}
          </p>
        </div>
        <Menu
          label="Действия с карточкой"
          trigger={<MoreHorizontal className="size-4" aria-hidden />}
          buttonClass="btn btn-ghost btn-icon btn-sm"
          items={[
            { label: "Скопировать ссылку", icon: <Link2 />, onSelect: () => void navigator.clipboard?.writeText(link).then(() => toast("Ссылка скопирована")) },
            { label: "Копия карточки", icon: <Copy />, onSelect: () => void run(() => boardsApi.duplicate(c.id), "Копия создана") },
            ...(ed ? [{ label: c.archived ? "Вернуть из архива" : "В архив", icon: c.archived ? <ArchiveRestore /> : <Archive />, onSelect: () => void run(() => boardsApi.archive(c.id, !c.archived), c.archived ? "Вернули из архива" : "Карточка в архиве") }] : []),
            ...(ed
              ? [
                  "separator" as const,
                  {
                    label: "Удалить насовсем",
                    icon: <Trash2 />,
                    danger: true,
                    onSelect: async () => {
                      if (!(await confirmDialog({ title: "Удалить карточку насовсем?", text: "Комментарии, чек-листы и вложения удалятся. Вернуть нельзя — если карточка просто не нужна на доске, уберите её в архив.", confirmLabel: "Удалить", danger: true }))) return;
                      try {
                        await boardsApi.deleteCard(c.id);
                        toast("Карточка удалена");
                        onClose();
                      } catch (e) {
                        toastError(e);
                      }
                    },
                  },
                ]
              : []),
          ]}
        />
        {inline ? null : (
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Закрыть карточку">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </header>

      <div className={cn(!inline && "min-h-0 flex-1 overflow-y-auto overscroll-contain")}>
        <div className="grid gap-6 px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="flex min-w-0 flex-col gap-6">
            {/* Поля: исполнители, метки, сроки */}
            <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
              <Field label="Исполнители">
                <div className="flex items-center gap-1.5">
                  <Avatars ids={c.assigneeIds} staff={names} max={4} size="md" />
                  {ed ? (
                    <Popover label="Исполнители" buttonClass="btn btn-ghost btn-icon btn-sm size-7 rounded-full border border-dashed border-line-strong" button={<UserPlus className="size-3.5" aria-hidden />}>
                      {() => <StaffPicker staff={staff} selected={c.assigneeIds} onChange={(ids) => run(() => boardsApi.assignees(c.id, ids))} hint="Первый — главный: ему напоминания и «Мой день»" />}
                    </Popover>
                  ) : null}
                </div>
              </Field>
              <Field label="Метки">
                <div className="flex flex-wrap items-center gap-1">
                  {c.labelIds.map((l) => {
                    const label = c.labels.find((x) => x.id === l);
                    return label ? <LabelChip key={l} name={label.name} color={label.color} /> : null;
                  })}
                  {ed && c.labels.length ? (
                    <Popover label="Метки" buttonClass="btn btn-ghost btn-icon btn-sm size-6" button={<Tag className="size-3.5" aria-hidden />}>
                      {() => (
                        <div className="flex flex-col gap-0.5">
                          {c.labels.map((l) => {
                            const on = c.labelIds.includes(l.id);
                            return (
                              <button key={l.id} type="button" onClick={() => run(() => boardsApi.label(c.id, l.id, !on))} className="flex items-center gap-2 rounded-[var(--r-ctl)] px-2 py-1.5 text-left hover:bg-sunken" aria-pressed={on}>
                                <span className={cn("flex size-4 items-center justify-center rounded border", on ? "border-wine bg-wine text-white" : "border-line-strong")}>{on ? <Check className="size-3" aria-hidden /> : null}</span>
                                <LabelChip name={l.name} color={l.color} />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </Popover>
                  ) : null}
                </div>
              </Field>
              <Field label="Приоритет">
                <select disabled={!ed} value={c.priority ?? ""} onChange={(e) => run(() => boardsApi.updateCard(c.id, { priority: (e.target.value || null) as TaskPriority | null }))} className="input h-8 py-0 text-[13px]" aria-label="Приоритет">
                  <option value="">Без приоритета</option>
                  {(Object.keys(priorityLabels) as TaskPriority[]).map((p) => (
                    <option key={p} value={p}>
                      {priorityLabels[p]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Начало">
                <input type="datetime-local" disabled={!ed} defaultValue={localInput(c.startAt)} key={`s${c.startAt}`} onBlur={(e) => fromLocalInput(e.target.value) !== c.startAt && run(() => boardsApi.updateCard(c.id, { startAt: fromLocalInput(e.target.value) }))} className="input h-8 py-0 text-[13px]" aria-label="Начало" />
              </Field>
              <Field label="Срок">
                <input type="datetime-local" disabled={!ed} defaultValue={localInput(c.dueAt)} key={`d${c.dueAt}`} onBlur={(e) => fromLocalInput(e.target.value) !== c.dueAt && run(() => boardsApi.updateCard(c.id, { dueAt: fromLocalInput(e.target.value) }))} className={cn("input h-8 py-0 text-[13px]", c.dueAt && !c.doneAt && new Date(c.dueAt) < new Date() && "border-danger text-danger")} aria-label="Срок" />
              </Field>
              <Field label="Напомнить">
                <select disabled={!ed || !c.dueAt} value={c.remindBeforeMin == null ? "" : String(c.remindBeforeMin)} onChange={(e) => run(() => boardsApi.updateCard(c.id, { remindBeforeMin: e.target.value === "" ? null : Number(e.target.value) }))} className="input h-8 py-0 text-[13px]" aria-label="Напомнить">
                  {REMIND.map((r) => (
                    <option key={r.v} value={r.v}>
                      {r.label}
                    </option>
                  ))}
                  {c.remindBeforeMin != null && !REMIND.some((r) => r.v === String(c.remindBeforeMin)) ? <option value={String(c.remindBeforeMin)}>За {c.remindBeforeMin} мин</option> : null}
                </select>
              </Field>
            </div>

            {c.links.length ? (
              <section aria-label="Связи">
                <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold">
                  <Link2 className="size-4 text-muted" aria-hidden /> Связано
                </h3>
                <div className="flex flex-wrap gap-2">
                  {c.links.map((l) => (
                    <a key={l.type + l.id} href={l.href} className="inline-flex items-center gap-1.5 rounded-[var(--r-ctl)] border border-line px-2.5 py-1.5 text-[13px] hover:border-wine hover:text-wine">
                      {l.label}
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            <section aria-label="Описание">
              <h3 className="mb-1.5 text-[13px] font-semibold">Описание</h3>
              {editingDesc ? (
                <div className="flex flex-col gap-2">
                  <textarea autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} rows={6} maxLength={20000} className="input min-h-32 py-2 text-sm" aria-label="Описание" />
                  <div className="flex gap-2">
                    <button className="btn btn-dark btn-sm" onClick={() => run(() => boardsApi.updateCard(c.id, { description: desc })).then(() => setEditingDesc(false))}>
                      Сохранить
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => (setDesc(c.description), setEditingDesc(false))}>
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" disabled={!ed} onClick={() => setEditingDesc(true)} className={cn("block w-full rounded-[var(--r-ctl)] px-3 py-2 text-left text-sm whitespace-pre-wrap", c.description ? "hover:bg-sunken" : "bg-sunken text-muted hover:bg-line/60")}>
                  {c.description || (ed ? "Добавьте подробности: что сделать, ссылки, договорённости…" : "Без описания")}
                </button>
              )}
            </section>

            {c.checklists.map((l) => (
              <Checklist key={l.id} list={l} staff={staff} names={names} editable={ed} run={run} />
            ))}

            <section aria-label="Вложения">
              <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold">
                <Paperclip className="size-4 text-muted" aria-hidden /> Вложения
                {uploading ? <LoaderCircle className="size-3.5 animate-spin text-muted" aria-label="Загружаю" /> : null}
              </h3>
              {c.files.length ? (
                <ul className="mb-2 flex flex-col gap-1.5">
                  {c.files.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 rounded-[var(--r-ctl)] border border-line p-1.5">
                      <a href={f.url} target="_blank" rel="noreferrer" className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-sunken text-[10px] font-semibold text-muted uppercase">
                        {f.isImage ? <img src={f.url} alt="" className="size-full object-cover" loading="lazy" /> : (f.name.split(".").pop() ?? "файл").slice(0, 4)}
                      </a>
                      <div className="min-w-0 flex-1">
                        <a href={`${f.url}?download=1`} className="block truncate text-[13px] font-medium hover:text-wine">
                          {f.name}
                        </a>
                        <p className="text-xs text-muted">
                          {fmtSize(f.size)} · {when(f.createdAt)}
                          {c.cover && "image" in c.cover && c.cover.image === f.url ? " · обложка" : ""}
                        </p>
                      </div>
                      {ed && f.isImage && !(c.cover && "image" in c.cover && c.cover.image === f.url) ? (
                        <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Сделать обложкой" aria-label="Сделать обложкой" onClick={() => run(() => boardsApi.updateCard(c.id, { cover: `att:${f.id}` }))}>
                          <ImageIcon className="size-4" aria-hidden />
                        </button>
                      ) : null}
                      {ed ? (
                        <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Удалить" aria-label={`Удалить ${f.name}`} onClick={async () => (await confirmDialog({ title: `Удалить «${f.name}»?`, confirmLabel: "Удалить", danger: true })) && run(() => boardsApi.deleteFile(c.id, f.id))}>
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {ed ? (
                <>
                  <input ref={file} type="file" multiple hidden onChange={(e) => e.target.files && void upload(e.target.files).then(() => (e.target.value = ""))} />
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => file.current?.click()} disabled={uploading}>
                    <Upload className="size-4" aria-hidden /> Приложить файл
                  </button>
                  <span className="ml-2 text-xs text-muted max-sm:hidden">или перетащите сюда, до 25 МБ</span>
                </>
              ) : null}
            </section>

            <section aria-label="Комментарии">
              <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
                <MessageSquare className="size-4 text-muted" aria-hidden /> Комментарии
                <button type="button" onClick={() => setShowLog((v) => !v)} className="btn btn-ghost btn-sm ml-auto text-xs" aria-pressed={showLog}>
                  <History className="size-3.5" aria-hidden /> {showLog ? "Скрыть журнал" : "Журнал действий"}
                </button>
              </h3>
              <form
                className="mb-3 flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (comment.trim()) void run(() => boardsApi.comment(c.id, comment)).then(() => setComment(""));
                }}
              >
                <MentionTextarea value={comment} onValueChange={setComment} mentionables={staff.map((s) => s.label)} rows={2} maxLength={5000} placeholder="Напишите комментарий, @Имя — уведомить коллегу" aria-label="Комментарий" className="input min-h-16 py-2 text-sm" />
                {comment.trim() ? (
                  <div>
                    <button className="btn btn-dark btn-sm">Отправить</button>
                  </div>
                ) : null}
              </form>
              <Timeline card={c} names={names} labelMap={labelMap} showLog={showLog} run={run} />
            </section>
          </div>

          {/* Правая колонка: действия */}
          <aside className="flex flex-col gap-4 text-[13px]" aria-label="Действия">
            <button type="button" className={cn("btn btn-sm justify-start", watching ? "btn-dark" : "btn-outline")} onClick={() => run(() => boardsApi.watch(c.id, !watching), watching ? "Больше не следите" : "Следите за карточкой")}>
              {watching ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />} {watching ? "Не следить" : "Следить"}
            </button>
            {c.watcherIds.length ? (
              <p className="-mt-2 text-xs text-muted">
                Следят: {c.watcherIds.map((w) => names.get(w) ?? "сотрудник").join(", ")}
              </p>
            ) : null}
            {ed ? (
              <button type="button" className="btn btn-outline btn-sm justify-start" onClick={() => run(() => boardsApi.addChecklist(c.id, "Чек-лист"))}>
                <ListChecks className="size-4" aria-hidden /> Чек-лист
              </button>
            ) : null}
            <SideField label="Тип">
              <select disabled={!ed} value={c.kind} onChange={(e) => run(() => boardsApi.updateCard(c.id, { kind: e.target.value as CardDetail["kind"] }))} className="input h-8 py-0 text-[13px]" aria-label="Тип">
                {Object.entries(kindLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </SideField>
            {c.kind === "meeting" || c.kind === "call" ? (
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" disabled={!ed} checked={c.meet} onChange={(e) => run(() => boardsApi.updateCard(c.id, { meet: e.target.checked }))} className="size-4 accent-[var(--color-wine)]" />
                <Video className="size-4 text-muted" aria-hidden /> Google Meet в календаре
              </label>
            ) : null}
            <SideField label="Повтор" icon={<Repeat className="size-3.5" aria-hidden />}>
              <select disabled={!ed} value={c.recurrence ? `${c.recurrence.freq}:${c.recurrence.interval}` : ""} onChange={(e) => run(() => boardsApi.updateCard(c.id, { recurrence: e.target.value ? ({ freq: e.target.value.split(":")[0], interval: Number(e.target.value.split(":")[1]) } as TaskRecurrence) : null }))} className="input h-8 py-0 text-[13px]" aria-label="Повтор">
                <option value="">Не повторять</option>
                {(Object.keys(recurrenceLabels) as TaskRecurrence["freq"][]).map((f) => (
                  <option key={f} value={`${f}:1`}>
                    {recurrenceLabels[f]}
                  </option>
                ))}
                <option value="weekly:2">Раз в две недели</option>
                {c.recurrence && !["daily:1", "weekdays:1", "weekly:1", "monthly:1", "weekly:2"].includes(`${c.recurrence.freq}:${c.recurrence.interval}`) ? <option value={`${c.recurrence.freq}:${c.recurrence.interval}`}>Свой повтор</option> : null}
              </select>
              {c.recurrence ? <p className="mt-1 text-xs text-muted">Выполните — появится следующая с новым сроком.</p> : null}
            </SideField>
            <SideField label="Время, ч" icon={<Clock className="size-3.5" aria-hidden />}>
              <div className="flex items-center gap-1.5">
                <input type="number" min={0} step={0.25} disabled={!ed} defaultValue={c.estimateMin ? c.estimateMin / 60 : ""} key={`e${c.estimateMin}`} onBlur={(e) => run(() => boardsApi.updateCard(c.id, { estimateMin: e.target.value ? Number(e.target.value) * 60 : null }))} placeholder="оценка" aria-label="Оценка, часов" className="input h-8 w-full py-0 text-[13px]" />
                <input type="number" min={0} step={0.25} disabled={!ed} defaultValue={c.spentMin ? c.spentMin / 60 : ""} key={`p${c.spentMin}`} onBlur={(e) => run(() => boardsApi.updateCard(c.id, { spentMin: e.target.value ? Number(e.target.value) * 60 : null }))} placeholder="затрачено" aria-label="Затрачено, часов" className="input h-8 w-full py-0 text-[13px]" />
              </div>
              {c.estimateMin && c.spentMin ? (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken" title={`${Math.round((c.spentMin / c.estimateMin) * 100)}% оценки`}>
                  <div className={cn("h-full rounded-full", c.spentMin > c.estimateMin ? "bg-danger" : "bg-success")} style={{ width: `${Math.min(100, (c.spentMin / c.estimateMin) * 100)}%` }} />
                </div>
              ) : null}
            </SideField>
            {ed ? (
              <SideField label="Обложка">
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(BOARD_COLORS) as BoardColor[]).map((k) => (
                    <button key={k} type="button" onClick={() => run(() => boardsApi.updateCard(c.id, { cover: k }))} className={cn("size-6 rounded-[6px] ring-offset-2", c.cover && "color" in c.cover && c.cover.color === k && "ring-2 ring-ink")} style={{ background: BOARD_COLORS[k] }} aria-label={`Обложка: ${boardColorNames[k]}`} title={boardColorNames[k]} />
                  ))}
                  {c.cover ? (
                    <button type="button" onClick={() => run(() => boardsApi.updateCard(c.id, { cover: null }))} className="btn btn-ghost btn-sm h-6 px-1.5 text-xs">
                      Убрать
                    </button>
                  ) : null}
                </div>
              </SideField>
            ) : null}
            {c.doneAt ? (
              <SideField label="Итог" icon={<CheckSquare className="size-3.5" aria-hidden />}>
                <textarea disabled={!ed} defaultValue={c.result} key={c.result} onBlur={(e) => e.target.value !== c.result && run(() => boardsApi.updateCard(c.id, { result: e.target.value }))} rows={2} maxLength={500} placeholder="Что сделали" className="input min-h-14 py-1.5 text-[13px]" aria-label="Итог" />
              </SideField>
            ) : null}
            <p className="text-xs text-muted">
              Создана {when(c.createdAt)}
              <br />
              Изменена {when(c.updatedAt)}
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-semibold text-muted">{label}</div>
      {children}
    </div>
  );
}

function SideField({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

/** Выбор сотрудников с поиском; порядок выбора сохраняется (первый — главный). */
export function StaffPicker({ staff, selected, onChange, hint, single }: { staff: Staff[]; selected: string[]; onChange: (ids: string[]) => void; hint?: string; single?: boolean }) {
  const [q, setQ] = useState("");
  const list = staff.filter((s) => s.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex w-64 flex-col gap-1.5">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти сотрудника" aria-label="Найти сотрудника" className="input h-8 text-[13px]" />
      {hint ? <p className="px-1 text-[11px] text-muted">{hint}</p> : null}
      <div className="flex max-h-64 flex-col overflow-y-auto">
        {list.map((s) => {
          const on = selected.includes(s.id);
          return (
            <button key={s.id} type="button" aria-pressed={on} onClick={() => onChange(single ? (on ? [] : [s.id]) : on ? selected.filter((x) => x !== s.id) : [...selected, s.id])} className="flex items-center gap-2 rounded-[var(--r-ctl)] px-2 py-1.5 text-left text-[13px] hover:bg-sunken">
              <span className={cn("flex size-4 items-center justify-center rounded border", on ? "border-wine bg-wine text-white" : "border-line-strong")}>{on ? <Check className="size-3" aria-hidden /> : null}</span>
              <span className="truncate">{s.label}</span>
              {on && !single && selected[0] === s.id ? <span className="ml-auto text-[11px] text-muted">главный</span> : null}
            </button>
          );
        })}
        {!list.length ? <p className="px-2 py-2 text-xs text-muted">Никого не нашли</p> : null}
      </div>
    </div>
  );
}

function Checklist({ list: l, staff, names, editable, run }: { list: CardDetail["checklists"][number]; staff: Staff[]; names: Map<string, string>; editable: boolean; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const done = l.items.filter((i) => i.done).length;
  const pct = l.items.length ? Math.round((done / l.items.length) * 100) : 0;
  return (
    <section aria-label={`Чек-лист «${l.title}»`}>
      <div className="mb-1.5 flex items-center gap-2">
        <ListChecks className="size-4 text-muted" aria-hidden />
        <input
          defaultValue={l.title}
          key={l.title}
          readOnly={!editable}
          onBlur={(e) => e.target.value.trim() && e.target.value !== l.title && run(() => boardsApi.renameChecklist(l.id, e.target.value))}
          className="min-w-0 flex-1 rounded-[var(--r-ctl)] bg-transparent px-1 text-[13px] font-semibold outline-none focus:bg-sunken"
          aria-label="Название чек-листа"
        />
        {done ? (
          <button type="button" className="btn btn-ghost btn-sm text-xs" onClick={() => setHideDone((v) => !v)}>
            {hideDone ? `Показать отмеченные (${done})` : "Скрыть отмеченные"}
          </button>
        ) : null}
        {editable ? (
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Удалить чек-лист" title="Удалить чек-лист" onClick={async () => (await confirmDialog({ title: `Удалить чек-лист «${l.title}»?`, confirmLabel: "Удалить", danger: true })) && run(() => boardsApi.deleteChecklist(l.id))}>
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span className="w-8 text-right text-[11px] text-muted tabular-nums">{pct}%</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
          <div className={cn("h-full rounded-full transition-[width]", pct === 100 ? "bg-success" : "bg-info")} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="flex flex-col">
        {l.items
          .filter((i) => !(hideDone && i.done))
          .map((i) => (
            <li key={i.id} className="group/item flex items-start gap-2 rounded-[var(--r-ctl)] px-1 py-1 hover:bg-sunken/70">
              <input type="checkbox" disabled={!editable} checked={i.done} onChange={(e) => run(() => boardsApi.updateItem(i.id, { done: e.target.checked }))} className="mt-1 size-4 shrink-0 accent-[var(--color-success)]" aria-label={i.text} />
              <input
                defaultValue={i.text}
                key={i.text}
                readOnly={!editable}
                onBlur={(e) => e.target.value.trim() && e.target.value !== i.text && run(() => boardsApi.updateItem(i.id, { text: e.target.value }))}
                className={cn("min-w-0 flex-1 bg-transparent py-0.5 text-[13.5px] outline-none", i.done && "text-muted line-through")}
                aria-label="Текст пункта"
              />
              {i.dueAt ? <span className={cn("mt-0.5 text-[11px] tabular-nums", !i.done && new Date(i.dueAt) < new Date() ? "text-danger" : "text-muted")}>{dueLabel(i.dueAt)}</span> : null}
              {i.assigneeId ? <Avatars ids={[i.assigneeId]} staff={names} /> : null}
              {editable ? (
                <span className="flex opacity-0 group-hover/item:opacity-100 focus-within:opacity-100 max-lg:opacity-100">
                  <Popover label="Исполнитель пункта" align="right" buttonClass="btn btn-ghost btn-icon btn-sm size-6" button={<UserPlus className="size-3.5" aria-hidden />}>
                    {(close) => (
                      <StaffPicker
                        single
                        staff={staff}
                        selected={i.assigneeId ? [i.assigneeId] : []}
                        onChange={(ids) => {
                          close();
                          void run(() => boardsApi.updateItem(i.id, { assigneeId: ids[0] ?? null }));
                        }}
                      />
                    )}
                  </Popover>
                  <Popover label="Срок пункта" align="right" buttonClass="btn btn-ghost btn-icon btn-sm size-6" button={<Clock className="size-3.5" aria-hidden />}>
                    {(close) => (
                      <div className="flex flex-col gap-2">
                        <input type="datetime-local" defaultValue={localInput(i.dueAt)} className="input h-8 text-[13px]" aria-label="Срок пункта" onChange={(e) => e.target.value && (close(), void run(() => boardsApi.updateItem(i.id, { dueAt: fromLocalInput(e.target.value) })))} />
                        {i.dueAt ? (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => (close(), void run(() => boardsApi.updateItem(i.id, { dueAt: null })))}>
                            Убрать срок
                          </button>
                        ) : null}
                      </div>
                    )}
                  </Popover>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm size-6" aria-label="Удалить пункт" onClick={() => run(() => boardsApi.deleteItem(i.id))}>
                    <X className="size-3.5" aria-hidden />
                  </button>
                </span>
              ) : null}
            </li>
          ))}
      </ul>
      {editable ? (
        <form
          className="mt-1 flex items-center gap-2 pl-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) void run(() => boardsApi.addItem(l.id, text)).then(() => setText(""));
          }}
        >
          <Plus className="size-4 shrink-0 text-muted" aria-hidden />
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Добавить пункт — Enter" aria-label="Новый пункт" className="input h-8 text-[13px]" />
        </form>
      ) : null}
    </section>
  );
}

function Timeline({ card: c, names, labelMap, showLog, run }: { card: CardDetail; names: Map<string, string>; labelMap: Map<string, string>; showLog: boolean; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  type Entry = { at: string; key: string; node: React.ReactNode };
  const entries: Entry[] = c.commentList.map((m) => ({
    at: m.createdAt,
    key: `c${m.id}`,
    node: (
      <div className="flex gap-2.5">
        <Avatars ids={m.authorId ? [m.authorId] : []} staff={names} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-xs">
            <b className="font-semibold">{m.authorId ? (names.get(m.authorId) ?? "Сотрудник") : "Сотрудник"}</b> <span className="text-muted">{when(m.createdAt)}{m.editedAt ? " · изменён" : ""}</span>
          </p>
          {editing === m.id ? (
            <form
              className="mt-1 flex flex-col gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => boardsApi.editComment(m.id, text)).then(() => setEditing(null));
              }}
            >
              <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} className="input min-h-14 py-1.5 text-sm" aria-label="Текст комментария" />
              <div className="flex gap-1.5">
                <button className="btn btn-dark btn-sm">Сохранить</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
                  Отмена
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-1 rounded-[var(--r-ctl)] border border-line bg-white px-3 py-2 text-sm whitespace-pre-wrap">{m.text}</div>
          )}
          {m.mine && editing !== m.id ? (
            <div className="mt-0.5 flex gap-2 text-xs text-muted">
              <button type="button" className="hover:text-ink hover:underline" onClick={() => (setEditing(m.id), setText(m.text))}>
                Изменить
              </button>
              <button type="button" className="hover:text-danger hover:underline" onClick={async () => (await confirmDialog({ title: "Удалить комментарий?", confirmLabel: "Удалить", danger: true })) && run(() => boardsApi.deleteComment(m.id))}>
                Удалить
              </button>
            </div>
          ) : null}
        </div>
      </div>
    ),
  }));
  if (showLog)
    for (const a of c.activity)
      entries.push({
        at: a.createdAt,
        key: `a${a.id}`,
        node: (
          <p className="pl-9 text-xs text-muted">
            <b className="font-semibold text-ink-soft">{a.actorId ? (names.get(a.actorId) ?? "Сотрудник") : "Автоматизация"}</b> {activityText(a, labelMap)} · {when(a.createdAt)}
          </p>
        ),
      });
  entries.sort((a, b) => b.at.localeCompare(a.at));
  if (!entries.length) return <p className="text-xs text-muted">Комментариев пока нет.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {entries.map((e) => (
        <li key={e.key}>{e.node}</li>
      ))}
    </ol>
  );
}
