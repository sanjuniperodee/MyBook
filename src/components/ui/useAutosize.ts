"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Поле ввода растёт по тексту до потолка из CSS (max-height), дальше — прокрутка внутри. CSS field-sizing есть не во всех
 * браузерах (нет в Safari на iPhone), поэтому высоту ставим сами при каждом изменении текста.
 */
export function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [ref, value]);
}
