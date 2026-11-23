import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { paginate, type PNode } from "@/lib/book/paginate";
import { ensureFonts, face, renderPdf } from "@/modules/production/infrastructure/pdf/fonts";
import { FLOW_MARK, readLayout } from "@/modules/production/infrastructure/pdf/flow";

// Разбивка на полосы превью (lib/book/paginate.ts) — та же, что у react-pdf: на случайных главах из текста, неделимых
// блоков, «держать со следующим» и вложенных блоков куски встают на те же полосы и места, что в PDF.

const PAGE = { width: 300, height: 400, top: 40, bottom: 50 };
const LINE = 15; // кегль 10, интерлиньяж 1,5

type Spec =
  | { t: "text"; id: string; lines: number; mt: number; mb: number; mpa?: number }
  | { t: "box"; id: string; h: number; mt: number; mb: number; wrap: boolean; mpa?: number }
  | { t: "view"; id: string; mt: number; brk: boolean; children: Spec[] };

const mark = (id: string) => ({ [FLOW_MARK]: id }) as object;

function toPdf(s: Spec): ReactNode {
  if (s.t === "text")
    return (
      <Text key={s.id} {...mark(`b:${s.id}`)} minPresenceAhead={s.mpa ?? 0} orphans={2} widows={2} style={{ ...face("ptserif"), fontSize: 10, lineHeight: 1.5, marginTop: s.mt, marginBottom: s.mb }}>
        {Array.from({ length: s.lines }, (_, i) => `строка ${i + 1}`).join("\n")}
      </Text>
    );
  if (s.t === "box") return <View key={s.id} {...mark(`r:${s.id}`)} wrap={s.wrap} minPresenceAhead={s.mpa ?? 0} style={{ height: s.h, marginTop: s.mt, marginBottom: s.mb, backgroundColor: "#ccc" }} />;
  return (
    <View key={s.id} break={s.brk} style={{ marginTop: s.mt }}>
      {s.children.map(toPdf)}
    </View>
  );
}

function toNode(s: Spec): PNode {
  if (s.t === "text") return { kind: "text", id: `b:${s.id}`, lines: Array(s.lines).fill(LINE), orphans: 2, widows: 2, mt: s.mt, mb: s.mb, pt: 0, pb: 0, wrap: true, brk: false, minPresenceAhead: s.mpa ?? 0 };
  if (s.t === "box") return { kind: "view", id: `r:${s.id}`, children: [], content: s.h, mt: s.mt, mb: s.mb, pt: 0, pb: 0, wrap: s.wrap, brk: false, minPresenceAhead: s.mpa ?? 0 };
  return { kind: "view", children: s.children.map(toNode), mt: s.mt, mb: 0, pt: 0, pb: 0, wrap: true, brk: s.brk, minPresenceAhead: 0 };
}

/** Случайная глава: истории (вложенные блоки с разрывом или без) из текста и неделимых блоков. */
function chapter(seed: number): Spec[] {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const n = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  return Array.from({ length: n(3, 7) }, (_, e) => ({
    t: "view" as const,
    id: `e${e}`,
    mt: e ? n(0, 20) : 0,
    brk: e > 0 && rnd() < 0.15,
    children: Array.from({ length: n(1, 5) }, (_, k): Spec =>
      k === 0 && rnd() < 0.6
        ? { t: "text", id: `h${e}`, lines: n(1, 2), mt: 0, mb: 8, mpa: 40 }
        : rnd() < 0.25
          ? { t: "box", id: `x${e}-${k}`, h: n(40, 280), mt: n(0, 8), mb: n(0, 12), wrap: rnd() < 0.2, mpa: rnd() < 0.2 ? 40 : 0 }
          : { t: "text", id: `p${e}-${k}`, lines: n(1, 30), mt: n(0, 3), mb: n(0, 6) },
    ),
  }));
}

async function pdfPieces(specs: Spec[]) {
  ensureFonts();
  let layout: unknown;
  await renderPdf(
    <Document onRender={(r) => (layout = (r as { _INTERNAL__LAYOUT__DATA_?: unknown })._INTERNAL__LAYOUT__DATA_)}>
      <Page size={{ width: PAGE.width, height: PAGE.height }} style={{ paddingTop: PAGE.top, paddingBottom: PAGE.bottom, paddingHorizontal: 20 }} wrap>
        {specs.map(toPdf)}
      </Page>
    </Document>,
    "ru",
  );
  return readLayout(layout, new Map()).blocks.map((b) => [b.mark, b.first.page, Math.round(b.first.top), Math.round(b.first.bottom)]);
}

describe("полосы — как у react-pdf", () => {
  it.each(Array.from({ length: 150 }, (_, i) => i + 1))("глава %i", async (seed) => {
    const specs = chapter(seed);
    const pdf = await pdfPieces(specs);
    const { pieces } = paginate(specs.map(toNode), { contentTop: PAGE.top, contentBottom: PAGE.height - PAGE.bottom });
    // Первый кусок каждого блока: полоса, верх и низ.
    const first = new Map<string, number[]>();
    for (const p of pieces) if (!first.has(p.id)) first.set(p.id, [p.page, Math.round(p.top), Math.round(p.bottom)]);
    expect(pdf.map(([id]) => [id, ...(first.get(id as string) ?? [])])).toEqual(pdf);
  });
});
