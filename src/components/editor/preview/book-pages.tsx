"use client";

import type { CSSProperties, RefObject } from "react";
import type { Messages } from "@/i18n/messages";
import type { PreviewPagePhoto } from "@/lib/book/editor-model";
import { openerPhotoPlan } from "@/lib/book/photo-pages";
import type { PageKit } from "@/components/interior/kit";
import { OpenerPage, PhotoPage } from "@/components/interior/pages";
import { LazyPage } from "./LazyPage";
import type { OnPreviewTarget, PreviewTarget } from "./targets";

export const PAGE_SHADOW = "shadow-[0_1px_3px_rgba(0,0,0,.06),0_20px_40px_-20px_rgba(0,0,0,.25)]";

/** Чип поверх полосы превью: что здесь и что будет по нажатию (сама полоса — кнопка). */
function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`pointer-events-none absolute z-10 rounded-full bg-white/90 px-2 py-1 text-[11px] leading-none font-medium text-ink-soft shadow-sm ${className ?? ""}`}>{children}</span>;
}

/** Вся полоса — кнопка: начало главы, страница фото, альбом. Рамка фокуса — внутри листа (снаружи её срежет край). */
function Tap({ label, target, onTarget }: { label: string; target: PreviewTarget; onTarget: OnPreviewTarget }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onTarget(target);
      }}
      className="absolute inset-0 z-[5] cursor-pointer outline-offset-[-3px] transition hover:bg-wine/5 active:bg-wine/10"
    />
  );
}

/**
 * Начальная полоса главы в превью: фото главы с кадром и рамкой оформления — или, как в печати, полоса с названием.
 * В оформлении с фото главы без выбранного фото — пунктирное место ровно по рамке (только в редакторе: в PDF и
 * в 3D-книге его нет). У альбома (number null) места фото нет: его начальная полоса всегда с названием.
 */
export function PreviewOpener({
  kit,
  number,
  title,
  epigraph,
  photo,
  placeholder,
  style,
  tp,
  target,
  label,
  chip,
  onTarget,
}: {
  kit: PageKit;
  number: number | null;
  title: string;
  epigraph?: string;
  photo?: PreviewPagePhoto;
  /** Нарисовать пунктирное место фото главы (оформление с фото главы, фото не выбрано). */
  placeholder?: boolean;
  style: CSSProperties;
  tp?: Messages["editor"]["previewPhotos"];
  target: PreviewTarget;
  label: string;
  chip?: string;
  onTarget?: OnPreviewTarget;
}) {
  const plan = placeholder && tp && !photo ? openerPhotoPlan(kit.format, kit.design) : null;
  const box = plan ? (plan.card ?? plan.img) : null;
  const u = kit.u;
  return (
    <div className="relative" data-opener={target.chapterKey ?? "album"}>
      <OpenerPage kit={kit} number={number} title={title} epigraph={epigraph} photo={photo ? { url: photo.url, crop: photo.crop } : undefined} className={PAGE_SHADOW} style={style} />
      {plan && box ? (
        <div
          data-placeholder
          className="pointer-events-none absolute flex flex-col items-center justify-center gap-1 border-2 border-dashed border-wine/45 bg-white/55 p-2 text-center"
          style={{
            left: u.mm(Math.max(0, box.x)),
            top: u.mm(Math.max(0, box.y)),
            width: u.mm(Math.min(box.w + Math.min(0, box.x), kit.format.widthMm - Math.max(0, box.x))),
            height: u.mm(Math.min(box.h + Math.min(0, box.y), kit.format.heightMm - Math.max(0, box.y))),
            borderRadius: plan.mask === "circle" ? "50%" : plan.mask === "arch" ? `${u.mm(box.w / 2)} ${u.mm(box.w / 2)} 0 0` : 6,
          }}
        >
          <span className="text-sm font-medium text-wine">{tp?.placeholder}</span>
          <span className="max-w-48 text-[11px] leading-snug text-ink-soft">{tp?.placeholderSub}</span>
        </div>
      ) : null}
      {chip ? <Chip className="bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap">{chip}</Chip> : null}
      {onTarget ? <Tap label={label} target={target} onTarget={onTarget} /> : null}
    </div>
  );
}

/**
 * Страницы фото после главы или альбома — та же раскладка, что в PDF (PhotoPage по группам photoPages). Каждая
 * страница — кнопка (target); на первой — чип chip, на странице из снимков, вставших по правилу книги, — «само».
 */
export function PreviewPhotoPages({
  kit,
  pages,
  pageW,
  pageH,
  scroll,
  idPrefix,
  tp,
  target,
  label,
  chip,
  onTarget,
}: {
  kit: PageKit;
  pages: PreviewPagePhoto[][];
  pageW: number;
  pageH: number;
  scroll: RefObject<HTMLDivElement | null>;
  idPrefix: string;
  tp?: Messages["editor"]["previewPhotos"];
  /** Цель нажатия на страницу; photoId — снимок, если он на странице один. */
  target: (group: PreviewPagePhoto[]) => PreviewTarget;
  label: string;
  chip?: string;
  onTarget?: OnPreviewTarget;
}) {
  return (
    <>
      {pages.map((group, i) => (
        <LazyPage key={group.map((p) => p.id).join(",")} root={scroll} pageId={`${idPrefix}:photos:${i}`} className={`relative overflow-hidden bg-white ${PAGE_SHADOW}`} style={{ width: pageW, height: pageH }}>
          {() => (
            <>
              <PhotoPage kit={kit} photos={group} scene={i} style={{ width: pageW, height: pageH }} />
              {tp && group.every((p) => p.auto) ? <Chip className="top-2 left-2">{tp.autoChip}</Chip> : null}
              {chip && i === 0 ? <Chip className="bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap">{chip}</Chip> : null}
              {onTarget ? <Tap label={label} target={target(group)} onTarget={onTarget} /> : null}
            </>
          )}
        </LazyPage>
      ))}
    </>
  );
}
