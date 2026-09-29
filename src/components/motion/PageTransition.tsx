import { ViewTransition } from "react";

/**
 * Мягкая смена содержимого при переходе: старое быстро гаснет, новое проявляется и чуть поднимается.
 * Используется в template.tsx — он пересоздаётся на каждой навигации, поэтому enter/exit срабатывают.
 */
export function PageFade({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-fade" exit="page-fade" default="none">
      {children}
    </ViewTransition>
  );
}

/** Общий элемент, который «перетекает» между страницами (например, обложка книги). */
export function Morph({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}
