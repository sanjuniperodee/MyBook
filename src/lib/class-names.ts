import { clsx, type ClassValue } from "clsx";

/** Склейка CSS-классов. Без словарей и прочих зависимостей: модуль есть почти в каждом клиентском бандле. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
