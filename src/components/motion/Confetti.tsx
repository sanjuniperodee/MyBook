"use client";

import { useEffect, useState } from "react";

const COLORS = ["#7a1f2b", "#b8915a", "#f4e4df", "#c98e86", "#3b332e", "#e3a6ae"];

/** Детерминированный «шум» по индексу — без Math.random в рендере. */
const noise = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Конфетти один раз на браузер для ключа (например, первый просмотр оплаченного заказа).
 * Уважает prefers-reduced-motion.
 */
export function Confetti({ onceKey, count = 70 }: { onceKey: string; count?: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || localStorage.getItem(`mb_c_${onceKey}`)) return;
      localStorage.setItem(`mb_c_${onceKey}`, "1");
    } catch {}
    const raf = requestAnimationFrame(() => setShow(true));
    const t = setTimeout(() => setShow(false), 4200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [onceKey]);
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const w = 6 + noise(i, 1) * 6;
        return (
          <span
            key={i}
            className="absolute top-0 block"
            style={
              {
                left: `${noise(i, 2) * 100}%`,
                width: w,
                height: w * (noise(i, 3) > 0.5 ? 0.45 : 1),
                background: COLORS[i % COLORS.length],
                borderRadius: noise(i, 4) > 0.7 ? "50%" : 2,
                animation: `confetti-fall ${2.2 + noise(i, 5) * 1.6}s cubic-bezier(.2,.6,.4,1) ${noise(i, 6) * 0.6}s both`,
                "--dx": `${(noise(i, 7) - 0.5) * 240}px`,
                "--rot": `${360 + noise(i, 8) * 720}deg`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
