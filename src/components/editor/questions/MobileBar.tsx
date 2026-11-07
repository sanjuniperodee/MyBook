"use client";

import type { ReactNode } from "react";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";

/** Нижняя панель действий на телефоне: всегда под рукой и над экранной клавиатурой. */
export function MobileBar({ children }: { children: ReactNode }) {
  const inset = useKeyboardInset();
  return (
    <div data-bottom-bar className="fixed inset-x-0 z-30 border-t border-line bg-paper/95 backdrop-blur-xl lg:hidden" style={{ bottom: inset }}>
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 max-[400px]:gap-1.5 max-[400px]:px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  );
}

/** Кнопка панели со значком и подписью под ним (56 px шириной): «Фото» — чтобы было понятно без догадок. */
export function MobileBarButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-12 w-14 shrink-0 max-[400px]:w-12 flex-col items-center justify-center gap-0.5 rounded-[10px] border border-line-strong bg-white text-ink transition-colors active:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine">
      {icon}
      <span className="text-[10px] leading-none font-medium">{label}</span>
    </button>
  );
}
