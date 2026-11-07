"use client";

import { useState } from "react";
import { Printer, Shuffle } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { usefulUi2 } from "@/lib/content/tools/ui";
import { cardThemeIds, type CardQuestion, type CardThemeId } from "@/lib/tools/cards";
import { Choice, CopyButton, ToolField, Workbench } from "./Workbench";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Анкета для печати: вопросы с местом под ответы, чтобы побеседовать с человеком, у которого нет смартфона, и записать ответы от руки. */
function printSheet(title: string, questions: string[], ui: { sheetDate: string; sheetBy: string; sheetHint: string }) {
  const items = questions.map((q, i) => `<li><div class="q">${i + 1}. ${esc(q)}</div><div class="l"></div><div class="l"></div><div class="l"></div></li>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>
  @page{margin:14mm}body{font-family:Georgia,'Times New Roman',serif;color:#2a1a1f;margin:0}h1{font-weight:500;font-size:24px;margin:0 0 6px;color:#7a1f2b}
  .meta{display:flex;gap:24px;font-size:13px;color:#6b5b5d;margin-bottom:6px}.meta span{flex:1;border-bottom:1px solid #bbb;padding-bottom:2px}.hint{font-size:12px;color:#6b5b5d;margin:8px 0 14px}
  ol{list-style:none;margin:0;padding:0}li{break-inside:avoid;margin-bottom:14px}.q{font-size:15px;line-height:1.35;margin-bottom:4px}.l{border-bottom:1px solid #cfc4bd;height:24px}
  </style><h1>${esc(title)}</h1><div class="meta"><span>${esc(ui.sheetDate)}:</span><span>${esc(ui.sheetBy)}:</span></div><div class="hint">${esc(ui.sheetHint)}</div><ol>${items}</ol>`;
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) return frame.remove();
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 2000);
  }, 200);
}

export function InterviewSheet({ themes }: { themes: Record<CardThemeId, CardQuestion[]> }) {
  const ui = usefulUi2[useLocale()].anketa;
  const [theme, setTheme] = useState<CardThemeId>("mom");
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const all = themes[theme];
  const picked = all.filter((q) => chosen.has(q.text)).map((q) => q.text);

  const toggle = (text: string) => {
    const next = new Set(chosen);
    if (next.has(text)) next.delete(text);
    else next.add(text);
    setChosen(next);
  };
  const random = () => {
    const copy = [...all];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    setChosen(new Set(copy.slice(0, 10).map((q) => q.text)));
  };

  return (
    <Workbench
      stickyResult={false}
      resultTitle={ui.pickTitle(picked.length, all.length)}
      input={
        <>
          <ToolField label={ui.themeLabel}>
            <Choice
              label={ui.themeLabel}
              value={theme}
              onChange={(v) => {
                setTheme(v);
                setChosen(new Set());
              }}
              options={cardThemeIds.map((id) => ({ id, label: ui.theme[id] }))}
            />
          </ToolField>
          <ToolField label={ui.nameLabel} htmlFor="anketa-name">
            <input id="anketa-name" className="input" maxLength={60} value={name} placeholder={ui.namePlaceholder} onChange={(e) => setName(e.target.value)} />
          </ToolField>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={random}>
              <Shuffle className="size-4" /> {ui.random}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setChosen(new Set(all.map((q) => q.text)))}>
              {ui.all}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setChosen(new Set())}>
              {ui.none}
            </button>
          </div>
          <div className="border-t border-line pt-5">
            <h3 className="font-medium">{ui.tipsTitle}</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft marker:text-wine">
              {ui.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </>
      }
      result={
        <div>
          <ul className="max-h-[26rem] overflow-y-auto rounded-[10px] border border-line bg-white p-1.5">
            {all.map((q) => (
              <li key={q.text}>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[8px] px-2.5 py-2.5 hover:bg-sunken/60 has-[:checked]:bg-rose/60">
                  <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--color-wine)]" checked={chosen.has(q.text)} onChange={() => toggle(q.text)} />
                  <span className="text-[15px] leading-relaxed">{q.text}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-dark" disabled={!picked.length} onClick={() => printSheet(ui.sheetTitle(name.trim()), picked, ui)}>
              <Printer className="size-4" /> {ui.print}
            </button>
            <CopyButton text={[ui.sheetTitle(name.trim()), "", ...picked.map((q, i) => `${i + 1}. ${q}`)].join("\n")} label={ui.copy} done={ui.copied} />
            {!picked.length ? <span className="text-sm text-muted">{ui.nothing}</span> : null}
          </div>
        </div>
      }
    />
  );
}
