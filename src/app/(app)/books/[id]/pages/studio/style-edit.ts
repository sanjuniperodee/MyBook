/**
 * Правка настроек дизайнера страниц (InteriorStyle) без мутаций: поле со значением undefined удаляется — значит
 * «как в стиле»; пустой раздел тоже удаляется. Так в базе хранится только то, что клиент действительно поменял.
 */
import type { ChapterOverride, InteriorStyle } from "@/lib/book/interiors";

type Section = Exclude<keyof InteriorStyle, "chapters">;

function prune<T extends object>(o: T): T | undefined {
  const out = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
  return Object.keys(out).length ? out : undefined;
}

/** Поменять поля раздела настроек (fonts, body, heading, display, label, colors, elements). */
export function patchSection<K extends Section>(style: InteriorStyle, key: K, patch: Partial<NonNullable<InteriorStyle[K]>>): InteriorStyle {
  const next = prune({ ...(style[key] ?? {}), ...patch } as object);
  const out = { ...style, [key]: next } as InteriorStyle;
  if (!next) delete out[key];
  return out;
}

/** Поменять оформление главы; null — вернуть главе общее оформление. */
export function patchChapter(style: InteriorStyle, chapterKey: string, patch: Partial<ChapterOverride> | null): InteriorStyle {
  const chapters = { ...style.chapters };
  const next = patch === null ? undefined : prune({ ...chapters[chapterKey], ...patch });
  if (next) chapters[chapterKey] = next;
  else delete chapters[chapterKey];
  const out: InteriorStyle = { ...style, chapters };
  if (!Object.keys(chapters).length) delete out.chapters;
  return out;
}

/** Сколько своих настроек (без оформления глав) — для подписи и кнопки сброса. */
export function countCustom(style: InteriorStyle): number {
  return (Object.keys(style) as (keyof InteriorStyle)[]).filter((k) => k !== "chapters").reduce((n, k) => n + Object.keys(style[k] ?? {}).length, 0);
}

/** Сбросить всё, кроме оформления отдельных глав. */
export const resetStyle = (style: InteriorStyle): InteriorStyle => (style.chapters ? { chapters: style.chapters } : {});
