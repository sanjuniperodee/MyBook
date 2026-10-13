/**
 * Браузерный вход стенда html-snapshot (собирается esbuild): рисует InteriorSpread или PagePreview
 * по window.__stand и ставит body[data-ready], когда шрифты, фото и раскладка устоялись.
 */
import { createRoot } from "react-dom/client";
import { PagePreview } from "@/components/editor/PagePreview";
import { InteriorSpread } from "@/components/interior/InteriorSpread";
import { I18nProvider } from "@/i18n/client";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import type { StandView } from "./html-data";

declare global {
  interface Window {
    __stand: StandView;
  }
}

/** Кадров подряд без изменений в разметке, после которых она считается устоявшейся. */
const STABLE_FRAMES = 3;

function Stand({ view }: { view: StandView }) {
  const format = getFormat(view.format);
  const design = getInteriorDesign(view.interior);
  if (view.kind === "preview") return <PagePreview {...view.preview} format={format} design={design} />;
  return <InteriorSpread design={design} format={format} sample={view.sample} kind={view.kind} />;
}

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** PagePreview меряет главы после загрузки фото и перерисовывается: ждём, пока разметка перестанет меняться. */
async function settle(root: HTMLElement) {
  let last = "";
  for (let stable = 0; stable < STABLE_FRAMES; ) {
    await frame();
    await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
    const html = root.innerHTML;
    stable = html === last ? stable + 1 : 0;
    last = html;
  }
}

async function main() {
  const view = window.__stand;
  const root = document.getElementById("stand")!;
  root.style.width = `${view.width}px`;
  // Все начертания — до первой раскладки: размеры текста сразу окончательные.
  await Promise.all([...document.fonts].map((f) => f.load()));
  createRoot(root).render(
    <I18nProvider locale={view.locale}>
      <Stand view={view} />
    </I18nProvider>,
  );
  await settle(root);
  document.body.dataset.ready = "1";
}

void main();
