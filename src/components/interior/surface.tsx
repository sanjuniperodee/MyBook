import type { CSSProperties, ReactNode } from "react";
import { PAPER } from "@/lib/book/interiors";
import type { Shape } from "@/lib/book/interior-art";
import { pageSide, textArea } from "@/lib/book/page-geometry";
import { samplePageUrl } from "@/lib/book/photo-cover";
import { cn } from "@/lib/class-names";
import { PageLayer } from "./graphics";
import { metricsOf, type PageKit } from "./kit";

export type PageProps = { kit: PageKit; className?: string; style?: CSSProperties };

/** Страница: фон, графика и полоса набора. Размер задаёт родитель (width/aspect-ratio). */
export function PageSurface({ kit, paper = kit.design.paper ?? PAPER, shapes = [], className, style, children }: PageProps & { paper?: string; shapes?: Shape[]; children: ReactNode }) {
  return (
    <div lang={kit.language} className={cn("relative overflow-hidden", className)} style={{ background: paper, containerType: "inline-size", ...style }}>
      <PageLayer shapes={shapes} format={kit.format} />
      {children}
    </div>
  );
}

/** Полоса набора (внутри полей). */
export function TextArea({ kit, children, className, style }: { kit: PageKit; children: ReactNode; className?: string; style?: CSSProperties }) {
  const m = metricsOf(kit);
  const area = textArea(kit.format);
  const { u } = kit;
  return (
    <div className={cn("absolute", className)} style={{ left: u.mm(pageSide(kit.format)), top: u.mm(m.marginTop), width: u.mm(area.w), height: u.mm(area.h), ...style }}>
      {children}
    </div>
  );
}

/** Блок на парадной полосе: начинается на доле top высоты полосы набора, как в PDF. */
export function Placed({ top, align = "center", children }: { top: number; align?: "center" | "left"; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ alignItems: align === "left" ? "flex-start" : "center", textAlign: align === "left" ? "left" : "center" }}>
      <div className="shrink-0" style={{ height: `${top * 100}%` }} />
      {children}
    </div>
  );
}

/** Снимок на странице (мм обрезного формата): фото клиента или снимок-пример из коллекции. */
export function PageImage({ kit, rect, url, scene, mask, focus, contain }: { kit: PageKit; rect: { x: number; y: number; w: number; h: number }; url?: string; scene: number; mask?: "arch" | "circle"; /** Кадр: точка (доли) и приближение — как в PDF (photo-crop.ts); нет — центр. */ focus?: { x: number; y: number; zoom?: number }; /** Целиком, без обрезки (вписать в место). */ contain?: boolean }) {
  const { u } = kit;
  // Форма снимка: арка — скруглённый верх радиусом в половину ширины, круг — 50%.
  const radius = mask === "circle" ? "50%" : mask === "arch" ? `${u.mm(rect.w / 2)} ${u.mm(rect.w / 2)} 0 0` : undefined;
  if (focus?.zoom && focus.zoom > 1 && !contain) {
    const origin = `${focus.x * 100}% ${focus.y * 100}%`;
    return (
      <div className="absolute overflow-hidden" style={{ left: u.mm(rect.x), top: u.mm(rect.y), width: u.mm(rect.w), height: u.mm(rect.h), borderRadius: radius }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента: next/image здесь не нужен */}
        <img src={url ?? samplePageUrl(scene)} alt="" draggable={false} className="block size-full object-cover" style={{ maxWidth: "none", objectPosition: origin, transform: `scale(${focus.zoom})`, transformOrigin: origin }} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- фото клиента и снимки-примеры: next/image здесь не нужен
    <img
      src={url ?? samplePageUrl(scene)}
      alt=""
      draggable={false}
      className={contain ? "absolute block object-contain" : "absolute block object-cover"}
      // max-width: none — снимок под обрез шире страницы, а базовые стили ограничивают картинки шириной родителя.
      style={{ left: u.mm(rect.x), top: u.mm(rect.y), width: u.mm(rect.w), height: u.mm(rect.h), maxWidth: "none", borderRadius: radius, objectPosition: focus ? `${focus.x * 100}% ${focus.y * 100}%` : undefined }}
    />
  );
}
