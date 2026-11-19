import type { Messages } from "..";
import { design_ai } from "./design-ai";
import { design_cover } from "./design-cover";
import { design_layouts } from "./design-layouts";
import { design_pages } from "./design-pages";
import { design_ui } from "./design-ui";

/** Kitob dizayneri: sahifalar bezagi, qatlamlardan iborat muqova konstruktori va tayyor muqova maketlari. */
export const design: Messages["design"] = {
  readiness: {
    coverLayers: (n: number) => (n === 1 ? "Muqovada suratsiz bitta surat o‘rni bor." : `Muqovada suratsiz ${n} ta surat o‘rni bor.`),
  },
  cover: design_cover,
  layouts: design_layouts,
  pages: design_pages,
  ui: design_ui,
  ai: design_ai,
};
