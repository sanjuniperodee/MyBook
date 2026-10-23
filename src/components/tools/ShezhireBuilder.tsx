"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Download, Printer, Trash2, WandSparkles } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { usefulUi } from "@/lib/content/tools/ui";
import { filled, GENERATIONS, knownChain, parseNames, parseShezhire, posterDepth, STORAGE_KEY, type Ancestor, type Shezhire } from "@/lib/tools/shezhire";
import { Choice, CopyButton } from "./Choice";
import { createLocalStore } from "./localStore";
import { posterHeight, posterText, POSTER_W, ShezhirePoster } from "./ShezhirePoster";

type Line = "father" | "mother";

const store = createLocalStore(STORAGE_KEY);
const { subscribe, read, write } = store;

/** Плакат → PNG: SVG рисуется на холсте вдвое крупнее, чтобы буквы не мылились при печати. */
async function savePng(svg: SVGSVGElement, height: number, fileName: string) {
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error("svg"));
      img.src = url;
    });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = POSTER_W * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Печать: плакат — отдельный документ в скрытом iframe, чтобы шапка и подвал сайта не попали на бумагу. */
function printPoster(svg: SVGSVGElement, title: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) return frame.remove();
  doc.open();
  doc.write(`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>@page{margin:8mm}body{margin:0}svg{display:block;width:100%;max-height:277mm;margin:0 auto}</style>${new XMLSerializer().serializeToString(svg)}`);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 2000);
  }, 200);
}

/** Шежіре: впишите имена отца, деда, прадеда… — получится плакат, который можно скачать, распечатать и отправить родным. Хранится только в браузере. */
export function ShezhireBuilder() {
  const ui = usefulUi[useLocale()].shezhire;
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const data = useMemo(() => parseShezhire(raw), [raw]);
  const [line, setLine] = useState<Line>("father");
  const [more, setMore] = useState(false);
  const [paste, setPaste] = useState("");
  const poster = useRef<HTMLDivElement>(null);

  const save = (next: Shezhire) => write(JSON.stringify(next));
  const setAncestor = (i: number, patch: Partial<Ancestor>) => save({ ...data, [line]: data[line].map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const list = data[line];
  const chain = knownChain(list);
  const any = posterDepth(data.father) + posterDepth(data.mother) > 0;
  const svg = () => poster.current?.querySelector("svg") ?? null;
  const height = posterHeight(data);

  const applyPaste = () => {
    const names = parseNames(paste);
    if (!names.length) return;
    save({ ...data, [line]: data[line].map((a, i) => (names[i] ? { ...a, name: names[i] } : a)) });
    setPaste("");
  };

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

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
            <span className="font-medium text-ink">{ui.progress(filled(list), GENERATIONS)}</span>
            <span className="text-muted">{ui.saved}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-cream" role="progressbar" aria-valuemin={0} aria-valuemax={GENERATIONS} aria-valuenow={filled(list)}>
            <div className="h-full rounded-full bg-wine transition-all" style={{ width: `${(filled(list) / GENERATIONS) * 100}%` }} />
          </div>

          <ol className="mt-5 space-y-2.5">
            {list.map((a, i) => (
              <li key={i} className="rounded-2xl border border-line bg-white px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="w-7 shrink-0 font-serif text-xl text-wine">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <label className="block text-xs text-muted" htmlFor={`sh-${line}-${i}`}>
                      {ui.generation(i, line)}
                    </label>
                    <input id={`sh-${line}-${i}`} className="mt-0.5 w-full bg-transparent text-[17px] outline-none placeholder:text-muted/60" placeholder={ui.nameLabel} maxLength={80} value={a.name} onChange={(e) => setAncestor(i, { name: e.target.value })} />
                  </div>
                </div>
                {more ? (
                  <div className="mt-2 grid gap-2 pl-10 sm:grid-cols-2">
                    <input className="input !h-10 !text-sm" aria-label={`${ui.generation(i, line)}: ${ui.yearsLabel}`} placeholder={ui.yearsPlaceholder} maxLength={80} value={a.years} onChange={(e) => setAncestor(i, { years: e.target.value })} />
                    <input className="input !h-10 !text-sm" aria-label={`${ui.generation(i, line)}: ${ui.placeLabel}`} placeholder={ui.placeLabel} maxLength={80} value={a.place} onChange={(e) => setAncestor(i, { place: e.target.value })} />
                  </div>
                ) : null}
                {!a.name.trim() && i === chain ? <p className="mt-1.5 pl-10 text-xs text-muted">{ui.ask(i, line)}</p> : null}
              </li>
            ))}
          </ol>

          <button type="button" className="mt-3 inline-flex items-center gap-1 text-sm text-wine hover:underline" onClick={() => setMore((v) => !v)} aria-expanded={more}>
            <ChevronDown className={`size-4 transition ${more ? "rotate-180" : ""}`} /> {ui.details}
          </button>

          <div className="mt-6 rounded-2xl bg-cream/60 p-4">
            <label className="label" htmlFor="shezhire-paste">
              {ui.pasteLabel}
            </label>
            <textarea id="shezhire-paste" className="input" rows={2} value={paste} placeholder={ui.pastePlaceholder} onChange={(e) => setPaste(e.target.value)} />
            <button type="button" className="btn btn-outline btn-sm mt-2" disabled={!parseNames(paste).length} onClick={applyPaste}>
              <WandSparkles className="size-4" /> {ui.pasteApply}
            </button>
          </div>
          <p className="mt-4 text-sm text-ink-soft">{ui.chain(chain)}</p>
        </div>

        <div className="min-w-0">
          <div ref={poster} className="overflow-hidden rounded-2xl border border-line shadow-soft">
            <ShezhirePoster data={data} ui={ui} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={!any} onClick={() => svg() && void savePng(svg()!, height, ui.fileName)}>
              <Download className="size-4" /> {ui.download}
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={!any} onClick={() => svg() && printPoster(svg()!, ui.printTitle(data.owner.trim()))}>
              <Printer className="size-4" /> {ui.print}
            </button>
            <CopyButton text={posterText(data, ui)} label={ui.copy} done={ui.copied} />
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
          <p className="mt-3 text-xs leading-relaxed text-muted">{ui.privacy}</p>
        </div>
      </div>
    </div>
  );
}
