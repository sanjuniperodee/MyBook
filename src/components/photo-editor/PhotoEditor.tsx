"use client";

/**
 * Редактор фото клиента — на весь экран поверх страницы. Сверху: закрыть, отменить/вернуть, «До» (удерживать),
 * ещё (сбросить, вернуть оригинал) и «Сохранить»; в середине — сцена (Stage); инструменты — внизу на телефоне и
 * колонкой на широком экране. Правка не портит снимок: оригинал хранится на сервере, правка — описанием, а в книгу
 * идёт картинка, собранная здесь же в полном размере (render.ts → POST …/edit).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Brush, Crop, Eye, Image as ImageIcon, LoaderCircle, MoreHorizontal, Redo2, Shapes, SunMedium, TriangleAlert, Type, Undo2, X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { confirmDialog, toast, toastError } from "@/components/ui/overlays";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { autoLevels } from "@/lib/photo-edit/color";
import { emptyEdit, FILTER_IDS, isEmptyEdit, outputSize, type FilterId, type Layer, type PhotoEdit } from "@/lib/photo-edit/doc";
import { colorCanvas, cropPixels, geometryCanvas, makeCanvas, releaseCanvas, renderOutput } from "@/lib/photo-edit/render";
import type { ShapeId } from "@/lib/photo-edit/shapes";
import { cn } from "@/lib/class-names";
import { loadEditState, originalUrl, revertEdit, saveEdit, type EditResult } from "./api";
import { newShape, newText, type TextPreset } from "./presets";
import { AdjustPanel, CropPanel, DrawProps, DrawTools, FiltersPanel, LayerActions, ShapeProps, ShapeTools, TextProps, TextTools } from "./panels";
import { nearEdge, Stage, type DrawStyle, type Tool } from "./Stage";
import { useEditHistory } from "./useEditHistory";

type Loaded = {
  img: HTMLImageElement;
  iw: number;
  ih: number;
  initial: PhotoEdit;
  version: string;
  edited: boolean;
};

export function PhotoEditor({ bookId, photoId, onClose, onSaved }: { bookId: string; photoId: string; onClose: () => void; onSaved: (r: EditResult) => void }) {
  const t = useMessages().editor.photoEditor;
  const [state, setState] = useState<{ status: "loading" } | { status: "error" } | ({ status: "ready" } & Loaded)>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await loadEditState(bookId, photoId);
        const img = new Image();
        img.decoding = "async";
        img.src = originalUrl(photoId, s.version);
        await img.decode();
        if (alive)
          setState({
            status: "ready",
            img,
            iw: img.naturalWidth,
            ih: img.naturalHeight,
            initial: s.edit ?? emptyEdit(),
            version: s.version,
            edited: !!s.edit,
          });
      } catch {
        if (alive) setState({ status: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [bookId, photoId, attempt]);

  // Страница под редактором не прокручивается.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const shell =
    state.status === "ready" ? (
      <Editor bookId={bookId} photoId={photoId} loaded={state} onClose={onClose} onSaved={onSaved} />
    ) : (
      <div className="fixed inset-0 z-[100] flex flex-col bg-[#141110] text-white" role="dialog" aria-modal="true" aria-label={t.title}>
        <div className="flex h-14 shrink-0 items-center px-2 pt-[env(safe-area-inset-top)]">
          <button type="button" onClick={onClose} aria-label={t.close} className="flex size-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10">
            <X className="size-6" />
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          {state.status === "loading" ? (
            <>
              <LoaderCircle className="size-8 animate-spin text-white/70" />
              <p className="text-white/70">{t.loading}</p>
            </>
          ) : (
            <>
              <TriangleAlert className="size-8 text-[#FFD43B]" />
              <p className="max-w-sm text-white/80">{t.loadError}</p>
              <button
                type="button"
                className="btn bg-white text-ink"
                onClick={() => {
                  setState({ status: "loading" });
                  setAttempt((n) => n + 1);
                }}
              >
                {t.retry}
              </button>
            </>
          )}
        </div>
      </div>
    );
  return typeof document === "undefined" ? shell : createPortal(shell, document.body);
}

const TOOLS: { id: Tool; icon: typeof Type }[] = [
  { id: "text", icon: Type },
  { id: "shapes", icon: Shapes },
  { id: "draw", icon: Brush },
  { id: "crop", icon: Crop },
  { id: "adjust", icon: SunMedium },
  { id: "filters", icon: ImageIcon },
];

const isTyping = (el: Element | null) => !!el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["range", "color", "button", "checkbox", "radio"].includes((el as HTMLInputElement).type)));

function Editor({ bookId, photoId, loaded, onClose, onSaved }: { bookId: string; photoId: string; loaded: Loaded; onClose: () => void; onSaved: (r: EditResult) => void }) {
  const t = useMessages().editor.photoEditor;
  const { img, iw, ih, initial, version, edited } = loaded;
  const history = useEditHistory(initial);
  const { doc, set } = history;
  const [tool, setTool] = useState<Tool>("text");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Надпись, в чьё поле поставить курсор (новая или «Изменить текст»).
  const [focusFor, setFocusFor] = useState<string | null>(null);
  const focused = useCallback(() => setFocusFor(null), []);
  const [drawStyle, setDrawStyle] = useState<DrawStyle>({
    color: "#FFFFFF",
    width: 0.012,
    brush: "pen",
  });
  const [compare, setCompare] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState(false);
  const asking = useRef(false);
  const inset = useKeyboardInset();
  const dirty = doc !== initial;

  const selected = selectedId ? doc.layers.find((l) => l.id === selectedId) : undefined;
  const out = outputSize(iw, ih, doc.geometry);
  const edge = selected && tool !== "crop" ? nearEdge(selected, out.w, out.h) : false;

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (!id) return;
      const l = history.current().layers.find((x) => x.id === id);
      if (l?.type === "text") setTool("text");
      else if (l?.type === "shape") setTool("shapes");
      else setTool((cur) => (cur === "draw" || cur === "crop" ? "adjust" : cur));
    },
    [history],
  );

  const pickTool = (id: Tool) => {
    setTool(id);
    setSelectedId(null);
    setMenu(false);
  };

  const addText = (preset: TextPreset) => {
    const l = newText(preset, t.text.samples[preset]);
    set((d) => ({ ...d, layers: [...d.layers, l] }));
    setSelectedId(l.id);
    setFocusFor(l.id);
  };
  const addShape = (shape: ShapeId) => {
    const l = newShape(shape);
    set((d) => ({ ...d, layers: [...d.layers, l] }));
    setSelectedId(l.id);
  };

  const close = useCallback(async () => {
    if (saving || asking.current) return;
    if (dirty) {
      asking.current = true;
      const ok = await confirmDialog({
        title: t.discardTitle,
        text: t.discardText,
        confirmLabel: t.discardYes,
        cancelLabel: t.discardNo,
        danger: true,
      });
      asking.current = false;
      if (!ok) return;
    }
    onClose();
  }, [dirty, saving, onClose, t]);

  const save = async () => {
    if (saving) return;
    setMenu(false);
    // Пустые надписи (текст стёрли) в картинку не идут.
    const cur = history.current();
    const d = { ...cur, layers: cur.layers.filter((l) => l.type !== "text" || l.text.trim()) };
    if (!dirty) return onClose();
    setSaving(true);
    try {
      // Правок не осталось — это тот же оригинал: у правленого фото просто снимаем правку.
      const res = isEmptyEdit(d) ? (edited ? await revertEdit(bookId, photoId) : null) : await saveEdit(bookId, photoId, await renderOutput(img, iw, ih, d), d, version);
      if (res) {
        onSaved(res);
        toast(res.edited ? t.saved : t.reverted, "success");
      }
      onClose();
    } catch (e) {
      toastError(e);
      setSaving(false);
    }
  };

  const revert = async () => {
    setMenu(false);
    asking.current = true;
    const ok = await confirmDialog({
      title: t.revertTitle,
      text: t.revertText,
      confirmLabel: t.revertYes,
      cancelLabel: t.cancel,
      danger: true,
    });
    asking.current = false;
    if (!ok) return;
    setSaving(true);
    try {
      const res = await revertEdit(bookId, photoId);
      onSaved(res);
      toast(t.reverted, "success");
      onClose();
    } catch (e) {
      toastError(e);
      setSaving(false);
    }
  };

  const auto = () => {
    if (doc.levels) return set((d) => ({ ...d, levels: null }));
    const c = geometryCanvas(img, iw, ih, { turns: 0, flip: false, straighten: 0 }, 320);
    const data = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
    releaseCanvas(c);
    set((d) => ({ ...d, levels: autoLevels(data) }));
  };

  // Миниатюры фильтров — только на вкладке «Фильтры»: по кадру и с уже выбранным светом и цветом.
  const g = doc.geometry;
  const colorKey = JSON.stringify([doc.adjust, doc.levels, doc.filter.id === "none" ? 0 : doc.filter.strength]);
  const thumbs = useMemo(() => {
    if (tool !== "filters") return {};
    const geo = geometryCanvas(img, iw, ih, { turns: g.turns, flip: g.flip, straighten: g.straighten }, 400);
    const r = cropPixels(geo, g);
    const side = Math.min(r.w, r.h);
    const base = makeCanvas(160, 160);
    base.getContext("2d")!.drawImage(geo, r.x + (r.w - side) / 2, r.y + (r.h - side) / 2, side, side, 0, 0, 160, 160);
    releaseCanvas(geo);
    const [adjust, levels] = JSON.parse(colorKey) as [PhotoEdit["adjust"], PhotoEdit["levels"]];
    const outThumbs: Partial<Record<FilterId, string>> = {};
    for (const id of FILTER_IDS) {
      const c = makeCanvas(160, 160);
      c.getContext("2d")!.drawImage(base, 0, 0);
      colorCanvas(c, { adjust, levels, filter: { id, strength: 100 } });
      outThumbs[id] = c.toDataURL("image/jpeg", 0.82);
      releaseCanvas(c);
    }
    releaseCanvas(base);
    return outThumbs;
  }, [tool, img, iw, ih, g, colorKey]);

  // Клавиши на компьютере: отменить/вернуть, удалить, сдвинуть стрелками, дублировать, Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (asking.current || saving) return;
      const mod = e.metaKey || e.ctrlKey;
      const typing = isTyping(document.activeElement);
      let handled = true;
      if (mod && e.key.toLowerCase() === "z" && !typing) {
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (mod && e.key.toLowerCase() === "y" && !typing) history.redo();
      else if (e.key === "Escape") {
        if (typing) (document.activeElement as HTMLElement).blur();
        else if (menu) setMenu(false);
        else if (selectedId) setSelectedId(null);
        else void close();
      } else if (!typing && selectedId && (e.key === "Delete" || e.key === "Backspace")) {
        set((d) => ({
          ...d,
          layers: d.layers.filter((l) => l.id !== selectedId),
        }));
        setSelectedId(null);
      } else if (!typing && selectedId && e.key.startsWith("Arrow")) {
        const step = e.shiftKey ? 0.02 : 0.002;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        set(
          (d) => ({
            ...d,
            layers: d.layers.map((l) => (l.id === selectedId ? ({ ...l, x: l.x + dx, y: l.y + dy } as Layer) : l)),
          }),
          `nudge:${selectedId}`,
        );
      } else if (mod && e.key.toLowerCase() === "d" && !typing && selected) {
        const copy = {
          ...selected,
          id: Math.random().toString(36).slice(2, 10),
          x: selected.x + 0.04,
          y: selected.y + 0.04,
        } as Layer;
        set((d) => ({ ...d, layers: [...d.layers, copy] }));
        setSelectedId(copy.id);
      } else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [history, set, selectedId, selected, menu, saving, close]);

  // Закрытие вкладки браузера с несохранённой правкой — спросить.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const panelTitle = selected ? t.layer.kinds[selected.type] : t.tools[tool];
  const panel = selected ? (
    <div className="space-y-5">
      {selected.type === "text" ? (
        <TextProps layer={selected} set={set} t={t} focus={focusFor === selected.id} onFocused={focused} />
      ) : selected.type === "shape" ? (
        <ShapeProps layer={selected} set={set} t={t} />
      ) : (
        <DrawProps layer={selected} set={set} t={t} />
      )}
      {edge ? (
        <p className="flex gap-2 rounded-xl bg-[#FFD43B]/10 p-3 text-[13px] leading-snug text-[#FFE08A]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {t.edgeWarn}
        </p>
      ) : null}
      <LayerActions layer={selected} set={set} t={t} onSelect={setSelectedId} />
    </div>
  ) : tool === "text" ? (
    <TextTools t={t} onAdd={addText} />
  ) : tool === "shapes" ? (
    <ShapeTools t={t} onAdd={addShape} />
  ) : tool === "draw" ? (
    <DrawTools t={t} style={drawStyle} onStyle={setDrawStyle} />
  ) : tool === "crop" ? (
    <CropPanel doc={doc} set={set} iw={iw} ih={ih} t={t} />
  ) : tool === "adjust" ? (
    <AdjustPanel doc={doc} set={set} t={t} onAuto={auto} />
  ) : (
    <FiltersPanel doc={doc} set={set} t={t} thumbs={thumbs} />
  );

  const iconBtn = "flex size-11 shrink-0 items-center justify-center rounded-full text-white/85 transition hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex flex-col bg-[#141110] text-white" style={{ bottom: inset }} role="dialog" aria-modal="true" aria-label={t.title}>
      {/* Верхняя полоса */}
      <header className="flex shrink-0 items-center gap-1 px-1.5 pt-[env(safe-area-inset-top)] sm:px-3">
        <div className="flex h-14 w-full items-center gap-1">
          <button type="button" onClick={() => void close()} aria-label={t.close} title={t.close} className={iconBtn}>
            <X className="size-6" />
          </button>
          <h2 className="ml-1 hidden font-medium text-white/90 sm:block">{t.title}</h2>
          <div className="flex-1" />
          <button type="button" onClick={history.undo} disabled={!history.canUndo} aria-label={t.undo} title={t.undo} className={iconBtn}>
            <Undo2 className="size-5" />
          </button>
          <button type="button" onClick={history.redo} disabled={!history.canRedo} aria-label={t.redo} title={t.redo} className={iconBtn}>
            <Redo2 className="size-5" />
          </button>
          <button
            type="button"
            aria-label={t.compare}
            title={t.compare}
            aria-pressed={compare}
            disabled={!dirty && !edited}
            onPointerDown={() => setCompare(true)}
            onPointerUp={() => setCompare(false)}
            onPointerLeave={() => setCompare(false)}
            onPointerCancel={() => setCompare(false)}
            onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setCompare(true)}
            onKeyUp={() => setCompare(false)}
            onContextMenu={(e) => e.preventDefault()}
            className={cn(iconBtn, "touch-none select-none", compare && "bg-white text-ink hover:bg-white")}
          >
            <Eye className="size-5" />
          </button>
          <div className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} aria-label={t.more} title={t.more} aria-expanded={menu} className={iconBtn}>
              <MoreHorizontal className="size-5" />
            </button>
            {menu ? (
              <div className="absolute top-12 right-0 z-20 w-64 overflow-hidden rounded-2xl bg-[#26211d] py-1.5 shadow-2xl ring-1 ring-white/10">
                <button
                  type="button"
                  disabled={isEmptyEdit(doc)}
                  onClick={() => {
                    set(emptyEdit());
                    setSelectedId(null);
                    setMenu(false);
                  }}
                  className="flex min-h-11 w-full items-center px-4 text-left text-[15px] hover:bg-white/10 disabled:opacity-35"
                >
                  {t.resetAll}
                </button>
                {edited ? (
                  <button type="button" onClick={() => void revert()} className="flex min-h-11 w-full items-center px-4 text-left text-[15px] text-[#ff8f8f] hover:bg-white/10">
                    {t.revert}
                  </button>
                ) : null}
                <p className="hidden border-t border-white/10 px-4 pt-2 pb-1.5 text-[11px] leading-snug text-white/40 [@media(pointer:fine)]:block">{t.keys}</p>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="ml-1 flex h-10 items-center gap-2 rounded-full bg-[#7a1f2b] px-4 text-[15px] font-medium text-white shadow-[0_6px_20px_-8px_rgb(122_31_43/0.9)] transition hover:bg-[#8e2534] active:scale-[0.97] disabled:opacity-60 sm:px-5"
          >
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {t.save}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Инструменты на широком экране — колонка слева. */}
        <nav aria-label={t.toolsAria} className="hidden w-[84px] shrink-0 flex-col gap-1 border-r border-white/10 p-2 lg:flex">
          {TOOLS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={tool === id && !selected}
              onClick={() => pickTool(id)}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition",
                tool === id ? "bg-white/[.12] text-white" : "text-white/55 hover:bg-white/[.06] hover:text-white",
              )}
            >
              <Icon className="size-5" />
              {t.tools[id]}
            </button>
          ))}
        </nav>

        <Stage
          img={img}
          iw={iw}
          ih={ih}
          doc={doc}
          tool={tool}
          selectedId={selectedId}
          onSelect={select}
          history={history}
          drawStyle={drawStyle}
          compare={compare}
          onEditText={(id) => {
            setSelectedId(id);
            setTool("text");
            setFocusFor(id);
          }}
          labels={{
            duplicate: t.layer.duplicate,
            delete: t.layer.delete,
            editText: t.text.editText,
            rotate: t.layer.rotate,
            size: t.layer.size,
          }}
        />

        {/* Панель: на телефоне — под фото (не выше трети экрана), на широком — колонка справа. */}
        <aside className="flex max-h-[42dvh] shrink-0 flex-col rounded-t-2xl border-t border-white/10 bg-[#1e1a17] lg:max-h-none lg:w-[360px] lg:rounded-none lg:border-t-0 lg:border-l">
          <div className="flex h-12 shrink-0 items-center justify-between px-4">
            <h3 className="text-[15px] font-medium">{panelTitle}</h3>
            {selected ? (
              <button type="button" onClick={() => setSelectedId(null)} className="-mr-2 flex h-10 items-center rounded-full px-3 text-[14px] font-medium text-[#e9b8bf] hover:bg-white/10">
                {t.layer.deselect}
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{panel}</div>
        </aside>
      </div>

      {/* Инструменты на телефоне — нижняя полоса. */}
      <nav
        aria-label={t.toolsAria}
        className={cn("flex shrink-0 justify-around border-t border-white/10 bg-[#1e1a17] px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] lg:hidden", inset && "hidden")}
      >
        {TOOLS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tool === id && !selected}
            onClick={() => pickTool(id)}
            className={cn("flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] transition", tool === id ? "text-white" : "text-white/50")}
          >
            <Icon className="size-[22px]" />
            <span className="max-w-full truncate">{t.tools[id]}</span>
          </button>
        ))}
      </nav>

      {saving ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center backdrop-blur-[2px]" role="status" aria-live="polite">
          <LoaderCircle className="size-8 animate-spin" />
          <p className="text-[15px] font-medium">{t.saving}</p>
          <p className="max-w-xs text-[13px] text-white/65">{t.savingHint}</p>
        </div>
      ) : null}
    </div>
  );
}
