"use client";

import { useState, useTransition } from "react";
import { GraduationCap, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { MAX_LESSONS, type BotLesson, type CoachRun } from "@/modules/messaging/domain/botCoach";
import { addBotLessonAction, deleteBotLessonAction, runBotCoachAction } from "./actions";
import { cn } from "@/lib/class-names";

const when = (iso: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Almaty", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * Работа над ошибками AI-продажника: уроки, которые бот получил из ночных разборов (и добавленные владельцем), журнал
 * разборов и кнопка «Разобрать сейчас». Уроки идут в инструкцию продажника со следующего ответа.
 */
export function BotLessons({ lessons, log, enabled }: { lessons: BotLesson[]; log: CoachRun[]; enabled: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState("");
  const last = log[0];
  const full = lessons.length >= MAX_LESSONS;

  return (
    <section className="space-y-3 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <GraduationCap className="size-4" /> Работа над ошибками
        </h3>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await runBotCoachAction();
              setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.ok ?? "Готово" });
            })
          }
        >
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : null} Разобрать беседы сейчас
        </button>
      </div>
      <p className="text-xs text-muted">
        {enabled ? "Каждую ночь (3:00–7:00)" : "Автоматический разбор выключен (галочка выше). По кнопке"} модель разбирает беседы бота за сутки — где менеджеру пришлось вмешаться, клиент замолчал или ушёл, ответ
        заблокировала проверка — и пишет короткие уроки. Бот следует им со следующего ответа. Уроки с ценами, скидками, сроками, ссылками и номерами код не принимает; цены, факты и запреты всегда
        важнее уроков. Лишний урок удалите — он перестанет действовать сразу.
      </p>
      {msg ? <p className={cn("text-xs", msg.ok ? "text-emerald-700" : "text-red-700")}>{msg.text}</p> : null}
      {lessons.length ? (
        <ul className="divide-y divide-line rounded-lg border border-line bg-white">
          {lessons.map((l) => (
            <li key={l.id} className="group flex items-start gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div>{l.text}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {l.source === "owner" ? "добавил владелец" : l.why || "из разбора"} · {l.at ? when(l.at) : ""}
                </div>
              </div>
              <button type="button" className="text-muted hover:text-red-700" disabled={pending} onClick={() => start(() => deleteBotLessonAction(l.id))} aria-label="Удалить урок">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Уроков пока нет — первые появятся после ночного разбора.</p>
      )}
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={220}
            disabled={full}
            placeholder={full ? `Все ${MAX_LESSONS} мест заняты — удалите урок, чтобы добавить свой` : "Свой урок: например, «на «дорого» сначала спроси, к какой дате нужна книга»"}
            className="input h-9 flex-1 text-sm"
            aria-label="Свой урок"
          />
          <button
            type="button"
            className="btn btn-outline btn-sm h-9"
            disabled={pending || full || draft.trim().length < 10}
            onClick={() =>
              start(async () => {
                try {
                  const r = await addBotLessonAction(draft);
                  if (r.error) setMsg({ ok: false, text: r.error });
                  else {
                    setDraft("");
                    setMsg(null);
                  }
                } catch {
                  setMsg({ ok: false, text: "Не сохранилось: обновите страницу и попробуйте ещё раз." });
                }
              })
            }
          >
            <Plus className="size-4" /> Добавить
          </button>
        </div>
        <p className={cn("text-xs", full ? "text-red-700" : "text-muted")}>
          Уроков {lessons.length} из {MAX_LESSONS}.{" "}
          {full ? "Чтобы добавить свой, удалите один из списка выше." : draft.trim().length < 10 && draft.length > 0 ? "Урок — не короче 10 знаков." : "Свой урок попадёт в инструкцию со следующего ответа бота."}
        </p>
      </div>
      {last ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted">
            Последний разбор: {when(last.at)} · бесед {last.reviewed}
            {last.error ? ` · ошибка: ${last.error}` : ` · новых уроков ${last.added.length}, убрано ${last.removed.length}`}
          </summary>
          <ul className="mt-2 space-y-2">
            {log.map((r) => (
              <li key={r.at} className="rounded-lg bg-[#fbf9f5] p-2">
                <div className="font-medium">
                  {when(r.at)} · бесед {r.reviewed}
                </div>
                {r.summary ? <p className="mt-1 text-ink-soft">{r.summary}</p> : null}
                {r.error ? <p className="mt-1 text-red-700">{r.error}</p> : null}
                {r.added.length ? <p className="mt-1">+ {r.added.join(" · ")}</p> : null}
                {r.removed.length ? <p className="mt-1 text-muted line-through">{r.removed.join(" · ")}</p> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
