import { designBack, layeredBack, type BackContent } from "@/lib/book/cover-back";
import { getCoverTemplate } from "@/lib/book/covers";
import type { PhotoRef } from "@/lib/book/covers/svg-kit";
import { backFaceSvg, boardSize, templateForCover, type CoverBack, type CoverDesign, type CoverTexts } from "@/lib/book/cover-design";
import { coverSpreadGeometry, getFormat } from "@/lib/book/formats";
import { coverPhotoUrl } from "@/lib/book/photo-cover";
import { coverArtUrl, photoUrl } from "@/lib/urls";
import { site } from "@/config/site";
import { cn } from "@/lib/class-names";
import { CoverBackLayer } from "./CoverBack";
import { CoverLayers } from "./CoverLayers";

/** Толщина не влияет на заднюю крышку — берём типичную, как у фона из /api/covers/…-back.svg. */
export const PREVIEW_PAGES = 120;

/**
 * Раскладка оборота для превью: нужна и самому превью, и редактору (места под фото для кадрирования). Цвета надписей —
 * по фону, который на обороте на самом деле (свой фон лица или оборота), как в PDF (templateForCover).
 */
export function backPreviewLayout(templateId: string, formatId: string, content: BackContent, front: CoverDesign | null = null, back: CoverBack | null = null) {
  const template = templateForCover(getCoverTemplate(templateId), front, back);
  const g = coverSpreadGeometry(getFormat(formatId), PREVIEW_PAGES);
  const rect = g.back!;
  return { template, g, back: rect, design: back?.layers ? layeredBack(template, rect.h) : designBack(template, rect.w, rect.h, content) };
}

/**
 * Задняя сторона обложки: фон — тот же кусок развёртки, что в печати (рисунок оборота шаблона или свой фон лица и
 * оборота — те же SVG-фрагменты, что у PDF), сверху слои оборота из конструктора или вариант оборота и марка.
 */
export function CoverBackPreview({
  template: templateId,
  format: formatId = "a5",
  content,
  photos,
  design = null,
  back = null,
  texts,
  uid = "bp",
  lite,
  className,
}: {
  template: string;
  format?: string;
  content: BackContent;
  photos?: (PhotoRef | undefined)[];
  /** Обложка из конструктора: её свой фон продолжается на обороте. */
  design?: CoverDesign | null;
  /** Оборот: свой фон и слои. */
  back?: CoverBack | null;
  /** Надписи книги для привязанных слоёв оборота. */
  texts?: CoverTexts;
  uid?: string;
  lite?: boolean;
  className?: string;
}) {
  const format = getFormat(formatId);
  const layout = backPreviewLayout(templateId, formatId, content, design, back);
  const { template, g } = layout;
  const rect = layout.back;
  const own = backFaceSvg(design, back, g, rect, uid);
  return (
    <div className={cn("relative overflow-hidden select-none", className)} style={{ aspectRatio: `${rect.w} / ${rect.h}`, containerType: "inline-size", background: template.swatch }}>
      {own ? (
        <div aria-hidden className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: own }} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- SVG-фон кэширует браузер
        <img src={coverArtUrl(template, format.id, false, layout.design.plainArt ? "backPlain" : "back")} alt="" aria-hidden draggable={false} decoding="async" className="absolute inset-0 h-full w-full" />
      )}
      {back?.layers ? (
        <CoverLayers
          design={{ layers: back.layers }}
          texts={texts ?? { title: "", subtitle: "", names: content.names }}
          board={boardSize(format)}
          photoSrc={(id) => photoUrl(id, lite ? "thumb" : "view")}
          stockSrc={(key) => coverPhotoUrl(key, lite ? 900 : 1600)}
          uid={`${uid}l`}
        />
      ) : null}
      <CoverBackLayer design={layout.design} widthMm={rect.w} heightMm={rect.h} photos={photos} brand={site.name} />
    </div>
  );
}
