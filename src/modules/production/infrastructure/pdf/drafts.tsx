import "server-only";
import type { Locale } from "@/i18n/config";
import type { FlowDecisions } from "@/lib/book/flow-decisions";
import type { BookContent } from "@/lib/book/layout";
import { layoutPdf, renderPdf } from "./fonts";
import { DROP_MARK, FLOW_MARK } from "./flow";
import { FRONT_GROUP, InteriorDocument, interiorGroups, InteriorPages, type InteriorGroup, type PreparedImage } from "./interior";
import type { InteriorOptions } from "./interior/kit";
import { PAGE_MARK } from "./pages";

/**
 * Черновые проходы доводки вёрстки (renderInterior): раскладка блока с заглушками вместо фото, по которой принимаются
 * решения. Раньше каждый проход верстал и записывал в PDF всю книгу: у книги на 240 полос (заказ №87) — 40 проходов по
 * 6 с, 4 минуты на PDF. react-pdf верстает длинную полосу Page за время, растущее как квадрат её длины (после каждой
 * полосы заново раскладывает весь остаток), а решения доводки принимаются по одному на кусок за проход. Теперь:
 *  - блок верстается по частям (interiorGroups split): всё до глав, начальная полоса главы, куски текста между
 *    разрывами (глава и ответ с разрывом начинают полосу — раскладка куска от соседних не зависит), фото, альбом, финал;
 *  - часть без новых входных данных (решений по её блокам, пустой полосы перед ней, концовки, номеров оглавления)
 *    берётся из прошлого прохода;
 *  - кусок текста с новым решением верстается не целиком, а окном: с полосы, которая начинается с целого блока
 *    (restartsOf: react-pdf перенёс его целиком — дальше вёрстка зависит только от блоков с него), за две полосы до
 *    изменения, и до полосы, где новая раскладка снова начинается с того же блока, что старая, — дальше старые полосы;
 *  - только раскладка, без записи PDF (layoutPdf), и от неё хранится лишь то, что читают решения.
 * Раскладка книги собирается из частей по порядку — та же, что дала бы вся книга целиком: номера полос, номера глав
 * (onChapterPage — номер в части плюс полосы частей выше), высоты рядов фото и колонки буквиц — те же. Сверка —
 * tests/pdf-drafts.test.ts и scripts/pdf-draft-parity.ts (книги с заказами).
 */

/** Узел раскладки — только то, что читают решения (flow.ts) и виды полос (pages.ts). */
export interface SlimNode {
  box?: Record<string, number>;
  props?: Record<string, unknown>;
  children?: SlimNode[];
  lines?: { string?: string }[];
}

export interface RawNode {
  box?: Record<string, unknown>;
  props?: Record<string, unknown>;
  children?: RawNode[];
  lines?: { string?: string }[];
}

const BOX_KEYS = ["top", "height", "marginTop", "marginBottom", "paddingTop", "paddingBottom"] as const;
const PROP_KEYS = [FLOW_MARK, DROP_MARK, PAGE_MARK] as const;

/** Узел без лишнего: поля коробки, пометки и строки колонки буквицы; ветви без пометок отбрасываются (кроме полос). */
export function slim(node: RawNode, page = false): SlimNode | null {
  const children = (node.children ?? []).map((c) => slim(c)).filter((c): c is SlimNode => c !== null);
  const props: Record<string, unknown> = {};
  for (const k of PROP_KEYS) if (node.props?.[k] !== undefined) props[k] = node.props[k];
  const marked = props[FLOW_MARK] !== undefined || props[DROP_MARK] !== undefined;
  if (!page && !marked && !children.length) return null;
  // У полосы и помеченных блоков — коробка целиком (поля читают решения), у остальных — только верх: от него
  // считаются координаты детей (поля обёртки-продолжения react-pdf и не обновляет).
  const box: Record<string, number> = {};
  for (const k of page || marked ? BOX_KEYS : (["top"] as const)) if (typeof node.box?.[k] === "number") box[k] = node.box[k] as number;
  return {
    ...(node.box ? { box } : {}),
    props,
    ...(children.length ? { children } : {}),
    ...(props[DROP_MARK] !== undefined && node.lines ? { lines: node.lines.map((l) => ({ string: l.string })) } : {}),
  };
}

/** Пометка вида блока ответа (h:, b:, k:, r:, f:); концовка главы (t:) и чужие — не блоки. */
const blockMark = (mark: unknown): mark is string => typeof mark === "string" && /^[hbkrf]:/.test(mark);

