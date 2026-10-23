"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Printer, Trash2 } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { usefulUi, type ShezhireUi } from "@/lib/content/tools/ui";
import { ancestorLine, filled, GENERATIONS, knownChain, parseShezhire, STORAGE_KEY, type Ancestor, type Shezhire } from "@/lib/tools/shezhire";
import { cn } from "@/lib/class-names";
import { Choice, CopyButton } from "./Choice";

type Line = "father" | "mother";

/* Хранилище в браузере: подписка на изменения нужна, чтобы страница при первой отрисовке на сервере была пустой, а в браузере сразу показала сохранённое. */
const EVENT = "mb-shezhire";
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
};
/** Если хранилище браузера закрыто, данные живут в памяти до перезагрузки страницы. */
let memory: string | null = null;
const read = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return memory;
  }
};
const write = (value: string | null) => {
  memory = value;
  try {
    if (value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Лист для печати: отдельный документ в скрытом iframe, чтобы шапка и подвал сайта не попали на бумагу. */
function printSheet(ui: ShezhireUi, s: Shezhire) {
  const col = (line: Line) => {
    const list = s[line];
    if (!filled(list)) return "";
    const rows = list
      .map((a, i) => ({ a, i }))
      .reverse()
      .map(({ a, i }) => `<li><span class="g">${esc(ui.generation(i, line))}</span><span class="n">${a.name.trim() ? esc(ancestorLine(a)) : `<i>${esc(ui.unknown)}</i>`}</span></li>`)
      .join("");
    return `<section><h2>${esc(ui.printLine[line])}</h2><ul>${rows}<li class="me"><span class="g">${esc(ui.you)}</span><span class="n">${esc(s.owner.trim() || "—")}</span></li></ul></section>`;
  };
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(ui.printTitle(s.owner.trim()))}</title><style>
  body{font-family:Georgia,'Times New Roman',serif;color:#2a1a1f;margin:32px}h1{text-align:center;font-weight:500;font-size:28px;margin:0 0 4px}
  .clan{text-align:center;color:#7a1f2b;margin-bottom:24px}section{margin:0 0 28px}h2{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#7a1f2b;border-bottom:1px solid #d9c9c0;padding-bottom:6px}
  ul{list-style:none;margin:12px 0;padding:0}li{display:flex;gap:16px;padding:8px 0;border-bottom:1px dotted #e6d9d1}.g{width:200px;color:#6b5b5d;font-size:14px}.n{font-size:18px}.me .n{font-weight:600}i{color:#a79a9b}
  </style><h1>${esc(ui.printTitle(s.owner.trim()))}</h1>${s.clan.trim() ? `<div class="clan">${esc(ui.clanPrefix)}: ${esc(s.clan.trim())}</div>` : ""}${col("father")}${col("mother")}`;
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

function textOf(ui: ShezhireUi, s: Shezhire): string {
  const parts = [ui.printTitle(s.owner.trim())];
  if (s.clan.trim()) parts.push(`${ui.clanPrefix}: ${s.clan.trim()}`);
  for (const line of ["father", "mother"] as const) {
    if (!filled(s[line])) continue;
    parts.push("", ui.printLine[line]);
    s[line].forEach((a, i) => parts.push(`${i + 1}. ${ui.generation(i, line)}: ${a.name.trim() ? ancestorLine(a) : ui.unknown}`));
  }
  return parts.join("\n");
}

/** Шежіре: ввод до семи колен по линии отца и матери, дерево, печать и копирование. Хранится только в браузере. */
export function ShezhireBuilder() {
  const ui = usefulUi[useLocale()].shezhire;
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const data = useMemo(() => parseShezhire(raw), [raw]);
  const [line, setLine] = useState<Line>("father");

  const save = (next: Shezhire) => write(JSON.stringify(next));
  const setAncestor = (i: number, patch: Partial<Ancestor>) => save({ ...data, [line]: data[line].map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const list = data[line];
  const chain = knownChain(list);
  const any = filled(data.father) + filled(data.mother) > 0;

  return (
    <div className="card p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="shezhire-owner">
            {ui.ownerLabel}
          </label>
          <input id="shezhire-owner" className="input" maxLength={80} value={data.owner} placeholder={ui.ownerPlaceholder} onChange={(e) => save({ ...data, owner: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="shezhire-clan">
            {ui.clanLabel}
          </label>
          <input id="shezhire-clan" className="input" maxLength={80} value={data.clan} placeholder={ui.clanPlaceholder} onChange={(e) => save({ ...data, clan: e.target.value })} />
        </div>
      </div>

      <div className="mt-6">
        <span className="label">{ui.lineLabel}</span>
        <Choice label={ui.lineLabel} value={line} onChange={setLine} options={(["father", "mother"] as const).map((id) => ({ id, label: ui.line[id] }))} />
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
            <span className="font-medium text-ink">{ui.progress(filled(list), GENERATIONS)}</span>
            <span className="text-muted">{ui.saved}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-cream" role="progressbar" aria-valuemin={0} aria-valuemax={GENERATIONS} aria-valuenow={filled(list)}>
            <div className="h-full rounded-full bg-wine transition-all" style={{ width: `${(filled(list) / GENERATIONS) * 100}%` }} />
          </div>
          <p className="mt-3 text-sm text-ink-soft">{ui.chain(chain)}</p>

          <ol className="mt-5 space-y-3">
            {list.map((a, i) => (
              <li key={i} className="rounded-2xl border border-line bg-white p-4">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="font-serif text-lg text-wine">{i + 1}.</span>
                  <span className="font-medium">{ui.generation(i, line)}</span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input className="input !h-11 sm:col-span-2" aria-label={`${ui.generation(i, line)}: ${ui.nameLabel}`} placeholder={ui.nameLabel} maxLength={80} value={a.name} onChange={(e) => setAncestor(i, { name: e.target.value })} />
                  <input className="input !h-11" aria-label={`${ui.generation(i, line)}: ${ui.yearsLabel}`} placeholder={ui.yearsPlaceholder} maxLength={80} value={a.years} onChange={(e) => setAncestor(i, { years: e.target.value })} />
                  <input className="input !h-11" aria-label={`${ui.generation(i, line)}: ${ui.placeLabel}`} placeholder={ui.placeLabel} maxLength={80} value={a.place} onChange={(e) => setAncestor(i, { place: e.target.value })} />
                </div>
                {!a.name.trim() && i === chain ? <p className="mt-2 text-xs text-muted">{ui.ask(i, line)}</p> : null}
              </li>
            ))}
          </ol>
        </div>

        <aside className="self-start rounded-3xl bg-gradient-to-br from-cream to-rose/40 p-6">
          <h3 className="font-serif text-2xl font-medium">{ui.treeTitle}</h3>
          {any || data.owner ? (
            <div className="mt-4 space-y-6">
              {data.clan.trim() ? (
                <div className="text-sm text-wine">
                  {ui.clanPrefix}: {data.clan.trim()}
                </div>
              ) : null}
              {(["father", "mother"] as const).map((l) =>
                filled(data[l]) ? (
                  <div key={l}>
                    <div className="text-xs font-semibold tracking-[0.14em] text-wine uppercase">{ui.printLine[l]}</div>
                    <ul className="mt-3 border-l-2 border-wine/30 pl-4">
                      {data[l]
                        .map((a, i) => ({ a, i }))
                        .reverse()
                        .map(({ a, i }) => (
                          <li key={i} className="relative pb-3 last:pb-0">
                            <span className={cn("absolute top-1.5 -left-[22px] size-2.5 rounded-full", a.name.trim() ? "bg-wine" : "bg-line")} aria-hidden />
                            <div className="text-xs text-muted">{ui.generation(i, l)}</div>
                            <div className={a.name.trim() ? "text-ink" : "text-sm text-muted italic"}>{a.name.trim() ? ancestorLine(a) : ui.unknown}</div>
                          </li>
                        ))}
                      <li className="relative pt-1">
                        <span className="absolute top-2.5 -left-[22px] size-2.5 rounded-full bg-ink" aria-hidden />
                        <div className="text-xs text-muted">{ui.you}</div>
                        <div className="font-medium">{data.owner.trim() || "—"}</div>
                      </li>
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">{ui.treeEmpty}</p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={!any} onClick={() => printSheet(ui, data)}>
              <Printer className="size-4" /> {ui.print}
            </button>
            <CopyButton text={textOf(ui, data)} label={ui.copy} done={ui.copied} />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!any && !data.owner && !data.clan}
              onClick={() => {
                if (window.confirm(ui.clearConfirm)) write(null);
              }}
            >
              <Trash2 className="size-4" /> {ui.clear}
            </button>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">{ui.privacy}</p>
        </aside>
      </div>
    </div>
  );
}
