"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from "react";

/** Страница, содержимое которой строится только рядом с видимой областью прокрутки. */
export function LazyPage({ root, pageId, className, style, onClick, children }: { root: RefObject<HTMLDivElement | null>; pageId: string; className?: string; style: CSSProperties; onClick?: (e: MouseEvent) => void; children: () => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShow(e.isIntersecting), { root: root.current, rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);
  return (
    <div ref={ref} data-page={pageId} className={className} style={style} onClick={onClick}>
      {show ? children() : null}
    </div>
  );
}