/** Первая пометка доводки на полосе (в порядке обхода) и все пометки полосы. */
function marksOf(page: SlimNode): { first: string | null; all: string[] } {
  const all: string[] = [];
  const walk = (n: SlimNode) => {
    const m = n.props?.[FLOW_MARK];
    if (typeof m === "string") all.push(m);
    for (const c of n.children ?? []) walk(c);
  };
  for (const c of page.children ?? []) walk(c);
  return { first: all[0] ?? null, all };
}

/**
 * Полосы, с которых раскладку можно продолжить заново: полоса начинается с блока ответа, которого не было на прошлых
 * полосах (не продолжение — react-pdf перенёс его целиком). Дальше вёрстка зависит только от блоков с него: тот же
 * документ, начатый с этого блока (ChapterBody begin), даёт те же полосы. Остальные полосы — null.
 */
export function restartsOf(pages: readonly SlimNode[]): ({ item: string; mark: string } | null)[] {
  const seen = new Set<string>();
  return pages.map((page) => {
    const { first, all } = marksOf(page);
    const at = first && blockMark(first) && !seen.has(first) ? { item: first.split(":")[1], mark: first } : null;
    for (const m of all) seen.add(m);
    return at;
  });
}

interface Part {
  sig: string;
  pages: SlimNode[];
  /** Номер полосы главы в части (с 1), как его отдаёт onChapterPage. */
  chapters: Record<string, number>;
  rowHeights: Map<string, number>;
  dropColumns: Map<string, { text: string; lines: number }>;
  /** У куска текста: его ответы, решения по его блокам (ключ — вид и пометка) и концовка. */
  items?: string[];
  decisions?: Map<string, string>;
  tail?: boolean;
}

export interface DraftLayout {
  layout: unknown;
  /** Номера полос глав (как onChapterPage у всей книги). */
  captured: Record<string, number>;
  rowHeights: Map<string, number>;
  dropColumns: Map<string, { text: string; lines: number }>;
}

/** Ответ из пометки решения (`r:<ответ>:…`, `b:<ответ>:…`). */
const itemOf = (mark: string) => mark.split(":")[1];

/** Пометка решения: вид решения и пометка блока (`s r:…`), разрыв — `b <ответ>`. */
const decisionMark = (key: string) => key.slice(2);

type Desc = { item: string; mark: string } | null;

/** Последняя пометка блока ответа (h:, b:, k:, r:, f:) на полосе — конец окна. */
function lastBlockOn(page: SlimNode): Desc {
  const marks = marksOf(page).all.filter(blockMark);
  const m = marks[marks.length - 1];
  return m ? { item: itemOf(m), mark: m } : null;
}

/** Полоса, где пометка впервые встречается (в любой высоте); нет — -1. */
function firstPageOf(pages: readonly SlimNode[], test: (mark: string) => boolean) {
  return pages.findIndex((p) => marksOf(p).all.some(test));
}

export class DraftBook {
  private parts = new Map<string, Part>();

  constructor(
    private readonly content: BookContent,
    private readonly language: Locale | undefined,
    private readonly bleedMm: number,
    private readonly images: Map<string, PreparedImage>,
    /** Вся книга одним документом с записью PDF, как до 24.11 — для сверки (scripts/pdf-draft-parity.ts). */
    private readonly whole = false,
  ) {}

  /** Решения доводки по блокам ответов items: ключ — вид решения и пометка блока. */
  private static decisionsOf(items: readonly string[], flow: FlowDecisions) {
    const own = new Set(items);
    const out = new Map<string, string>();
    for (const item of flow.breakBefore) if (own.has(item)) out.set(`b ${item}`, "1");
    for (const [mark, v] of flow.rowScale) if (own.has(itemOf(mark))) out.set(`s ${mark}`, String(v));
    for (const [mark, v] of flow.rowOffset) if (own.has(itemOf(mark))) out.set(`o ${mark}`, String(v));
    for (const [mark, v] of flow.dropSplit) if (own.has(itemOf(mark))) out.set(`d ${mark}`, String(v));
    return out;
  }

  /** Все ли решения доводки относятся к ответам частей (иначе части не сравниваем и верстаем всё заново). */
  private static covered(groups: InteriorGroup[], flow: FlowDecisions) {
    const items = new Set(groups.flatMap((g) => g.items ?? []));
    const marks = [...flow.rowScale.keys(), ...flow.rowOffset.keys(), ...flow.dropSplit.keys()];
    return marks.every((m) => items.has(itemOf(m)));
  }

