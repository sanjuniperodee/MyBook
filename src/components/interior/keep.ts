import type { PageKit } from "./kit";

/** Держать с тем, что дальше: без доводки превью — браузером; с ней — нет, висящий блок переносит правило, как в PDF. */
export const keepWithNext = (kit: PageKit) => (kit.decides ? {} : ({ breakAfter: "avoid" } as const));
