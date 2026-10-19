/**
 * Шаблоны обложек, созданные в CRM. Хранятся в БД; на сервере реестр заполняется при старте и после
 * каждого изменения в CRM, в браузере — из данных, которые корневой layout передаёт <CoverRegistry>.
 * Реестр общий для всех копий модуля в процессе (globalThis): серверные компоненты, SSR и обработчики
 * маршрутов видят одни и те же шаблоны.
 */
import type { CoverTemplate } from "./covers";
import { photoTemplate, type PhotoTemplateData } from "./photo-cover";

export type CustomCoverStatus = "active" | "hidden" | "draft";

/** Шаблон из CRM, как его передают в браузер. */
export interface CustomCoverData {
  data: PhotoTemplateData;
  status: CustomCoverStatus;
  /** Версия — меняется при каждом сохранении (сбрасывает кэш картинок). */
  rev: number;
  position: number;
}

interface Store {
  byId: Map<string, CoverTemplate>;
  active: CoverTemplate[];
  raw: CustomCoverData[];
  stamp: string;
}

const KEY = Symbol.for("mybook.customCovers");

function store(): Store {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  return (g[KEY] ??= { byId: new Map(), active: [], raw: [], stamp: "" });
}

/** Подменяет набор шаблонов из CRM. Повторный вызов с теми же данными ничего не делает. */
export function setCustomCovers(list: CustomCoverData[]) {
  const s = store();
  const stamp = list.map((c) => `${c.data.id}:${c.rev}:${c.status}:${c.position}`).join("|");
  if (stamp === s.stamp) return;
  const sorted = [...list].sort((a, b) => a.position - b.position || a.data.id.localeCompare(b.data.id));
  s.byId = new Map(sorted.map((c) => [c.data.id, photoTemplate(c.data, { rev: c.rev, custom: true, hidden: c.status !== "active" })]));
  s.active = sorted.filter((c) => c.status === "active").map((c) => s.byId.get(c.data.id)!);
  s.raw = sorted;
  s.stamp = stamp;
}

export function customCover(id: string): CoverTemplate | undefined {
  return store().byId.get(id);
}

/** Опубликованные шаблоны из CRM — в порядке, заданном в CRM. */
export function activeCustomCovers(): CoverTemplate[] {
  return store().active;
}

/** Всё, что знает реестр, — для передачи в браузер. */
export function customCoversSnapshot(): CustomCoverData[] {
  return store().raw;
}
