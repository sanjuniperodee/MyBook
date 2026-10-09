import { getCoverTemplate, renderCoverSvg, type CoverTemplate, type CoverTextStyle } from "@/lib/book/covers";
import { coverFrontGeometry, getFormat } from "@/lib/book/formats";
import { cssFont } from "@/lib/book/fonts";
import { coverArtUrl } from "@/lib/urls";
import { cn } from "@/lib/utils";

export interface CoverPreviewProps {
  template: string;
  format?: string;
  title: string;
  subtitle?: string;
  names?: string;
  photoUrl?: string;
  className?: string;
  uid?: string;
  /** Без фактуры — быстрее для множества мелких превью. */
  lite?: boolean;
  /** Обложка в первом экране: фон грузится сразу и с высоким приоритетом. */
  priority?: boolean;
  /** Подсказки на языке страницы: пустое название и шаблон «с фото» без фото. */
  titlePlaceholder?: string;
  photoHint?: string;
}

function textCss(s: CoverTextStyle): React.CSSProperties {
  return {
    fontFamily: cssFont(s.font),
    fontSize: `${s.size * 100}cqw`,
    color: s.color,
    fontWeight: s.weight ?? 400,
    fontStyle: s.italic ? "italic" : "normal",
    textTransform: s.upper ? "uppercase" : "none",
    letterSpacing: s.tracking ? `${s.tracking}em` : undefined,
    lineHeight: s.lineHeight ?? 1.2,
    textAlign: "center",
    overflowWrap: "anywhere",
  };
}

export function Ornament({ kind, color, size = "3.5cqw" }: NonNullable<CoverTemplate["ornament"]> & { size?: string }) {
  if (kind === "line") return <span style={{ display: "block", width: `calc(${size} * 4)`, height: 1, background: color }} />;
  if (kind === "dots")
    return (
      <span style={{ display: "flex", gap: "0.8cqw" }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: "1cqw", height: "1cqw", borderRadius: 99, background: color }} />
        ))}
      </span>
    );
  const d =
    kind === "heart"
      ? "M0.5,0.92 C0.2,0.72 0,0.52 0,0.3 C0,0.12 0.14,0 0.3,0 C0.4,0 0.47,0.06 0.5,0.15 C0.53,0.06 0.6,0 0.7,0 C0.86,0 1,0.12 1,0.3 C1,0.52 0.8,0.72 0.5,0.92Z"
      : "M0.5,0 L0.58,0.42 L1,0.5 L0.58,0.58 L0.5,1 L0.42,0.58 L0,0.5 L0.42,0.42Z";
  return (
    <svg viewBox="0 0 1 1" style={{ width: size, height: size }} aria-hidden>
      <path d={d} fill={color} />
    </svg>
  );
}

/** Текст лицевой стороны: заголовок, подзаголовок, орнамент и имена. Размеры — в cqw от ширины лицевой стороны. */
export function CoverText({ template, title, subtitle, names, titlePlaceholder = "…" }: { template: CoverTemplate; title: string; subtitle?: string; names?: string; titlePlaceholder?: string }) {
  const ta = template.textArea;
  const justify = template.justify === "center" ? "center" : template.justify === "start" ? "flex-start" : "flex-end";
  return (
    <div
      className="absolute flex flex-col items-center"
      style={{ left: `${ta.x * 100}%`, top: `${ta.y * 100}%`, width: `${ta.w * 100}%`, height: `${ta.h * 100}%`, justifyContent: justify }}
    >
      <div style={textCss(template.title)}>{title || titlePlaceholder}</div>
      {subtitle ? <div style={{ ...textCss(template.subtitle), marginTop: "1.5cqw" }}>{subtitle}</div> : null}
      {template.ornament && names ? (
        <div style={{ margin: "3cqw 0", display: "flex", justifyContent: "center" }}>
          <Ornament {...template.ornament} />
        </div>
      ) : (
        <div style={{ height: "3.5cqw" }} />
      )}
      {names ? <div style={textCss(template.names)}>{names}</div> : null}
    </div>
  );
}

export function CoverPreview({ template: templateId, format: formatId = "a5", title, subtitle, names, photoUrl, className, uid, lite, priority, titlePlaceholder = "…", photoHint }: CoverPreviewProps) {
  const template = getCoverTemplate(templateId);
  const format = getFormat(formatId);
  // Фон — кэшируемая картинка; встраивать SVG нужно только обложке с фото клиента (картинка-SVG не грузит чужие файлы).
  const inline = template.requiresPhoto && !!photoUrl;
  const svg = inline ? renderCoverSvg(template, coverFrontGeometry(format), { uid: uid ?? `${template.id}${format.id}`, photoHref: photoUrl }, { noTexture: lite }) : null;

  return (
    <div
      className={cn("relative overflow-hidden select-none", className)}
      style={{ aspectRatio: `${format.widthMm} / ${format.heightMm}`, containerType: "inline-size", background: template.swatch }}
    >
      {svg ? (
        <div className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- SVG-фон: next/image его не оптимизирует, а кэширует браузер
        <img
          src={coverArtUrl(template, format.id, lite)}
          alt=""
          aria-hidden
          draggable={false}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          className="absolute inset-0 h-full w-full"
        />
      )}
      {template.requiresPhoto && !photoUrl && photoHint ? (
        <div className="absolute inset-x-0 top-[28%] text-center text-[4cqw] text-white/80">{photoHint}</div>
      ) : null}
      <CoverText template={template} title={title} subtitle={subtitle} names={names} titlePlaceholder={titlePlaceholder} />
    </div>
  );
}
