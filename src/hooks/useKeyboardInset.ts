"use client";

import { useEffect, useState } from "react";

const isField = (el: Element | null) => !!el && (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && !["checkbox", "radio", "range", "button", "submit"].includes((el as HTMLInputElement).type)));

/**
 * Высота, которую экранная клавиатура отнимает от нижней части экрана (px).
 * iOS Safari не уменьшает layout viewport при клавиатуре, и `position: fixed; bottom: 0` уходит под неё —
 * поэтому нижние панели смещаем на эту величину. Считаем её, только пока в фокусе поле ввода:
 * без фокуса клавиатуры нет, а устаревшее значение viewport оставило бы панель посреди экрана.
 */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(isField(document.activeElement) ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0);
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    // после blur activeElement обновляется не сразу
    const onOut = () => setTimeout(update, 50);
    document.addEventListener("focusout", onOut);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  return inset;
}
