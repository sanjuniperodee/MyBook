import type { PhotoRef } from "@/lib/book/covers/svg-kit";
import { getCoverTemplate, renderCoverSvg } from "@/lib/book/covers";
import { coverFrontGeometry, getFormat } from "@/lib/book/formats";
import { coverPhotoUrl } from "@/lib/book/photo-cover";
import { parseCoverDesign } from "@/lib/book/cover-design";
import { CoverFace } from "./CoverFace";
import { DesignedCover } from "./DesignedCover";

export { CoverText, Ornament } from "./CoverFace";

const samplePhotoHref = (key: string) => coverPhotoUrl(key, 1000);

export interface CoverPreviewProps {
  template: string;
  format?: string;
  title: string;
  subtitle?: string;
  names?: string;
  /** Фото клиента по местам шаблона (для обложек с фото); пустое место — пейзаж-заглушка. */
  photos?: (PhotoRef | undefined)[];
  className?: string;
  uid?: string;
  /** Без фактуры — быстрее для множества мелких превью. */
  lite?: boolean;
  /** Обложка в первом экране: фон грузится сразу и с высоким приоритетом. */
  priority?: boolean;
  /** Подсказки на языке страницы: пустое название и шаблон «с фото» без фото. */
  titlePlaceholder?: string;
  photoHint?: string;
  /** Обложка из конструктора (books.cover_design): есть — рисуется она, текст шаблона не нужен. */
  design?: unknown;
}

export function CoverPreview({ template: templateId, format: formatId = "a5", title, subtitle, names, photos, className, uid, lite, priority, titlePlaceholder = "…", photoHint, design: rawDesign }: CoverPreviewProps) {
  const design = rawDesign ? parseCoverDesign(rawDesign) : null;
  if (design)
    return (
      <DesignedCover
        template={templateId}
        format={formatId}
        design={design}
        texts={{ title: title || titlePlaceholder, subtitle: subtitle ?? "", names: names ?? "" }}
        photos={photos}
        uid={uid ?? `d${templateId}`}
        lite={lite}
        className={className}
      />
    );
  const template = getCoverTemplate(templateId);
  const format = getFormat(formatId);
  // Фон — кэшируемая картинка; встраивать SVG нужно только обложке с фото клиента (картинка-SVG не грузит чужие файлы).
  const hasPhoto = !!template.requiresPhoto && !!photos?.some(Boolean);
  // Пустые места (коллаж заполнен не до конца) — снимками-примерами: встроенный SVG загрузит их сам.
  const svg = hasPhoto ? renderCoverSvg(template, coverFrontGeometry(format), { uid: uid ?? `${template.id}${format.id}`, photos, sampleHref: samplePhotoHref }, { noTexture: lite }) : null;

  return <CoverFace template={template} format={format.id} title={title} subtitle={subtitle} names={names} svg={svg} className={className} lite={lite} priority={priority} titlePlaceholder={titlePlaceholder} photoHint={hasPhoto ? undefined : photoHint} />;
}
