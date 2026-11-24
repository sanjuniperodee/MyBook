/**
 * Места полос, которые открывают правку (превью книги в кабинете: нажал на текст — редактор этого ответа с нужного
 * абзаца, на фото — правка фото, на название главы — лист главы). Читаются из итоговой раскладки react-pdf: блоки
 * текста уже помечены для доводки вёрстки (FLOW_MARK: заголовок h, лид k, блок b), фото и название главы — своей
 * пометкой ZONE_MARK (interior/kit.ts zone), начальная полоса главы — целиком по виду полосы (PAGE_MARK).
 */
import { answerBlocks } from "@/lib/book/answer-blocks";
import type { PageZone } from "@/lib/book/book-build";
import { splitParagraphsDetailed } from "@/lib/book/inline-photo";
import type { BookContent } from "@/lib/book/layout";
import { GALLERY_KEY } from "@/lib/book/toc";
import { FLOW_MARK } from "./flow";
import { PAGE_MARK } from "./pages";

/** Пометка узла react-pdf для места правки: `p|<фото>` или `c|<глава>`. */
export const ZONE_MARK = "zoneMark";

interface Node {
  box?: { left?: number; top?: number; width?: number; height?: number };
  props?: Record<string, unknown>;
  children?: Node[];
}

/** Часть истории после фото на всю страницу — `<вопрос>-p<n>` (layout.ts splitAtPagePhotos). */
const baseItem = (item: string) => item.replace(/-p\d+$/, "");

const round = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

/**
 * Места правки по полосам (номер с 1). questions — вопросы книги (письма близких и прочее без вопроса — не места),
 * photoQuestion — ответ, в котором стоит фото; bleedPt — вылет полосы (в экранной сборке полоса шире обрезного формата).
 */
export function readZones(layout: unknown, content: BookContent, questions: ReadonlySet<string>, photoQuestion: ReadonlyMap<string, string | null>, bleedPt: number): Record<number, PageZone[]> {
  const items = new Map(content.chapters.flatMap((c) => c.items.map((it) => [it.id, it] as const)));
  const firstQuestion = new Map(content.chapters.map((c) => [c.key, c.items.map((it) => baseItem(it.id)).find((id) => questions.has(id))] as const));
  // Абзац, с которого начинается блок набора: те же блоки, что верстает PDF (answer-blocks).
  const blockFrom = new Map<string, number[]>();
  const fromOf = (item: string, index: number) => {
    let list = blockFrom.get(item);
    if (!list) {
      const it = items.get(item);
      const { paragraphs, breaks } = splitParagraphsDetailed(it?.answer ?? "");
      list = answerBlocks(paragraphs, { plain: content.interior.plainAnswers, breaks }).map((b) => b.from);
      blockFrom.set(item, list);
    }
    return list[index];
  };

  const out: Record<number, PageZone[]> = {};
  const pages = ((layout as Node | undefined)?.children ?? []).filter((p) => p.box);
  pages.forEach((page, i) => {
    const pw = page.box?.width ?? 0;
    const ph = page.box?.height ?? 0;
    const tw = pw - bleedPt * 2;
    const th = ph - bleedPt * 2;
    if (tw <= 0 || th <= 0) return;
    const zones: PageZone[] = [];
    const add = (left: number, top: number, width: number, height: number, z: Omit<PageZone, "x" | "y" | "w" | "h">) => {
      if (width < 1 || height < 1) return;
      zones.push({ x: round((left - bleedPt) / tw), y: round((top - bleedPt) / th), w: round(width / tw), h: round(height / th), ...z });
    };
    const mark = page.props?.[PAGE_MARK] as { kind?: string; chapterKey?: string } | undefined;
    // Начальная полоса главы или альбома — вся полоса: название, эпиграф и фото главы правятся в листе главы.
    if (mark?.kind === "opener" && mark.chapterKey) {
      const q = mark.chapterKey === GALLERY_KEY ? undefined : firstQuestion.get(mark.chapterKey);
      add(bleedPt, bleedPt, tw, th, { t: "chapter", key: mark.chapterKey, ...(q ? { q } : {}) });
    }
    const walk = (node: Node, x: number, y: number) => {
      const left = x + (node.box?.left ?? 0);
      const top = y + (node.box?.top ?? 0);
      const w = node.box?.width ?? 0;
      const h = node.box?.height ?? 0;
      const flow = node.props?.[FLOW_MARK];
      const zone = node.props?.[ZONE_MARK];
      if (typeof flow === "string") {
        const [kind, item, index] = flow.split(":");
        const q = item ? baseItem(item) : "";
        if ((kind === "h" || kind === "k" || kind === "b") && questions.has(q)) {
          const p = kind !== "h" && item === q ? fromOf(item, Number(index)) : undefined;
          add(left, top, w, h, { t: "text", q, ...(p !== undefined ? { p } : {}) });
        }
      } else if (typeof zone === "string") {
        const [kind, id] = zone.split("|");
        if (kind === "p" && id) {
          const q = photoQuestion.get(id);
          add(left, top, w, h, { t: "photo", id, ...(q ? { q } : {}) });
        } else if (kind === "c" && id) {
          const q = firstQuestion.get(id);
          add(left, top, w, h, { t: "chapter", key: id, ...(q ? { q } : {}) });
        }
        return;
      }
      for (const c of node.children ?? []) walk(c, left, top);
    };
    for (const c of page.children ?? []) walk(c, 0, 0);
    if (zones.length) out[i + 1] = zones;
  });
  return out;
}
