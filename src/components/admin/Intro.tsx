"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/class-names";

/**
 * Пояснение к странице или форме: две строки и «Подробнее». Длинные абзацы перед каждой формой превращали настройки в
 * стену текста; теперь полный текст — по клику, а короткий виден целиком без кнопки.
 */
export function Intro({ children, className, small }: { children: React.ReactNode; className?: string; small?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 1);
  }, [children, open]);
  return (
    <div className={className}>
      <p ref={ref} className={cn(small ? "text-xs" : "text-sm", "text-muted", !open && "line-clamp-2")}>
        {children}
      </p>
      {long || open ? (
        <button type="button" onClick={() => setOpen((v) => !v)} className={cn("mt-0.5 text-wine hover:underline", small ? "text-xs" : "text-sm")} aria-expanded={open}>
          {open ? "Свернуть" : "Подробнее"}
        </button>
      ) : null}
    </div>
  );
}
