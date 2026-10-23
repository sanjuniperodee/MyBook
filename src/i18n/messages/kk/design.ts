import type { Messages } from "..";
import { design_ai } from "./design-ai";
import { design_cover } from "./design-cover";
import { design_layouts } from "./design-layouts";
import { design_pages } from "./design-pages";
import { design_ui } from "./design-ui";

/** Кітап дизайнері: беттердің безендірілуі, қабаттардан тұратын мұқаба құрастырушысы және мұқаба макеттері. */
export const design: Messages["design"] = {
  readiness: {
    coverLayers: (n: number) => (n === 1 ? "Мұқабада суретсіз фото орны бар." : `Мұқабада суретсіз ${n} фото орны бар.`),
  },
  cover: design_cover,
  layouts: design_layouts,
  pages: design_pages,
  ui: design_ui,
  ai: design_ai,
};