  /** Раскладка книги с решениями flow и номерами оглавления tocPages. */
  async layout(flow: FlowDecisions, tocPages: Record<string, number> | undefined): Promise<DraftLayout> {
    if (this.whole) return this.wholeBook(flow, tocPages);
    const base = { bleedMm: this.bleedMm, images: this.images, flow, tocPages };
    const groups = interiorGroups(this.content, base, true);
    const reuse = DraftBook.covered(groups, flow);
    const before = this.parts;
    const next = new Map<string, Part>();
    for (const group of groups) {
      const items = group.items;
      const decisions = items ? DraftBook.decisionsOf(items, flow) : undefined;
      const tail = group.tail !== undefined ? !flow.noTail.has(group.tail) : undefined;
      const extra = [group.key === FRONT_GROUP ? JSON.stringify(tocPages ?? null) : "", group.blank ? String(flow.blankBefore.has(group.blank)) : ""].join("|");
      const sig = JSON.stringify([items ?? null, decisions ? [...decisions].sort() : null, tail ?? null, extra]);
      const old = reuse ? before.get(group.key) : undefined;
      if (old?.sig === sig) {
        next.set(group.key, old);
        continue;
      }
      const part = group.window && reuse ? await this.windowed(group, base, items!, decisions!, tail, old, before) : await this.whole1(group, base);
      next.set(group.key, { ...part, sig, items, decisions, tail });
    }
    this.parts = next;
    // Книга из частей по порядку: номера полос глав — в части плюс полосы частей выше.
    const pages: SlimNode[] = [];
    const captured: Record<string, number> = {};
    const rowHeights = new Map<string, number>();
    const dropColumns = new Map<string, { text: string; lines: number }>();
    for (const { key } of groups) {
      const part = next.get(key)!;
      for (const [k, n] of Object.entries(part.chapters)) captured[k] = pages.length + n;
      for (const [k, v] of part.rowHeights) rowHeights.set(k, v);
      for (const [k, v] of part.dropColumns) dropColumns.set(k, v);
      pages.push(...part.pages);
    }
    return { layout: { children: pages }, captured, rowHeights, dropColumns };
  }

  /** Раскладка документа из полос node со своими сборщиками (высоты рядов, колонки буквиц, номера глав). */
  private async run(base: object, pick: (options: InteriorOptions) => React.ReactNode[]) {
    const rowHeights = new Map<string, number>();
    const dropColumns = new Map<string, { text: string; lines: number }>();
    const chapters: Record<string, number> = {};
    const options: InteriorOptions = { ...(base as InteriorOptions), rowHeights, dropColumns, onChapterPage: (k: string, p: number) => (chapters[k] = p) };
    const raw = (await layoutPdf(<InteriorPages content={this.content} options={options} pages={pick(options)} />, this.language)) as RawNode | undefined;
    const pages = (raw?.children ?? []).map((p) => slim(p, true)).filter((p): p is SlimNode => p !== null);
    return { pages, chapters, rowHeights, dropColumns };
  }

  /** Часть целиком. */
  private whole1(group: InteriorGroup, base: object) {
    return this.run(base, (options) => interiorGroups(this.content, options, true).find((g) => g.key === group.key)!.pages);
  }

  /** Окно куска текста: с блока begin до блока end (null — с начала куска, до конца). */
  private window(group: InteriorGroup, base: object, begin: Desc, end: Desc) {
    return this.run(base, (options) => [interiorGroups(this.content, options, true).find((g) => g.key === group.key)!.window!(begin, end)]);
  }

