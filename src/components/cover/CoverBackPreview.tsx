import { designBack, type BackContent } from "@/lib/book/cover-back";
import { getCoverTemplate } from "@/lib/book/covers";
import type { PhotoRef } from "@/lib/book/cover-kit";
import { coverSpreadGeometry, getFormat } from "@/lib/book/formats";
import { coverArtUrl } from "@/lib/urls";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";
import { CoverBackLayer } from "./CoverBack";

/** Толщина не влияет на заднюю крышку — берём типичную, как у фона из /api/covers/…-back.svg. */
const PREVIEW_PAGES = 120;

/** Задняя сторона обложки: фон — тот же кусок развёртки, что в печати, текст и фото — раскладка из cover-back. */
/** Раскладка оборота для превью: нужна и самому превью, и редактору (места под фото для кадрирования). */
export function backPreviewLayout(templateId: string, formatId: string, content: BackContent) {
  const template = getCoverTemplate(templateId);
  const back = coverSpreadGeometry(getFormat(formatId), PREVIEW_PAGES).back!;
  return { template, back, design: designBack(template, back.w, back.h, content) };
}

export function CoverBackPreview({ template: templateId, format: formatId = "a5", content, photos, className }: { template: string; format?: string; content: BackContent; photos?: (PhotoRef | undefined)[]; className?: string }) {
  const format = getFormat(formatId);
  const { template, back, design } = backPreviewLayout(templateId, formatId, content);
  return (
    <div className={cn("relative overflow-hidden select-none", className)} style={{ aspectRatio: `${back.w} / ${back.h}`, containerType: "inline-size", background: template.swatch }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG-фон кэширует браузер */}
      <img src={coverArtUrl(template, format.id, false, design.plainArt ? "backPlain" : "back")} alt="" aria-hidden draggable={false} decoding="async" className="absolute inset-0 h-full w-full" />
      <CoverBackLayer design={design} widthMm={back.w} heightMm={back.h} photos={photos} brand={site.name} />
    </div>
  );
}
