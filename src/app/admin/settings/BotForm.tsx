"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Bot, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";
import { saveBotAction } from "./actions";
import type { BotConfig } from "@/modules/messaging/domain/botConfig";

export function BotForm({ mode: initialMode, config, fields, stats }: { mode: string; config: BotConfig; fields: { key: string; label: string; type: string }[]; stats: { active: number; done: number } }) {
  const [mode, setMode] = useState(initialMode as "off" | "always" | "off_hours");
  const [greeting, setGreeting] = useState(config.greeting);
  const [finish, setFinish] = useState(config.finish);
  const [questions, setQuestions] = useState(config.questions.filter((q) => fields.some((f) => f.key === q.field)));
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<(typeof questions)[number]>) => setQuestions((l) => l.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) =>
    setQuestions((l) => {
      const n = [...l];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  return (
    <section className="rounded-2xl border border-line bg-white p-5" data-testid="bot-form">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Bot className="size-5 text-wine" /> Бот-квалификатор в WhatsApp
        </h2>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs", mode === "off" ? "bg-cream text-muted" : "bg-emerald-100 text-emerald-800")}>{mode === "off" ? "выключен" : "включён"}</span>
        <span className="ml-auto text-xs text-muted">за 30 дней: опросил {stats.done}, сейчас в процессе {stats.active}</span>
      </div>
      <p className="mb-4 text-sm text-muted">
        На первое сообщение нового клиента бот задаёт вопросы по очереди и записывает ответы в поля сделки. Как только менеджер отвечает сам, бот замолкает. Для полей-списков бот предлагает варианты с
        номерами.
      </p>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {(
          [
            ["off", "Выключен"],
            ["always", "Всегда"],
            ["off_hours", "Только вне рабочего времени"],
          ] as const
        ).map(([v, label]) => (
          <label key={v} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2", mode === v ? "border-wine/40 bg-rose/30" : "border-line")}>
            <input type="radio" checked={mode === v} onChange={() => setMode(v)} className="accent-wine" />
            {label}
          </label>
        ))}
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-muted">Приветствие ({"{имя}"} — имя клиента)</span>
        <textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={2} maxLength={500} className="w-full rounded-xl border border-line bg-[#fbf9f5] px-3 py-2 text-sm" />
      </label>
      <div className="mt-3 space-y-2">
        {questions.map((q, i) => (
          <div key={i} className="flex flex-wrap items-start gap-2 rounded-xl border border-line p-2.5">
            <span className="mt-2 w-5 text-center text-xs text-muted">{i + 1}</span>
            <textarea value={q.text} onChange={(e) => set(i, { text: e.target.value })} rows={1} maxLength={400} className="min-h-9 flex-1 resize-y rounded-lg border border-line px-2.5 py-1.5 text-sm field-sizing-content" aria-label={`Вопрос ${i + 1}`} />
            <select value={q.field} onChange={(e) => set(i, { field: e.target.value })} className="input h-9 w-44 text-sm" aria-label={`Поле для ответа ${i + 1}`}>
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  → {f.label}
                </option>
              ))}
            </select>
            <div className="flex">
              <button type="button" className="btn btn-ghost btn-sm size-9 px-0" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">
                <ArrowUp className="size-4" />
              </button>
              <button type="button" className="btn btn-ghost btn-sm size-9 px-0" disabled={i === questions.length - 1} onClick={() => move(i, 1)} aria-label="Ниже">
                <ArrowDown className="size-4" />
              </button>
              <button type="button" className="btn btn-ghost btn-sm size-9 px-0 text-red-700" onClick={() => setQuestions((l) => l.filter((_, j) => j !== i))} aria-label="Удалить вопрос">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
        {questions.length < 6 && fields.length ? (
          <button type="button" className="flex items-center gap-1.5 text-sm text-wine hover:underline" onClick={() => setQuestions((l) => [...l, { text: "", field: fields[0].key }])}>
            <Plus className="size-4" /> Вопрос
          </button>
        ) : null}
        {!fields.length ? <p className="text-sm text-muted">Сначала создайте поля сделки в разделе «Свои поля» — в них бот будет записывать ответы.</p> : null}
      </div>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs text-muted">Сообщение в конце</span>
        <textarea value={finish} onChange={(e) => setFinish(e.target.value)} rows={2} maxLength={500} className="w-full rounded-xl border border-line bg-[#fbf9f5] px-3 py-2 text-sm" />
      </label>
      <button
        className="btn btn-sm mt-4"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await saveBotAction({ mode, greeting, finish, questions });
            toast(r.error ?? r.ok ?? "Сохранено", r.error ? "error" : "success");
          })
        }
      >
        Сохранить бота
      </button>
    </section>
  );
}
