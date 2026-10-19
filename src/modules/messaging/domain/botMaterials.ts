/**
 * Материалы для клиента — как у менеджера в WhatsApp: перед ценой он присылает одной подборкой фото готовых книг,
 * видео (книга в руках, как пишется на сайте) и пример книги PDF. Разбор 79 чатов прода (19.10): подборка ушла в 56,
 * почти всегда после «кому / к какой дате / город» или на «сколько стоит / как это выглядит».
 *
 * Подборку собирает владелец в настройках бота («Продажи» → «Материалы»), бот отправляет её один раз за беседу.
 */
import type { BotLang } from "./botNlu";

export const MATERIAL_KINDS = ["image", "video", "document"] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];
/** Для какого языка: пример книги на казахском — казахоязычным, на русском — русскоязычным; any — всем. */
export const MATERIAL_LANGS = ["any", "ru", "kk"] as const;
export type MaterialLang = (typeof MATERIAL_LANGS)[number];

export interface BotMaterial {
  id: string;
  kind: MaterialKind;
  /** Ключ в хранилище сайта (bot-media/<uuid>.<ext>). */
  key: string;
  /** Имя файла — у документа его видит клиент («Пример книги.pdf»). */
  name: string;
  mime: string;
  size: number;
  /** Подпись под файлом в WhatsApp (у фото обычно пусто — они уходят альбомом). */
  caption: string;
  lang: MaterialLang;
  /** Что на файле — для модели и для владельца (клиент не видит). */
  about: string;
  on: boolean;
}

export const MAX_MATERIALS = 30;
/** Больше WhatsApp не принимает через шлюз (видео — 16 МБ у получателя, документы — до 100 МБ, держим запас). */
export const MATERIAL_MAX_BYTES: Record<MaterialKind, number> = { image: 5 * 1024 * 1024, video: 16 * 1024 * 1024, document: 30 * 1024 * 1024 };

const KEY = /^bot-media\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const oneOf = <T extends string>(list: readonly T[], v: unknown, d: T): T => ((list as readonly string[]).includes(v as string) ? (v as T) : d);

/** Подборка из настроек: испорченные записи отбрасываются, порядок — как у владельца. */
export function parseMaterials(raw: unknown): BotMaterial[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .flatMap((x): BotMaterial[] => {
      const r = (x ?? {}) as Record<string, unknown>;
      const key = str(r.key, 200);
      const id = str(r.id, 40);
      if (!id || !KEY.test(key)) return [];
      return [
        {
          id,
          kind: oneOf(MATERIAL_KINDS, r.kind, "document"),
          key,
          name: str(r.name, 120) || "file",
          mime: str(r.mime, 100) || "application/octet-stream",
          size: typeof r.size === "number" && r.size > 0 ? r.size : 0,
          caption: str(r.caption, 300),
          lang: oneOf(MATERIAL_LANGS, r.lang, "any"),
          about: str(r.about, 200),
          on: r.on !== false,
        },
      ];
    })
    .slice(0, MAX_MATERIALS);
}

/**
 * Что уходит клиенту и в каком порядке: сначала фото (WhatsApp склеивает подряд идущие фото в альбом), потом видео,
 * потом документы. Материал на другом языке пропускается; если документа на языке клиента нет — уходит любой.
 */
export function materialsFor(list: BotMaterial[], lang: BotLang): BotMaterial[] {
  const on = list.filter((m) => m.on);
  const fits = (m: BotMaterial) => m.lang === "any" || m.lang === lang;
  const docs = on.filter((m) => m.kind === "document");
  const ownDocs = docs.filter(fits);
  return [...on.filter((m) => m.kind === "image" && fits(m)), ...on.filter((m) => m.kind === "video" && fits(m)), ...(ownDocs.length ? ownDocs : docs.slice(0, 1))];
}

/** Подборка одной строкой для модели: «11 фото (…), 3 видео (…), пример книги PDF (…)». */
export function materialsSummary(list: BotMaterial[]): string {
  const on = list.filter((m) => m.on);
  if (!on.length) return "";
  const part = (kind: MaterialKind, label: string) => {
    const items = on.filter((m) => m.kind === kind);
    if (!items.length) return "";
    const about = [...new Set(items.map((m) => m.about).filter(Boolean))].slice(0, 6).join("; ");
    return `${items.length} ${label}${about ? ` (${about})` : ""}`;
  };
  return [part("image", "фото"), part("video", "видео"), part("document", "PDF")].filter(Boolean).join(", ");
}

/**
 * Подборку уже прислал менеджер (при подхвате) — второй раз не шлём: три и больше фото/видео/документа от сотрудника в
 * переписке.
 */
export function materialsAlreadySent(history: { from: string; type?: string }[]): boolean {
  return history.filter((m) => m.from !== "client" && (m.type === "image" || m.type === "video" || m.type === "document")).length >= 3;
}
