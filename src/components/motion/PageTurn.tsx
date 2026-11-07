"use client";

import { addTransitionType, startTransition, ViewTransition } from "react";

/** Тип перехода «листание»: вперёд или назад — от него зависит, какая страница переворачивается. */
export type TurnDirection = "page-forward" | "page-back";

/** Перелистнуть: смена страницы внутри перехода с типом направления (без него <PageTurn> не анимируется). */
export function turnPage(direction: TurnDirection, update: () => void) {
  startTransition(() => {
    addTransitionType(direction);
    update();
  });
}

/**
 * Страница, которую листают (globals.css, «Листание страниц»). side — где она лежит в развороте: правую при листании
 * вперёд переворачивают, левая новая ложится сверху; у одиночной полосы (лист вопроса, макет на телефоне) side="right".
 * Нужен key страницы у этого элемента — смена key и есть «другая страница».
 */
export function PageTurn({ side = "right", children }: { side?: "left" | "right"; children: React.ReactNode }) {
  const right = side === "right";
  return (
    <ViewTransition
      enter={{ "page-forward": right ? "under-in" : "flip-in-left", "page-back": right ? "flip-in-right" : "under-in", default: "none" }}
      exit={{ "page-forward": right ? "flip-out-right" : "under-out", "page-back": right ? "under-out" : "flip-out-left", default: "none" }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
