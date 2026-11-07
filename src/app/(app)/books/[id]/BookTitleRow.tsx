"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/class-names";

/**
 * Строка с названием книги над лентой пути. В редакторе текста на телефоне она прячется: над листом остаются только
 * лента и редактор — экран и так делят клавиатура и нижняя панель, а книга понятна из «Обзора».
 */
export function BookTitleRow({ children }: { children: React.ReactNode }) {
  const writing = usePathname().endsWith("/questions");
  return <div className={cn("flex items-center gap-2 py-2 sm:gap-3 sm:py-3", writing && "max-sm:hidden")}>{children}</div>;
}
