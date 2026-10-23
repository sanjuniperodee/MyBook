"use client";

/**
 * Слои обложки списком: верхний в списке — поверх остальных. Перетаскивание меняет порядок (мышь, палец, клавиатура),
 * глаз скрывает, замок закрепляет, двойной щелчок по имени — переименовать. Закреплённый слой выбирается только здесь.
 */
import { useState } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, Image as ImageIcon, Lock, LockOpen, Shapes, Sparkles, Type } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { cssFont } from "@/lib/book/fonts";
import { COVER_LIMITS, type CoverDesign, type CoverLayer, type CoverTexts } from "@/lib/book/cover-design";
import { cn } from "@/lib/class-names";
import { layerSummary } from "./logic";

const ICONS = { text: Type, image: ImageIcon, shape: Shapes, decor: Sparkles } as const;

export function LayersPanel({
  design,
  texts,
  selected,
  editable,
  onSelect,
  onReorder,
  onPatch,
}: {
  design: CoverDesign;
  texts: CoverTexts;
  selected: string | null;
  editable: boolean;
  onSelect: (id: string) => void;
  /** Индексы — в порядке данных (0 — нижний слой). */
  onReorder: (from: number, to: number) => void;
  onPatch: (id: string, p: Partial<CoverLayer>, field: string) => void;
}) {
  const t = useMessages().design.cover;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const n = design.layers.length;
  const list = [...design.layers].reverse();
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = design.layers.findIndex((l) => l.id === e.active.id);
    const to = design.layers.findIndex((l) => l.id === e.over!.id);
    if (from >= 0 && to >= 0) onReorder(from, to);
  };
  if (!n) return <p className="text-sm text-muted">{t.layers.empty}</p>;
  return (
    <div className="space-y-2">
      <DndContext id="cover-layers" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={list.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1">
            {list.map((l) => (
              <LayerRow key={l.id} layer={l} texts={texts} active={l.id === selected} editable={editable} onSelect={() => onSelect(l.id)} onPatch={(p, f) => onPatch(l.id, p, f)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <p className="text-xs text-muted">{t.layers.hint}</p>
    </div>
  );
}

function LayerRow({ layer: l, texts, active, editable, onSelect, onPatch }: { layer: CoverLayer; texts: CoverTexts; active: boolean; editable: boolean; onSelect: () => void; onPatch: (p: Partial<CoverLayer>, field: string) => void }) {
  const m = useMessages().design.cover;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: l.id, disabled: !editable });
  const [renaming, setRenaming] = useState(false);
  const Icon = ICONS[l.kind];
  const fallback = l.kind === "text" && l.bind ? m.layers.binds[l.bind] : l.kind === "decor" ? m.add.decorNames[l.motif] : l.kind === "shape" ? m.add.shapeNames[l.shape] : m.layers.kinds[l.kind];
  const label = layerSummary(l, texts) || fallback;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-1 rounded-xl border px-1.5 py-1 transition", active ? "border-wine/50 bg-rose/50" : "border-transparent bg-white hover:border-line", isDragging && "z-10 shadow-lift", l.hidden && "opacity-60")}
    >
      <button type="button" aria-label={m.layers.drag} className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted" {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </button>
      <Icon className="size-4 shrink-0 text-muted" />
      {renaming ? (
        <input
          autoFocus
          aria-label={m.layers.rename}
          className="h-8 min-w-0 flex-1 rounded-lg border border-line px-2 text-sm outline-none focus:border-wine/50"
          defaultValue={l.name ?? ""}
          placeholder={label}
          maxLength={COVER_LIMITS.name}
          onBlur={(e) => {
            setRenaming(false);
            onPatch({ name: e.target.value.trim() || undefined }, "name");
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setRenaming(false);
          }}
        />
      ) : (
        <button type="button" onClick={onSelect} onDoubleClick={() => editable && setRenaming(true)} className="h-8 min-w-0 flex-1 truncate px-1 text-left text-sm text-ink" style={l.kind === "text" && !l.name ? { fontFamily: cssFont(l.style.font) } : undefined}>
          {label}
        </button>
      )}
      <button type="button" disabled={!editable} aria-pressed={!!l.hidden} aria-label={l.hidden ? m.toolbar.show : m.toolbar.hide} title={l.hidden ? m.toolbar.show : m.toolbar.hide} onClick={() => onPatch({ hidden: l.hidden ? undefined : true }, "hidden")} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-cream hover:text-ink">
        {l.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
      <button type="button" disabled={!editable} aria-pressed={!!l.locked} aria-label={l.locked ? m.toolbar.unlock : m.toolbar.lock} title={l.locked ? m.toolbar.unlock : m.toolbar.lock} onClick={() => onPatch({ locked: l.locked ? undefined : true }, "locked")} className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-cream", l.locked ? "text-wine" : "text-muted hover:text-ink")}>
        {l.locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
      </button>
    </li>
  );
}
