import "server-only";
import { Page, View } from "@react-pdf/renderer";
import type { ContentChapter, ContentItem } from "@/lib/book/layout";
import { vignetteDrawing } from "@/lib/book/interior-art";
import { CHAPTER_TAIL, VIGNETTE_RULE } from "@/lib/book/typesetting";
import { PdfDrawing } from "@/modules/production/infrastructure/pdf/art";
import { Entry } from "./entry";
import { Folio } from "./folio";
import { ChapterHead, ChapterPageMark } from "./opener";
import { mark, pageMark, type PdfKit } from "./kit";
import { RunningHead } from "./running-head";

/** Концовка главы — небольшая виньетка: последняя полоса главы не выглядит оборванной. */
function ChapterTail({ kit, chapterKey }: { kit: PdfKit; chapterKey: string }) {
  return (
    <View {...mark(`t:${chapterKey}`)} wrap={false} style={{ alignItems: "center", marginTop: kit.sizes.beforeHeading * CHAPTER_TAIL.before }}>
      <PdfDrawing drawing={vignetteDrawing(kit.design.ornament, VIGNETTE_RULE.end, kit.design.palette)} />
    </View>
  );
}

/**
 * Текст главы: ответы подряд на полосах с колонтитулом и колонцифрой; react-pdf сам переносит их с полосы на полосу.
 * items — кусок главы между фото на всю страницу (chapterRuns); first — первый кусок (капитель), tail — последний с текстом.
 * from, to — только ответы [from, to) (черновой проход: часть куска между разрывами, ответ from начинает полосу);
 * begin — ответ from начинается с этого блока (он в верху полосы), end — документ кончается этим блоком ответа end.item.
 */
export function ChapterBody({
  kit,
  chapter,
  items = chapter.items,
  first = true,
  tail = true,
  from = 0,
  to = items.length,
  begin,
  end,
}: {
  kit: PdfKit;
  chapter: ContentChapter;
  items?: ContentItem[];
  first?: boolean;
  tail?: boolean;
  from?: number;
  to?: number;
  begin?: string;
  end?: { item: string; mark: string };
}) {
  const stop = end ? items.findIndex((it) => it.id === end.item) + 1 || to : to;
  return (
    <Page {...pageMark("text", chapter.key)} size={kit.pageSize} style={kit.pagePadding} wrap>
      <RunningHead kit={kit} chapterTitle={chapter.title} />
      <Folio kit={kit} />
      {/* Глава без начальной полосы (inline): номер и название — над её текстом; чистый лист (none) — без них. */}
      {first && from === 0 && !begin && kit.content.chapterStart === "inline" ? <ChapterHead kit={kit} chapterKey={chapter.key} number={chapter.number} title={chapter.title} epigraph={chapter.epigraph} /> : null}
      {first && from === 0 && !begin && kit.content.chapterStart === "none" ? <ChapterPageMark kit={kit} chapterKey={chapter.key} /> : null}
      {items.slice(from, Math.min(to, stop)).map((item, i) => (
        <Entry
          key={item.id}
          kit={kit}
          item={item}
          index={from + i}
          leadIn={first && from + i === 0}
          pageStart={i === 0 && from > 0}
          begin={i === 0 ? begin : undefined}
          end={end?.item === item.id ? end.mark : undefined}
        />
      ))}
      {!tail || to < items.length || end || kit.flow.noTail.has(chapter.key) ? null : <ChapterTail kit={kit} chapterKey={chapter.key} />}
    </Page>
  );
}
