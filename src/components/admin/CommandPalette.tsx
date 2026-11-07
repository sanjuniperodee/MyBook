"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Handshake, Plus, Search, UserPlus, type LucideIcon } from "lucide-react";
import type { Permission } from "@/shared/domain/permissions";
import { visibleDomains } from "./AdminNav";
import { cn } from "@/lib/class-names";

const EVENT = "crm-palette-open";

/** Открыть палитру из любого места CRM. */
export const openPalette = () => window.dispatchEvent(new Event(EVENT));

interface Command {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  href: string;
  /** Слова для поиска, которых нет в названии. */
  keywords?: string;
}

/** Действия «создать» с правами: те же, что у кнопок на страницах. */
const CREATE: { label: string; href: string; icon: LucideIcon; perm: Permission; keywords: string }[] = [
  { label: "Новая сделка", href: "/admin/deals/new", icon: Handshake, perm: "deals.edit", keywords: "создать добавить заявка" },
  { label: "Новый клиент", href: "/admin/clients/new", icon: UserPlus, perm: "clients.create", keywords: "создать добавить контакт" },
];

export function createActions(perms: Permission[]) {
  const allowed = new Set(perms);
  return CREATE.filter((c) => allowed.has(c.perm));
}

/** Кнопка в шапке: «Поиск и переходы ⌘K». */
export function PaletteTrigger() {
  const [mod, setMod] = useState("⌘");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- платформа известна только в браузере
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) setMod("Ctrl");
  }, []);
  return (
    <button
      type="button"
      onClick={openPalette}
      className="flex h-8 w-60 items-center gap-2 rounded-[var(--r-ctl)] border border-line-strong bg-white px-2.5 text-left text-[13px] text-muted transition-colors hover:border-ink/30 hover:text-ink-soft xl:w-72"
      aria-label="Поиск и переходы по CRM"
      aria-keyshortcuts="Control+K Meta+K"
    >
      <Search className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
      <span className="flex-1 truncate">Найти или перейти</span>
      <span className="kbd" aria-hidden>{mod}</span>
      <span className="kbd -ml-1" aria-hidden>K</span>
    </button>
  );
}

/** Меню «Создать» в шапке: действия по правам. Одно действие — кнопка, несколько — меню. */
export function CreateMenu({ perms }: { perms: Permission[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const actions = createActions(perms);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  if (!actions.length) return null;
  return (
    <div ref={root} className="relative">
      {/* Контурная: винная кнопка на экране одна — главное действие страницы в её шапке (DESIGN.md §3.2). */}
      <button type="button" className="btn btn-outline btn-sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Plus className="size-4" strokeWidth={2} aria-hidden /> Создать
      </button>
      {open ? (
        <div role="menu" className="absolute top-[calc(100%+0.375rem)] right-0 z-50 w-52 rounded-[var(--r-sheet)] border border-line bg-white p-1.5 shadow-lift">
          {actions.map((a) => (
            <button
              key={a.href}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(a.href);
              }}
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] text-ink-soft hover:bg-sunken hover:text-ink"
            >
              <a.icon className="size-4" strokeWidth={1.8} aria-hidden /> {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Палитра команд (⌘K / Ctrl+K): переходы по всем страницам CRM по правам, создание записей и поиск по базе. Стрелки
 * выбирают, Enter выполняет, Esc закрывает. Без запроса показывает все разделы, с запросом — подходящие.
 */
export function CommandPalette({ perms }: { perms: Permission[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const listId = useId();

  const commands = useMemo<Command[]>(() => {
    const out: Command[] = createActions(perms).map((c) => ({ id: `new:${c.href}`, label: c.label, group: "Создать", icon: c.icon, href: c.href, keywords: c.keywords }));
    for (const d of visibleDomains(perms)) for (const it of d.items) out.push({ id: it.href, label: it.label, group: d.label, icon: it.icon, href: it.href, keywords: `${d.label} ${it.keywords ?? ""}` });
    return out;
  }, [perms]);

  const term = q.trim().toLowerCase();
  const results = useMemo(() => {
    const found = term ? commands.filter((c) => `${c.label} ${c.group} ${c.keywords ?? ""}`.toLowerCase().includes(term)) : commands;
    const items: Command[] = found.slice(0, 40);
    if (q.trim()) items.push({ id: "search", label: `Искать «${q.trim()}» в сделках, чатах, заказах и клиентах`, group: "Поиск", icon: Search, href: `/admin/search?q=${encodeURIComponent(q.trim())}` });
    return items;
  }, [commands, term, q]);

  useEffect(() => {
    const show = () => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setQ("");
      setIdx(0);
      setOpen(true);
    };
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener(EVENT, show);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener(EVENT, show);
      window.removeEventListener("keydown", key);
    };
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    opener.current?.focus?.();
  };
  const go = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    router.push(c.href);
  };

  if (!open) return null;
  const active = Math.min(idx, results.length - 1);
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-ink/40 px-4 pt-[12vh] backdrop-blur-[2px]" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label="Поиск и переходы" className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--r-sheet)] border border-line bg-white shadow-lift">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(results[active]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-label="Раздел, действие, имя, телефон или номер"
            placeholder="Раздел, действие, имя, телефон, номер"
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          <span className="kbd">Esc</span>
        </div>
        <ul id={listId} role="listbox" className="overflow-y-auto p-1.5">
          {results.length === 0 ? <li className="px-3 py-8 text-center text-sm text-muted">Ничего не нашлось. Нажмите Enter, чтобы искать по базе.</li> : null}
          {results.map((c, i) => {
            const head = i === 0 || results[i - 1].group !== c.group;
            return (
              <li key={c.id} role="presentation">
                {head ? <div className="px-2.5 pt-2 pb-1 text-xs text-muted">{c.group}</div> : null}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onPointerMove={() => setIdx(i)}
                  onClick={() => go(c)}
                  className={cn("flex h-10 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-[13.5px]", i === active ? "bg-sunken text-ink" : "text-ink-soft")}
                >
                  <c.icon className={cn("size-4 shrink-0", i === active ? "text-wine" : "text-muted")} strokeWidth={1.8} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {i === active ? <CornerDownLeft className="size-3.5 shrink-0 text-muted" aria-hidden /> : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-4 border-t border-line bg-sunken/60 px-4 py-2 text-xs text-muted">
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> выбрать</span>
          <span><span className="kbd">Enter</span> открыть</span>
        </div>
      </div>
    </div>
  );
}
