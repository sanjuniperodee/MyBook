import { useEffect, useState } from "react";
import type { CoverTemplate } from "@/lib/book/covers";
import { coverPhotoUrl } from "@/lib/book/photo-cover";

const cache = new Map<string, Promise<string>>();

function load(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`cover photo ${r.status}`);
        return r.blob();
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          }),
      );
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

/** Снимок обложки на фото как data-URL — для 3D-книги, где стороны обложки рисуются картинками-SVG. */
export function useCoverImage(template: CoverTemplate, width = 1600): string | undefined {
  const url = template.photo ? coverPhotoUrl(template.photo.photo.key, width) : null;
  const [state, setState] = useState<{ url: string; href: string } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    load(url)
      .then((href) => alive && setState({ url, href }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);
  return url && state?.url === url ? state.href : undefined;
}
