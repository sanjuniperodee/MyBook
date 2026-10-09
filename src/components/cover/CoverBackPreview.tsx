import { designBack, type BackContent } from "@/lib/book/cover-back";
import { getCoverTemplate } from "@/lib/book/covers";
import { coverSpreadGeometry, getFormat } from "@/lib/book/formats";
import { coverArtUrl } from "@/lib/urls";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";
import { CoverBackLayer } from "./CoverBack";

/** Толщина не влияет на заднюю крышку — берём типичную, как у фона из /api/covers/…-back.svg. */
const PREVIEW_PAGES = 120;

/** Задняя сторона обложки: фон — тот же кусок развёртки, что в печати, текст и фото — раскладка из cover-back. */
export function CoverBackPreview({ template: templateId, format: formatId = "a5", content, photoUrl, className }: { template: string; format?: string; content: BackContent; photoUrl?: string; className?: string }) {
  const template = getCoverTemplate(templateId);
  const format = getFormat(formatId);
  const back = coverSpreadGeometry(format, PREVIEW_PAGES).back!;
  const design = designBack(template, back.w, back.h, content);
  return (
    <div className={cn("relative overflow-hidden select-none", className)} style={{ aspectRatio: `${back.w} / ${back.h}`, containerType: "inline-size", background: template.swatch }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG-фон кэширует браузер */}
      <img src={coverArtUrl(template, format.id, false, "back")} alt="" aria-hidden draggable={false} decoding="async" className="absolute inset-0 h-full w-full" />
      <CoverBackLayer design={design} widthMm={back.w} heightMm={back.h} photoUrl={photoUrl} brand={site.name} />
    </div>
  );
}
