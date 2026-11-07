"use client";

import { useEffect, useRef } from "react";

/** Ленту вкладок на телефоне прокручивает к активной: иначе выбранная вкладка может оказаться за правым краем экрана. */
export function ScrollActive({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tabs = ref.current?.querySelector<HTMLElement>(".tabs");
    const active = tabs?.querySelector<HTMLElement>('[aria-current="page"]');
    if (tabs && active) tabs.scrollLeft = active.offsetLeft - (tabs.clientWidth - active.clientWidth) / 2;
  }, []);
  return <div ref={ref}>{children}</div>;
}
