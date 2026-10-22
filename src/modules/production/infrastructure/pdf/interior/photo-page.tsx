import "server-only";
/* eslint-disable jsx-a11y/alt-text -- react-pdf Image не поддерживает alt */
import { Image, Page, Text } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { mm } from "@/lib/book/formats";
import type { PhotoItem } from "@/lib/book/layout";
import { PAPER } from "@/lib/book/interiors";
import { photoArea, photoPagePlan } from "@/lib/book/photo-pages";
import { photoCaptionFace } from "@/lib/book/typesetting";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { PdfPageLayer } from "@/modules/production/infrastructure/pdf/art";
import { labelStyle, noHyphens, type PdfKit } from "./kit";
import { Watermark } from "./parts";

/** Подпись под снимком: ручная, служебная или курсив — по дизайну (photoCaptionFace). */
function captionStyle(kit: PdfKit, size: number): Style {
  const caption = photoCaptionFace(kit.design);
  return caption.label
    ? { ...labelStyle(kit, caption.color, size), lineHeight: caption.lineHeight }
    : { ...face(caption.face.font, caption.face.weight, caption.face.italic), fontSize: size, lineHeight: caption.lineHeight, color: caption.color };
}

/** Фотостраница: места, рамки и подписи — из photo-pages (та же раскладка у превью и у подготовки снимков). */
export function PhotoPage({ kit, group }: { kit: PdfKit; group: PhotoItem[] }) {
  const { design, format, bleed: B, box, sizes: S, options, pageSize } = kit;
  if (group.length === 1 && group[0].layout === "bleed") {
    const img = options.images.get(group[0].id);
    // fixed — снимок во весь лист не участвует в разбиении на страницы. Иначе react-pdf сравнивает его высоту
    // (yoga считает во float32) с высотой полосы (double): в квадрате 583,937… pt округляется вверх, снимок «выше
    // полосы», и всё после него — водяной знак превью — уходит на следующую полосу, которую react-pdf отбрасывает.
    // «Целиком, без обрезки»: снимок вписан в лист по центру, по другой стороне — поля бумаги.
    const contain = group[0].inline?.pageFit === "contain" && img;
    const k = contain ? Math.min(pageSize.width / img.width, pageSize.height / img.height) : 1;
    const box = contain
      ? { width: img.width * k, height: img.height * k, left: (pageSize.width - img.width * k) / 2, top: (pageSize.height - img.height * k) / 2 }
      : { width: pageSize.width, height: pageSize.height, left: 0, top: 0 };
    return (
      <Page size={pageSize} style={{ backgroundColor: PAPER }}>
        {img ? <Image fixed src={{ data: img.data, format: "jpg" }} style={{ position: "absolute", ...box }} /> : null}
        <Watermark kit={kit} />
      </Page>
    );
  }
  const plan = photoPagePlan(group, photoArea(format), design, S);
  return (
    <Page size={pageSize} style={{ backgroundColor: design.photos.paper ?? PAPER }}>
      <PdfPageLayer shapes={plan.under} box={box} />
      {plan.cells.map((c) => {
        const img = options.images.get(c.id);
        return img ? <Image key={c.id} src={{ data: img.data, format: "jpg" }} style={{ position: "absolute", left: mm(B + c.img.x), top: mm(B + c.img.y), width: mm(c.img.w), height: mm(c.img.h) }} /> : null;
      })}
      <PdfPageLayer shapes={plan.over} box={box} />
      {plan.cells.map((c) =>
        c.caption ? (
          <Text
            key={`cap-${c.id}`}
            hyphenationCallback={noHyphens}
            style={{ ...captionStyle(kit, c.caption.size), position: "absolute", left: mm(B + c.caption.box.x), top: mm(B + c.caption.box.y), width: mm(c.caption.box.w), textAlign: "center", maxLines: c.caption.inside ? 1 : 3, textOverflow: "ellipsis" }}
          >
            {c.caption.text}
          </Text>
        ) : null,
      )}
      <Watermark kit={kit} />
    </Page>
  );
}