  /**
   * Кусок текста по прошлой раскладке: заново — только от полосы, с которой можно начать (за две полосы до первого
   * изменения), и до полосы, где новая раскладка снова начинается с того же блока, что старая (дальше — старые полосы).
   * Изменения — решения по блокам куска, его конец (ответы ушли в новый кусок) и концовка. Новый кусок (после нового
   * разрыва) берёт старую раскладку из куска, где его ответы стояли раньше.
   */
  private async windowed(group: InteriorGroup, base: object, items: string[], decisions: Map<string, string>, tail: boolean | undefined, old: Part | undefined, before: Map<string, Part>) {
    // Старая раскладка: своя или куска, где стоял первый ответ (тогда старые полосы — с его первой полосы).
    let pages: SlimNode[];
    let restarts: Desc[];
    let seeded = false;
    let prev = old;
    const changes: number[] = [];
    if (prev?.items) {
      pages = prev.pages;
      restarts = restartsOf(pages);
    } else {
      prev = [...before.values()].find((p) => p.items?.includes(items[0]));
      if (!prev?.items) return this.whole1(group, base);
      const from = firstPageOf(prev.pages, (m) => itemOf(m) === items[0]);
      if (from < 0) return this.whole1(group, base);
      pages = prev.pages.slice(from);
      restarts = restartsOf(prev.pages).slice(from);
      seeded = true;
      changes.push(0);
    }
    const kept = new Set(items);
    // У нового куска со старыми решениями сравниваем только решения по его ответам.
    const oldDecisions = new Map([...(prev.decisions ?? [])].filter(([key]) => !seeded || kept.has(key.startsWith("b ") ? decisionMark(key) : itemOf(decisionMark(key)))));
    // Что поменялось и на какой старой полосе: решения по блокам, ушедшие ответы, концовка.
    let toEnd = false;
    for (const key of new Set([...oldDecisions.keys(), ...decisions.keys()])) {
      if (oldDecisions.get(key) === decisions.get(key)) continue;
      const mark = decisionMark(key);
      const page = key.startsWith("b ") ? firstPageOf(pages, (m) => itemOf(m) === mark) : firstPageOf(pages, (m) => m === mark);
      if (page < 0) return this.whole1(group, base);
      changes.push(page);
    }
    const gone = (prev.items ?? []).find((it, i) => i > 0 && !kept.has(it) && (seeded ? (prev!.items ?? []).indexOf(items[0]) < i : true));
    if (gone) {
      const page = firstPageOf(pages, (m) => itemOf(m) === gone);
      if (page < 0) return this.whole1(group, base);
      changes.push(page);
      toEnd = true;
    }
    if (!seeded && prev.tail !== tail) {
      changes.push(pages.length - 1);
      toEnd = true;
    }
    if (seeded && (prev.tail !== tail || prev.items[prev.items.length - 1] !== items[items.length - 1])) toEnd = true;
    if (!changes.length) return this.whole1(group, base);
    const first = Math.min(...changes);
    const last = Math.max(...changes);
    // Откуда верстать: полоса-начало за две полосы до первого изменения (у нового куска — его начало).
    let r = 0;
    if (!seeded) for (let i = Math.max(0, first - 2); i > 0; i--) if (restarts[i]) { r = i; break; }
    const prefix = seeded ? [] : pages.slice(0, r);
    let begin: Desc = seeded || r === 0 ? null : restarts[r];
    // Где можно сойтись со старой раскладкой: полосы-начала после всех изменений (и не на последних полосах).
    const cands = toEnd ? [] : restarts.flatMap((d, i) => (d && i > last && i + 1 < pages.length ? [i] : []));
    const got: SlimNode[] = [];
    const rowHeights = new Map(prev.rowHeights);
    const dropColumns = new Map(prev.dropColumns);
    let chapters = seeded ? {} : prev.chapters;
    let ci = 0;
    for (;;) {
      const q = cands[ci];
      const end = q === undefined ? null : lastBlockOn(pages[q + 1]);
      const w = await this.window(group, base, begin, end);
      for (const [k, v] of w.rowHeights) rowHeights.set(k, v);
      for (const [k, v] of w.dropColumns) dropColumns.set(k, v);
      if (!begin && !got.length) chapters = w.chapters;
      // Окно до конца куска: оно и есть остаток.
      if (q === undefined || !end) return { pages: [...prefix, ...got, ...w.pages], chapters, rowHeights, dropColumns };
      const now = restartsOf(w.pages);
      const target = restarts[q]!;
      const j = now.findIndex((d) => d?.mark === target.mark);
      if (j >= 0) {
        // Сошлось: с полосы j новая раскладка — старая с полосы q.
        return { pages: [...prefix, ...got, ...w.pages.slice(0, j), ...pages.slice(q)], chapters, rowHeights, dropColumns };
      }
      // Не сошлось: окно верно до полосы, где стоит блок старого начала; новое начало — последняя полоса-начало до неё.
      const at = firstPageOf(w.pages, (m) => m === target.mark);
      let s = -1;
      for (let i = Math.min(at < 0 ? w.pages.length - 2 : at, w.pages.length - 2); i > 0; i--) if (now[i]) { s = i; break; }
      if (s > 0) {
        got.push(...w.pages.slice(0, s));
        begin = now[s];
      }
      ci++;
    }
  }

  /** Как раньше: вся книга, с записью PDF. */
  private async wholeBook(flow: FlowDecisions, tocPages: Record<string, number> | undefined): Promise<DraftLayout> {
    let layout: unknown;
    const captured: Record<string, number> = {};
    const rowHeights = new Map<string, number>();
    const dropColumns = new Map<string, { text: string; lines: number }>();
    await renderPdf(
      <InteriorDocument
        content={this.content}
        options={{ bleedMm: this.bleedMm, images: this.images, flow, rowHeights, dropColumns, tocPages, onLayout: (l) => (layout = l), onChapterPage: (k, p) => (captured[k] = p) }}
      />,
      this.language,
    );
    return { layout, captured, rowHeights, dropColumns };
  }
}
