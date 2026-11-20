import type { Messages } from "..";
import { design_ai } from "./design-ai";
import { design_cover } from "./design-cover";
import { design_layouts } from "./design-layouts";
import { design_pages } from "./design-pages";
import { design_ui } from "./design-ui";

/** Book designer: page design, the layered cover builder and ready-made cover layouts. */
export const design: Messages["design"] = {
  readiness: {
    coverLayers: (n: number) => (n === 1 ? "The cover has one photo spot without a photo." : `The cover has ${n} photo spots without a photo.`),
  },
  cover: design_cover,
  layouts: design_layouts,
  pages: design_pages,
  ui: design_ui,
  ai: design_ai,
};
