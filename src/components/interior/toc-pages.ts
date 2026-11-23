/**
 * Сколько полос займёт оглавление — как у PDF (pdf/interior/toc.tsx): заголовок и строки неделимыми рядами, разбивка
 * на полосы по правилам react-pdf (lib/book/paginate.ts), строки названий — Кнут — Пласс по шрифтам книги. От него —
 * номера полос превью. Нет строк (шрифт грузится) — null, тогда номера по оценке.
 */
import { bookMessagesFor } from "@/i18n/messages/partial";
import { textArea } from "@/lib/book/page-geometry";
import { MM_TO_PT } from "@/lib/book/formats";
import { paginate, type PNode } from "@/lib/book/paginate";
import type { TocLine } from "@/lib/book/toc";
import { faceLineHeight, TOC } from "@/lib/book/typesetting";
import { metricsOf, type PageKit } from "./kit";
import { faceSpec, textWidthPt } from "./text-specs";

export function tocPageCount(kit: PageKit, lines: readonly TocLine[], numbered: boolean): number | null {
  const breaker = kit.breaker;
  if (!breaker?.width) return null;
  const { design, sizes: S } = kit;
  const scale = metricsOf(kit).scale;
  const textW = textWidthPt(kit);
  const titleSpec = faceSpec(design.display, S.tocTitle);
  const title = breaker({ text: bookMessagesFor(kit.language).toc, spec: titleSpec, width: textW, hyphens: false, justify: false });
  if (!title) return null;
  const body = { font: design.type.body, weight: 400, size: S.body };
  const bodyLh = S.body * faceLineHeight(body);
  // Номер страницы справа (в первом проходе PDF — «00», затем настоящий): место под три цифры.
  const numberW = breaker.width(body, "000");
  if (numberW === null) return null;
  const nodes: PNode[] = [
    { kind: "text", lines: title.map(() => S.tocTitle * faceLineHeight(design.display)), mt: TOC.title.before * scale, mb: TOC.title.after * scale, pt: 0, pb: 0, wrap: true, brk: false, minPresenceAhead: 0, orphans: 2, widows: 2 },
  ];
  for (const line of lines) {
    const indent = line.level ? TOC.entry.indent * scale : 0;
    const row = textW - indent;
    const label = `${line.number && numbered ? `${line.number}. ` : ""}${line.label}`;
    const width = Math.min(row * 0.82, row - numberW - TOC.leader.side * 2);
    const l = breaker({ text: label, spec: body, width, hyphens: false, justify: false });
    if (!l) return null;
    nodes.push({ kind: "view", children: [], wrap: false, content: Math.max(1, l.length) * bodyLh, mt: 0, mb: TOC.entry.after * scale, pt: 0, pb: 0, brk: false, minPresenceAhead: 0 });
  }
  return paginate(nodes, { contentTop: 0, contentBottom: textArea(kit.format).h * MM_TO_PT }).pages;
}
