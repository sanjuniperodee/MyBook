import type { Messages } from "..";

/** Кітап дизайнері: беттердің безендірілуі және қабаттардан тұратын мұқаба құрастырушысы. */
export const design: Messages["design"] = {
  readiness: {
    coverLayers: (n: number) => (n === 1 ? "Мұқабада суретсіз фото орны бар." : `Мұқабада суретсіз ${n} фото орны бар.`),
  },
};
