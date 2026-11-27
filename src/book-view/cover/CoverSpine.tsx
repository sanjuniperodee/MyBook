import type { CoverTemplate } from "@/lib/book/covers";
import { cssFont } from "@/lib/book/fonts";
import { spineFontMm, spineParts } from "@/lib/book/book-model";

/**
 * Надписи на корешке — как в PDF обложки: название в верхней половине, имена в нижней, читаются сверху вниз.
 * Контейнер — грань корешка с container-type: inline-size; размеры — в cqw от ширины корешка.
 */
export function CoverSpineText({ template, title, names, widthMm, heightMm }: { template: CoverTemplate; title: string; names?: string; widthMm: number; heightMm: number }) {
  const size = spineFontMm(widthMm);
  const parts = spineParts(title, names);
  if (!size || !parts.length) return null;
  return (
    <div
      className="absolute top-1/2 left-1/2 flex whitespace-nowrap"
      style={{ width: `${(heightMm / widthMm) * 100}cqw`, height: "100cqw", transform: "translate(-50%, -50%) rotate(90deg)", fontFamily: cssFont(template.spine.font), fontWeight: 500, fontSize: `${(size / widthMm) * 100}cqw`, color: template.spine.color }}
    >
      {parts.map((text, i) => (
        <div key={i} className="flex min-w-0 flex-1 items-center justify-center">
          <span className="truncate" style={{ maxWidth: "92%" }}>
            {text}
          </span>
        </div>
      ))}
    </div>
  );
}
