"use client";

import { useEffect, useState } from "react";

/**
 * Высота, которую экранная клавиатура отнимает от нижней части экрана (px).
 * iOS Safari не уменьшает layout viewport при клавиатуре, и `position: fixed; bottom: 0` уходит под неё —
 * поэтому нижние панели смещаем на эту величину.
 */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
