"use client";

import { useKeyboardInset } from "@/hooks/useKeyboardInset";

/** Нижняя панель действий на телефоне: всегда под рукой и над экранной клавиатурой. */
export function MobileBar({ children }: { children: React.ReactNode }) {
  const inset = useKeyboardInset();
  return (
    <div className="fixed inset-x-0 z-30 border-t border-line/80 bg-paper/95 backdrop-blur-xl lg:hidden" style={{ bottom: inset }}>
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  );
}
