/**
 * Заглушка next/dynamic для стенда html-snapshot: i18n/client грузит словарь языка через dynamic(). Вне Next —
 * React.lazy; стенд ждёт, пока разметка устоится, так что ленивый словарь успевает загрузиться.
 */
import { lazy, type ComponentType } from "react";

export default function dynamic<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  return lazy(load);
}
