"use client";

import { useState, useTransition } from "react";
import { setShiftAction } from "@/app/admin/crm-actions";
import { cn } from "@/lib/class-names";
import { toastError } from "@/components/ui/overlays";

/**
 * «На смене»: получает ли сотрудник новые заявки по кругу. Переключатель (role="switch"); compact — строка под именем,
 * row — строка на всю ширину с подписью и тумблером (экран «Ещё» на телефоне, зона нажатия 48 px), menu — в меню профиля.
 * Не сохранилось — возвращаем как было и говорим об этом.
 */
export function ShiftToggle({ initial, variant = "compact" }: { initial: boolean; variant?: "compact" | "row" | "menu" }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const toggle = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      try {
        await setShiftAction(next);
      } catch (e) {
        setOn(!next);
        toastError(e, "Не удалось сменить статус смены");
      }
    });
  };
  const hint = on ? "Вы получаете новые заявки по кругу" : "Новые заявки вам не распределяются";
  if (variant === "row" || variant === "menu")
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={pending}
        onClick={toggle}
        className={cn("flex w-full items-center gap-3 text-left", variant === "row" ? "min-h-12 rounded-xl py-1" : "min-h-11 rounded-lg px-2 hover:bg-sunken")}
        data-testid="shift-toggle"
      >
        <span className="min-w-0 flex-1">
          <span className={cn("block font-medium", variant === "row" ? "text-[15px]" : "text-[13px]")}>{on ? "На смене" : "Не на смене"}</span>
          <span className="block text-xs text-muted">{hint}</span>
        </span>
        <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", on ? "bg-success" : "bg-ink/20")} aria-hidden>
          <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full shadow-soft transition-transform", on && "translate-x-4")} style={{ backgroundColor: "#fff" }} />
        </span>
      </button>
    );
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={toggle}
      className="-mx-1 flex min-h-8 w-full items-center gap-2 rounded-lg px-1.5 text-xs text-ink-soft hover:bg-ink/5 hover:text-ink"
      title={`${hint}. Нажмите, чтобы ${on ? "уйти со смены" : "выйти на смену"}`}
      data-testid="shift-toggle"
    >
      <span className={cn("size-2 rounded-full", on ? "bg-success" : "bg-muted/40")} aria-hidden />
      {on ? "На смене — заявки идут вам" : "Не на смене"}
    </button>
  );
}
