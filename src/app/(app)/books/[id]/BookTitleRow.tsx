"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/class-names";

/**
 * Строка с названием книги в шапке «студии». В редакторе текста на телефоне она прячется: над листом остаются только
 * вкладки — экран и так делят клавиатура и нижняя панель, а книга понятна из вкладки «Обзор».
 */
export function BookTitleRow({ children }: { children: React.ReactNode }) {
  const writing = usePathname().endsWith("/questions");
  return <div className={cn("flex items-center gap-2 pt-2 sm:gap-3 sm:pt-3", writing && "max-sm:hidden")}>{children}</div>;
}
