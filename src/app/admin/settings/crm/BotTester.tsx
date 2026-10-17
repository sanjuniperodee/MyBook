"use client";

import { useState, useTransition } from "react";
import { FlaskConical, LoaderCircle, RotateCcw, Send } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { previewBotAction } from "./actions";
import type { BotConfig } from "@/modules/messaging/domain/botConfig";
import type { BotPreviewResult } from "@/modules/messaging";

type Kind = "text" | "audio" | "image";
type Turn = { text: string; type: Kind }[];

/** Готовые сценарии из реальной переписки — быстро проверить правки. */
const PRESETS: [string, Turn[]][] = [
  ["Хочу узнать стоимость", [[{ text: "Здравствуйте! Хочу узнать стоимость.", type: "text" }]]],
  ["Казахское приветствие", [[{ text: "Сәлеметсіз бе", type: "text" }], [{ text: "анама туған күнге", type: "text" }]]],
  ["Всё сразу", [[{ text: "Здравствуйте, нужна книга маме на юбилей 15 ноября", type: "text" }]]],
  ["8 марта и «4Ноябрь»", [[{ text: "Добрый день", type: "text" }], [{ text: "жене", type: "text" }], [{ text: "8 марта", type: "text" }], [{ text: "4Ноябрь", type: "text" }]]],
  ["Голосовое", [[{ text: "Здравствуйте", type: "text" }], [{ text: "", type: "audio" }]]],
  ["Позвоните мне", [[{ text: "Здравствуйте", type: "text" }], [{ text: "можете позвонить?", type: "text" }]]],
];

/**
 * Тест-режим: пишете как клиент — бот отвечает по текущим (ещё не сохранённым) настройкам, с настоящими полями сделки,
 * ценами и графиком. Ничего не пишется в базу и никому не отправляется.
 */
export function BotTester({ config }: { config: BotConfig }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Kind>("text");
  const [together, setTogether] = useState(false);
  const [workTime, setWorkTime] = useState(true);
  const [client, setClient] = useState<"new" | "account" | "order">("new");
  const [result, setResult] = useState<BotPreviewResult | null>(null);
  const [pending, start] = useTransition();

  const run = (next: Turn[], opts: { workTime?: boolean; client?: typeof client } = {}) =>
    start(async () => {
      setTurns(next);
      if (!next.length) return setResult(null);
      const r = await previewBotAction({ config, turns: next, workTime: opts.workTime ?? workTime, client: opts.client ?? client, name: "Айгерим" });
      if ("error" in r) toast(r.error, "error");
      else setResult(r.result);
    });
  const send = () => {
    if (kind === "text" && !text.trim()) return;
    const m = { text: text.trim(), type: kind };
    const next = together && turns.length ? [...turns.slice(0, -1), [...turns[turns.length - 1], m]] : [...turns, [m]];
    setText("");
    run(next);
  };

  return (
    <details className="rounded-xl border border-line p-3" data-testid="bot-tester">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <FlaskConical className="size-4 text-wine" /> Проверить бота — без отправки клиенту
      </summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(([label, preset]) => (
            <button key={label} type="button" className="rounded-full bg-cream/70 px-2.5 py-1 text-xs hover:bg-cream" onClick={() => run(preset)}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" className="accent-wine" checked={!workTime} onChange={(e) => (setWorkTime(!e.target.checked), turns.length && run(turns, { workTime: !e.target.checked }))} />
            нерабочее время
          </label>
          <select value={client} onChange={(e) => (setClient(e.target.value as typeof client), turns.length && run(turns, { client: e.target.value as typeof client }))} className="input h-8 text-xs" aria-label="Кто пишет">
            <option value="new">новый клиент</option>
            <option value="account">клиент с аккаунтом на сайте</option>
            <option value="order">клиент с заказом</option>
          </select>
          <button type="button" className="ml-auto flex items-center gap-1 text-muted hover:text-ink" onClick={() => run([])}>
            <RotateCcw className="size-3.5" /> Сначала
          </button>
        </div>

        <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-xl bg-[#f7f4ef] p-3">
          {!result && !pending ? <p className="text-center text-xs text-muted">Напишите сообщение как клиент или выберите сценарий</p> : null}
          {result?.transcript.map((m, i) => (
            <div key={i} className={cn("max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-line", m.from === "client" ? "bg-white" : "ml-auto bg-emerald-100")}>
              {m.text}
            </div>
          ))}
          {result?.skipped ? <p className="text-center text-xs text-amber-800">Бот не начал бы опрос: {result.skipped}</p> : null}
          {pending ? <LoaderCircle className="mx-auto size-4 animate-spin text-muted" /> : null}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="input h-9 w-32 text-xs" aria-label="Тип сообщения">
            <option value="text">текст</option>
            <option value="audio">голосовое</option>
            <option value="image">фото</option>
          </select>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={kind === "text" ? "Сообщение клиента" : "Подпись (необязательно)"}
            maxLength={1000}
            className="input h-9 min-w-48 flex-1 text-sm"
          />
          <label className="flex items-center gap-1 text-xs text-muted" title="Клиент отправил несколько сообщений подряд — бот ответит на них одним сообщением">
            <input type="checkbox" className="accent-wine" checked={together} onChange={(e) => setTogether(e.target.checked)} />
            подряд с предыдущим
          </label>
          <button type="button" className="btn btn-sm" disabled={pending} onClick={send}>
            <Send className="size-4" /> Отправить
          </button>
        </div>

        {result && !result.skipped ? (
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-xl border border-line p-2.5">
              <div className="mb-1 font-medium">В поля сделки</div>
              {result.fields.length ? result.fields.map((f) => <div key={f.label}>{`${f.label}: ${f.value}`}</div>) : <div className="text-muted">пока ничего</div>}
              <div className="mt-1 text-muted">Язык: {result.lang === "kk" ? "казахский" : "русский"}</div>
            </div>
            {result.summary ? <pre className="rounded-xl border border-line p-2.5 font-sans whitespace-pre-wrap">{result.summary}</pre> : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}
