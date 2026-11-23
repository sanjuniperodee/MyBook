/**
 * Глава превью деревом блоков, как её верстает PDF (pdf/interior/chapter-body.tsx, entry.tsx, text-block.tsx,
 * inline-rows.tsx, media-card.tsx): те же блоки, поля, «держать со следующим», неделимость и разрывы. По дереву
 * lib/book/paginate.ts раскладывает главу на полосы по правилам react-pdf, а доводка (flow-decisions) принимает те же
 * решения, что у PDF.
 *
 * Высоты: у текста — строки (Кнут — Пласс, kit.breaker) × интерлиньяж, как у react-pdf; у неделимых блоков (ряды фото,
 * цитаты, заголовок с линейкой, разделитель-звёздочки, заголовок главы над текстом) — замер копии главы (measured),
 * у карточки QR и концовки — по размерам из типографики. Нет строк или замера — дерева нет (null): превью раскладывает
 * колонками браузера.
 */
import type { AnswerBlock } from "@/lib/book/answer-blocks";
import { listMarkerEm } from "@/lib/book/answer-blocks";
import { mediaCardBox, type AnswerMedia } from "@/lib/book/answer-media";
import { applyDecision, emptyFlow, FLOW_KINDS, nextDecisions, type FlowDecisions, type FlowKind, type FlowLayout } from "@/lib/book/flow-decisions";
import { MM_TO_PT } from "@/lib/book/formats";
import { framedBox, placedByAuthor, rowSpaceAbove, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { dividerDrawing, vignetteDrawing } from "@/lib/book/interior-art";
import { textArea } from "@/lib/book/page-geometry";
import { paginate, type PagePiece, type PNode, type PText, type PView } from "@/lib/book/paginate";
import { naturalLineHeight } from "@/lib/book/fonts";
import { ANSWER, CHAPTER_TAIL, DIVIDER, dropCapPlan, HTML_LINE_HEIGHT, QUOTE_MARK, quoteFace, quoteStyle, HEADING, INLINE_ROW, KEEP_WITH_NEXT, MEDIA_CARD, paraAfter, splitInitial, splitLeadIn, VIGNETTE_RULE } from "@/lib/book/typesetting";
import { chapterHeadSizes } from "@/lib/book/chapter-head";
import type { PageKit } from "@/components/interior/kit";
import { metricsOf } from "@/components/interior/kit";
import { bodySpec, faceSpec, headingSpec, italicSpec, leadSpec, measureWidthPt, textWidthPt } from "@/components/interior/text-specs";
import { dropCapLayout } from "@/components/interior/drop-cap";
import type { BreakRequest } from "@/components/interior/line-breaker";

type Item = { p: { width: number; height: number; caption?: string }; style: InlinePhotoStyle };

/** Ответ главы, как его раскладывает превью (ChapterPages: info). */
export interface TreeEntry {
  id: string;
  heading: string | null;
  pageBreak?: boolean;
  blocks: AnswerBlock[];
  /** Ряды фото по месту (−1, номер блока, Infinity) и фото на всю страницу там же. */
  rows: Map<number, Item[][]>;
  pages: Map<number, Item[][]>;
  media: Map<number, AnswerMedia[]>;
}

/** Замер неделимого блока: высота рамки и отступы внутри (pt). */
export interface Measured {
  height: number;
  padTop: number;
  padBottom: number;
}

/** Кусок главы между фото на всю страницу (у PDF — своя страница <Page>): блоки и что за ним. */
export interface TreeRun {
  nodes: PNode[];
  /** После куска — фото на всю страницу (id снимка); нет — кусок последний. */
  photo?: string;
}

const view = (p: Partial<PView> & Pick<PView, "children">): PView => ({ kind: "view", mt: 0, mb: 0, pt: 0, pb: 0, wrap: true, brk: false, minPresenceAhead: 0, ...p });
const text = (p: Partial<PText> & Pick<PText, "lines">): PText => ({ kind: "text", mt: 0, mb: 0, pt: 0, pb: 0, wrap: true, brk: false, minPresenceAhead: 0, orphans: 2, widows: 2, ...p });

export interface TreeInput {
  kit: PageKit;
  chapterKey: string;
  entries: TreeEntry[];
  flow: FlowDecisions;
  /** Глава без начальной полосы: название над текстом (inline) — у первого куска. */
  start?: "inline" | "none";
  /** Концовка главы (есть текст и доводка её не сняла). */
  tail: boolean;
  measured: ReadonlyMap<string, Measured>;
}

/**
 * Дерево главы для разбивки на полосы, по кускам (между фото на всю страницу). Пометки узлов (id) — те же, что
 * data-pid в разметке превью: по ним ставятся разрывы. null — чего-то не хватает (строки, замер).
 */
export function chapterTree(input: TreeInput, drops = new Map<string, number>()): TreeRun[] | null {
  const { kit, entries, flow, measured } = input;
  const { design, sizes: S } = kit;
  const breaker = kit.breaker;
  if (!breaker) return null;
  const lh = (size: number, factor: number) => size * factor;
  const bodyLh = lh(S.body, design.type.lineHeight);
  const q = quoteFace(design);
  const captionLh = S.caption * naturalLineHeight(q.font, q.weight, !!q.italic);
  const lines = (req: Omit<BreakRequest, "justify"> & { justify?: boolean }, height: number): number[] | null => {
    let out: number[] = [];
    for (const para of req.text.split("\n")) {
      const l = breaker({ ...req, text: para, justify: req.justify ?? false });
      if (!l) return null;
      out = out.concat(l.map(() => height));
    }
    return out;
  };
  const leaf = (pid: string, extra: Partial<PView> = {}): PView | null => {
    const m = measured.get(pid);
    if (!m) return null;
    return view({ id: pid, children: [], wrap: false, content: m.height - m.padTop - m.padBottom, ...extra });
  };
  const measureW = measureWidthPt(kit);
  const textW = textWidthPt(kit);
  const area = textArea(kit.format);
  const runs: TreeRun[] = [{ nodes: [] }];
  const run = () => runs[runs.length - 1];
  let failed = false;
  const need = <T,>(v: T | null): T => {
    if (v === null) failed = true;
    return v as T;
  };

  // Заголовок главы над текстом (inline): неделимый блок со своим полем снизу — замер.
  if (input.start === "inline") {
    const head = need(leaf(`c:${input.chapterKey}`, { mb: chapterHeadSizes(S).after }));
    if (head) run().nodes.push(head);
  }

  // Номер ответа в куске главы (у PDF куски — свои страницы, ответы в них нумеруются заново).
  let indexInRun = 0;
  entries.forEach((e, index) => {
    const breaks = flow.breakBefore.has(e.id) || !!e.pageBreak;
    const lead = e.blocks.length ? -1 : Number.POSITIVE_INFINITY;
    // Последовательность ответа: блоки, ряды, карточки, «с новой страницы» и фото на всю страницу — по порядку вёрстки.
    type Step = { node: PNode } | { part: true } | { photo: string };
    const seq: Step[] = [];
    const at = indexInRun;
    const fresh = at === 0 || breaks;
    const bare = !e.heading && at === 0 && !(index === 0 && input.start === "inline");
    const rowsAt = (place: number) => {
      (e.rows.get(place) ?? []).forEach((row, r) => {
        const own = placedByAuthor(row[0].style);
        const mark = `${own ? "f" : "r"}:${e.id}:${place}:${r}`;
        const rowBreaks = !!row[0].style.breakBefore && !(fresh && bare && place === lead && r === 0);
        // Высота ряда — как у PDF (inline-rows.tsx): самое высокое фото с подписью; уменьшенный доводкой — снимки
        // меньше, подпись та же (строки — шириной в рамку снимка, высотой по метрикам шрифта: Text без lineHeight).
        const k = own ? 1 : (flow.rowScale.get(mark) ?? 1);
        let content = 0;
        for (const x of row) {
          const b = framedBox(x.p, x.style, area.w * MM_TO_PT, area.h * MM_TO_PT, row.length);
          let h = b.outerH * k;
          if (x.style.frame !== "polaroid" && (x.p as { caption?: string }).caption) {
            const caption = (x.p as { caption?: string }).caption!;
            const l = need(lines({ text: caption, spec: italicSpec(kit, S.caption), width: b.outerW * k, hyphens: false }, captionLh));
            if (!l) return;
            h += INLINE_ROW.captionGap + l.reduce((a, v) => a + v, 0);
          }
          content = Math.max(content, h);
        }
        const space = own ? rowSpaceAbove(row, area.w * MM_TO_PT, area.h * MM_TO_PT) : (flow.rowOffset.get(mark) ?? 0);
        if (rowBreaks) seq.push({ part: true });
        seq.push({ node: view({ id: mark, children: [], wrap: false, content, mt: rowBreaks ? 0 : S.body * INLINE_ROW.before, mb: S.body * INLINE_ROW.after, pt: space }) });
      });
      // Фото на всю страницу — своя полоса: кусок главы кончается.
      for (const row of e.pages.get(place) ?? []) for (const item of row) seq.push({ photo: (item as unknown as { p: { id: string } }).p.id });
      for (const m of e.media.get(place) ?? []) {
        const box = mediaCardBox(textW, metricsOf(kit).scale);
        seq.push({ node: view({ id: `b:${e.id}:m${place}:${m.id}`, children: [], wrap: false, content: box.height, mt: S.body * MEDIA_CARD.before, mb: S.body * MEDIA_CARD.after }) });
      }
    };
    if (e.blocks.length) rowsAt(-1);
    e.blocks.forEach((b, i) => {
      seq.push({ node: need(block(e.id, b, i, index === 0 && i === 0)) });
      if (i < e.blocks.length - 1) rowsAt(i);
    });
    rowsAt(Number.POSITIVE_INFINITY);

    // Заголовок или разделитель — в начале истории (разделитель — у не первого ответа куска).
    const head: PNode | null = e.heading
      ? design.heading.bar
        ? (() => {
            // Заголовок с линейкой — неделимый блок (как у PDF): линейка, отбивка, строки заголовка и поле под ними.
            const l = need(lines({ text: e.heading, spec: headingSpec(kit, S.heading), width: measureW, hyphens: false }, lh(S.heading, HEADING.lineHeight)));
            const scale = metricsOf(kit).scale;
            return l ? view({ id: `h:${e.id}`, children: [], wrap: false, minPresenceAhead: KEEP_WITH_NEXT, content: HEADING.bar.thickness + HEADING.bar.after * scale + l.reduce((a, v) => a + v, 0) + S.afterHeading }) : null;
          })()
        : (() => {
            const l = need(lines({ text: e.heading, spec: headingSpec(kit, S.heading), width: measureW, hyphens: false }, lh(S.heading, HEADING.lineHeight)));
            return l ? text({ id: `h:${e.id}`, lines: l, mb: S.afterHeading, minPresenceAhead: KEEP_WITH_NEXT }) : null;
          })()
      : at > 0
        ? divider(e.id)
        : null;

    // История в куске — блок с полем сверху и разрывом (как Entry у PDF); «с новой страницы» — следующий блок с
    // разрывом; фото на всю страницу — новый кусок, где продолжение истории — первый ответ (без поля и заголовка).
    let current = view({ brk: at > 0 && breaks, mt: fresh ? 0 : e.heading ? S.beforeHeading : S.beforeHeadless, children: head ? [head] : [] });
    let continued = false;
    const close = () => {
      if (current.children.length || !continued) run().nodes.push(current);
    };
    for (const step of seq) {
      if ("node" in step) {
        if (step.node) current.children.push(step.node);
      } else if ("part" in step) {
        close();
        current = view({ brk: true, children: [] });
        continued = false;
      } else {
        close();
        run().photo = step.photo;
        runs.push({ nodes: [] });
        current = view({ children: [] });
        continued = true;
      }
    }
    close();
    // Пустое продолжение после фото в конце истории у PDF не печатается: следующий ответ — первый в куске.
    indexInRun = continued && !current.children.length ? 0 : continued ? 1 : at + 1;
  });

  if (input.tail) {
    const art = vignetteDrawing(design.ornament, VIGNETTE_RULE.end, design.palette);
    run().nodes.push(view({ id: `t:${input.chapterKey}`, children: [], wrap: false, content: art.h, mt: S.beforeHeading * CHAPTER_TAIL.before }));
  }
  return failed ? null : runs;

  /** Разделитель между ответами без заголовка — как Divider у PDF. */
  function divider(id: string): PNode | null {
    const pid = `h:${id}`;
    if (design.divider === "space") return view({ id: pid, children: [], content: S.body * 0.8, mb: S.beforeHeadless, minPresenceAhead: KEEP_WITH_NEXT });
    // «* * *» у PDF — строка встроенного Helvetica (высота 1,1 кегля).
    if (design.divider === "stars") return text({ id: pid, lines: [S.body * HTML_LINE_HEIGHT.stars], mb: S.beforeHeadless, minPresenceAhead: KEEP_WITH_NEXT });
    const art = dividerDrawing(design.ornament, design.divider, design.palette);
    return view({ id: pid, children: [], content: art.h, mt: S.body * DIVIDER.before, mb: S.beforeHeadless + S.body * DIVIDER.after, minPresenceAhead: KEEP_WITH_NEXT });
  }

  /** Блок набора ответа — как TextBlock у PDF. */
  function block(id: string, b: AnswerBlock, i: number, start: boolean): PNode | null {
    const pid = `${b.kind === "lede" ? "k" : "b"}:${id}:${i}`;
    switch (b.kind) {
      case "para": {
        // Абзац с буквицей — как у PDF (DropCapParagraph): опущенная — ряд «буква + колонка» и продолжение под ним
        // с места, решённого доводкой; поднятая — строки с крупной первой буквой.
        const plan = start ? dropCapPlan(design, S) : null;
        if (plan && splitInitial(b.text)) {
          const leadOn = start && !!design.leadIn;
          if (plan.style === "drop") {
            const dc = need(dropCapLayout({ ...kit, dropSplit: flow.dropSplit }, b.text, leadOn, pid));
            if (!dc) return null;
            drops.set(pid, dc.real);
            const after = dc.after ? need(lines(dc.afterReq, bodyLh)) : [];
            if (!after) return null;
            const row = view({ id: `${pid}:d`, children: [], wrap: false, content: Math.max(plan.top + plan.size * plan.lineHeight, plan.height) });
            return view({ id: pid, mb: S.body * paraAfter(design), children: after.length ? [row, text({ id: `${pid}:c`, lines: after })] : [row] });
          }
          const [initial, rest] = splitInitial(b.text)!;
          const [leadText, tail] = leadOn ? splitLeadIn(rest) : ["", rest];
          const capSpec = faceSpec(plan.face, plan.size);
          const l = need(
            lines(
              {
                text: initial + leadText + tail,
                spec: bodySpec(kit),
                runs: [
                  { start: 0, end: initial.length, spec: capSpec },
                  ...(leadText ? [{ start: initial.length, end: initial.length + leadText.length, spec: leadSpec(kit) }] : []),
                  { start: initial.length + leadText.length, end: initial.length + leadText.length + tail.length, spec: bodySpec(kit) },
                ],
                width: measureW,
                hyphens: true,
                justify: (design.text?.align ?? "justify") === "justify",
              },
              bodyLh,
            ),
          );
          // Первая строка — с крупной буквой: высотой по ней (у react-pdf высота строки — по самому высокому куску).
          return l ? text({ id: pid, lines: l.map((h, n) => (n ? h : Math.max(h, plan.size * plan.lineHeight))), mb: S.body * paraAfter(design) }) : null;
        }
        const [leadText, after] = start && design.leadIn ? splitLeadIn(b.text) : ["", b.text];
        const l = need(
          lines(
            {
              text: leadText + after,
              spec: bodySpec(kit),
              ...(leadText ? { runs: [{ start: 0, end: leadText.length, spec: leadSpec(kit) }, { start: leadText.length, end: leadText.length + after.length, spec: bodySpec(kit) }] } : {}),
              width: measureW,
              indent: start && dropCapPlan(design, S) ? 0 : paraIndentPt(i),
              hyphens: true,
              justify: (design.text?.align ?? "justify") === "justify",
            },
            bodyLh,
          ),
        );
        return l ? text({ id: pid, lines: l, mb: S.body * paraAfter(design) }) : null;
      }
      case "lede": {
        const size = S.body * ANSWER.lede.size;
        const l = need(lines({ text: b.text, spec: italicSpec(kit, size), width: measureW, hyphens: false }, lh(size, ANSWER.lede.lineHeight)));
        return l ? text({ id: pid, lines: l, mb: S.body * ANSWER.lede.after }) : null;
      }
      case "quote": {
        // Неделимый блок, как Quote у PDF: строки курсивом (каждая строка цитаты — свой абзац), у «кавычки» — знак над ними.
        const size = S.body * ANSWER.quote.size;
        const kind = quoteStyle(design);
        const width = kind === "center" ? textW * (1 - 2 * ANSWER.quote.inset) : kind === "mark" ? measureW - S.body * ANSWER.quote.indent : textW - ANSWER.quote.rule - S.body * ANSWER.quote.indent;
        const l = need(lines({ text: b.lines.join("\n"), spec: italicSpec(kit, size), width, hyphens: false }, lh(size, ANSWER.quote.lineHeight)));
        if (!l) return null;
        const mark = kind === "mark" ? size * QUOTE_MARK.size * QUOTE_MARK.lineHeight + size * QUOTE_MARK.after : 0;
        return view({ id: pid, children: [], wrap: false, content: mark + l.reduce((a, v) => a + v, 0), mt: S.body * ANSWER.quote.before, mb: S.body * ANSWER.quote.after });
      }
      case "list": {
        const items: PNode[] = [];
        for (const [j, item] of b.items.entries()) {
          const l = need(lines({ text: item.text, spec: bodySpec(kit), width: measureW - S.body * listMarkerEm(b), hyphens: true }, bodyLh));
          if (!l) return null;
          items.push(
            view({
              id: `${pid}:${j}`,
              row: true,
              wrap: item.text.length > 260,
              mb: j < b.items.length - 1 ? S.body * ANSWER.list.gap : 0,
              children: [text({ lines: [bodyLh] }), text({ id: `${pid}:${j}:t`, lines: l })],
            }),
          );
        }
        return view({ id: pid, children: items, mb: S.body * ANSWER.list.after });
      }
      case "verse": {
        const width = measureW - (design.heading.align === "center" ? 0 : textW * ANSWER.verse.indent);
        const verse = (list: string[]) => lines({ text: list.join("\n"), spec: bodySpec(kit), width, hyphens: false }, bodyLh);
        if (b.stanzas?.length) {
          const starts = [0, ...b.stanzas, b.lines.length];
          const kids: PNode[] = [];
          for (let k = 0; k < starts.length - 1; k++) {
            const l = need(verse(b.lines.slice(starts[k], starts[k + 1])));
            if (!l) return null;
            kids.push(text({ id: `${pid}:s${k}`, lines: l, mt: k ? S.body * ANSWER.verse.stanza : 0 }));
          }
          return view({ id: pid, children: kids, mt: S.body * ANSWER.verse.before, mb: S.body * ANSWER.verse.after });
        }
        const l = need(verse(b.lines));
        return l ? text({ id: pid, lines: l, mt: S.body * ANSWER.verse.before, mb: S.body * ANSWER.verse.after }) : null;
      }
      case "strong": {
        const l = need(lines({ text: b.text, spec: { ...bodySpec(kit), weight: ANSWER.strong.weight }, width: measureW, hyphens: true }, bodyLh));
        return l ? text({ id: pid, lines: l, mt: S.body * ANSWER.strong.before, mb: S.body * ANSWER.strong.after }) : null;
      }
    }
  }

  /** Красная строка абзаца: у первого блока ответа — только «и у первого абзаца». */
  function paraIndentPt(i: number) {
    const em = design.text?.indent ?? 0;
    const on = i > 0 || design.text?.indentFirst === true;
    return on && em ? S.body * em : 0;
  }
}


/** Глава, разложенная как PDF: решения доводки, полосы, куски блоков и разрывы для отрисовки. */
export interface ChapterPagination {
  flow: FlowDecisions;
  /** Полос текста в главе (с полосами фото на всю страницу между кусками). */
  pages: number;
  /** Фото на всю страницу → его полоса (с 0). */
  photos: Record<string, number>;
  /** Куски блоков по полосам главы (полоса — с 0 от начала текста главы). */
  pieces: PagePiece[];
  /**
   * Разрывы перед полосами: пометка блока → номера строк, перед которыми новая полоса (0 — перед самим блоком). Их
   * ставит отрисовка (break-before: column), и браузер раскладывает главу там же, где react-pdf.
   */
  breaks: Map<string, number[]>;
}

/** Блоки доводки (как пометки FLOW_MARK у PDF): пометки внутри блоков (пункты списка, строфы) в доводку не идут. */
function flowBlocks(pieces: PagePiece[], chapter: string): FlowLayout["blocks"] {
  const blocks = new Map<string, FlowLayout["blocks"][number]>();
  for (const p of pieces) {
    const parts = p.id.split(":");
    const kind = parts[0] as FlowKind;
    if (!(FLOW_KINDS as readonly string[]).includes(kind)) continue;
    // b:<ответ>:<блок> и b:<ответ>:m<место>:<карточка>; пункты списка и строфы — b:<ответ>:<блок>:<n|sN>.
    if ((kind === "b" || kind === "k") && parts.length !== 3 && !parts[2]?.startsWith("m")) continue;
    const piece = { page: p.page, top: p.top, bottom: p.bottom, marginTop: p.marginTop, marginBottom: p.marginBottom };
    const b = blocks.get(p.id);
    if (b) b.last = piece;
    else blocks.set(p.id, { mark: p.id, kind, item: parts[1], chapter: kind === "t" ? parts[1] : chapter, first: piece, last: piece });
  }
  return [...blocks.values()];
}

/**
 * Разбивка главы на полосы и доводка вёрстки, как у PDF: проходы, пока доводке есть что решать (как renderInterior),
 * каждый — дерево главы (chapterTree) и полосы по правилам react-pdf (paginate). null — дерева нет.
 */
export function paginateChapter(input: Omit<TreeInput, "flow" | "tail"> & { hasText: boolean; rowHeights: ReadonlyMap<string, number>; minLead: number; pageHeight: number; passes?: number }): ChapterPagination | null {
  const flow = emptyFlow();
  const frame = { contentTop: 0, contentBottom: input.pageHeight };
  let result: ChapterPagination | null = null;
  for (let pass = 0; pass < (input.passes ?? 40); pass++) {
    const drops = new Map<string, number>();
    const runs = chapterTree({ ...input, flow, tail: input.hasText && !flow.noTail.has(input.chapterKey) }, drops);
    if (!runs) return null;
    const pieces: PagePiece[] = [];
    const photos: Record<string, number> = {};
    const breaks = new Map<string, number[]>();
    let page = 0;
    for (const r of runs) {
      const res = paginate(r.nodes, frame);
      const firstOn = new Set<number>();
      for (const p of res.pieces) {
        const piece = { ...p, page: p.page + page };
        pieces.push(piece);
        // Первый кусок полосы (кроме первой полосы куска) — перед ним разрыв.
        if (p.page > 0 && !firstOn.has(p.page)) {
          firstOn.add(p.page);
          breaks.set(p.id, [...(breaks.get(p.id) ?? []), p.from]);
        }
      }
      // Кусок без блоков (фото на всю страницу перед текстом) полосы текста не даёт, как у PDF.
      page += r.nodes.length ? Math.max(1, res.pages) : 0;
      if (r.photo) photos[r.photo] = page++;
    }
    result = { flow, pages: page, photos, pieces, breaks };
    // Как проход у PDF: место продолжения под буквицей — по строкам этого прохода, решения — по его раскладке.
    let moved = false;
    for (const [pid, real] of drops)
      if (flow.dropSplit.get(pid) !== real) {
        flow.dropSplit.set(pid, real);
        moved = true;
      }
    const decisions = nextDecisions({ pages: Array.from({ length: page }, () => frame), blocks: flowBlocks(pieces, input.chapterKey) }, flow, input.rowHeights, input.minLead);
    for (const d of decisions) applyDecision(flow, d);
    if (!decisions.length && !moved) break;
  }
  return result;
}
