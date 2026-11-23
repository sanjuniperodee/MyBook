/**
 * Пометки блоков доводки вёрстки в разметке превью — те же, что FLOW_MARK у PDF: «h:<ответ>», «b:<ответ>:<блок>»,
 * «r:<ответ>:<место>:<ряд>», «t:<глава>». По ним превью раскладывает главу на полосы, как react-pdf
 * (editor/preview/pdf-tree.ts, lib/book/paginate.ts), и ставит разрывы.
 */
import { emptyFlow, type FlowDecisions } from "@/lib/book/flow-decisions";

/** Атрибут пометки блока доводки (значение — как FLOW_MARK у PDF). */
export const FLOW_ATTR = "data-flow";

/** Пометка блока доводки в разметке: data-flow. */
export const flowMark = (mark: string) => ({ [FLOW_ATTR]: mark }) as Record<string, string>;

/** Пустые решения: превью без доводки (миниатюры, первый кадр). Не менять — общий объект. */
export const NO_FLOW: FlowDecisions = emptyFlow();
