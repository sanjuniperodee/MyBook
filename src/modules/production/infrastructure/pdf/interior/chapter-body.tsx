import "server-only";
import { Page, View } from "@react-pdf/renderer";
import type { ContentChapter } from "@/lib/book/layout";
import { vignetteDrawing } from "@/lib/book/interior-art";
import { CHAPTER_TAIL, VIGNETTE_RULE } from "@/lib/book/typesetting";
import { PdfDrawing } from "@/modules/production/infrastructure/pdf/art";
import { Entry } from "./entry";
import { Folio } from "./folio";
import { mark, type PdfKit } from "./kit";
import { Watermark } from "./parts";
import { RunningHead } from "./running-head";

/** Концовка главы — небольшая виньетка: последняя полоса главы не выглядит оборванной. */
function ChapterTail({ kit, chapterKey }: { kit: PdfKit; chapterKey: string }) {
  return (
    <View {...mark(`t:${chapterKey}`)} wrap={false} style={{ alignItems: "center", marginTop: kit.sizes.beforeHeading * CHAPTER_TAIL.before }}>
      <PdfDrawing drawing={vignetteDrawing(kit.design.ornament, VIGNETTE_RULE.end, kit.design.palette)} />
    </View>
  );
}

/** Текст главы: ответы подряд на полосах с колонтитулом и колонцифрой; react-pdf сам переносит их с полосы на полосу. */
export function ChapterBody({ kit, chapter }: { kit: PdfKit; chapter: ContentChapter }) {
  return (
    <Page size={kit.pageSize} style={kit.pagePadding} wrap>
      <Watermark kit={kit} />
      <RunningHead kit={kit} chapterTitle={chapter.title} />
      <Folio kit={kit} />
      {chapter.items.map((item, index) => (
        <Entry key={item.id} kit={kit} item={item} index={index} />
      ))}
      {kit.flow.noTail.has(chapter.key) ? null : <ChapterTail kit={kit} chapterKey={chapter.key} />}
    </Page>
  );
}
