import "server-only";
import { Page, View } from "@react-pdf/renderer";
import type { ContentChapter, ContentItem } from "@/lib/book/layout";
import { vignetteDrawing } from "@/lib/book/interior-art";
import { CHAPTER_TAIL, VIGNETTE_RULE } from "@/lib/book/typesetting";
import { PdfDrawing } from "@/modules/production/infrastructure/pdf/art";
import { Entry } from "./entry";
import { Folio } from "./folio";
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
 */
export function ChapterBody({ kit, chapter, items = chapter.items, first = true, tail = true }: { kit: PdfKit; chapter: ContentChapter; items?: ContentItem[]; first?: boolean; tail?: boolean }) {
  return (
    <Page {...pageMark("text", chapter.key)} size={kit.pageSize} style={kit.pagePadding} wrap>
      <RunningHead kit={kit} chapterTitle={chapter.title} />
      <Folio kit={kit} />
      {items.map((item, index) => (
        <Entry key={item.id} kit={kit} item={item} index={index} leadIn={first && index === 0} />
      ))}
      {!tail || kit.flow.noTail.has(chapter.key) ? null : <ChapterTail kit={kit} chapterKey={chapter.key} />}
    </Page>
  );
}
