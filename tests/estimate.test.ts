import { describe, expect, it } from "vitest";
import { estimateAnswerPages, textMetrics } from "@/lib/book/estimate";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";

describe("estimate: начало ответа", () => {
  const answer = "Первый абзац ответа.\n\nВторой абзац ответа.";

  it.each(["classic", "minimal", "romance"])("пустой заголовок считается как разделитель, а не как строка заголовка — так печатает PDF (%s)", (id) => {
    const m = textMetrics(getFormat("a5"), getInteriorDesign(id));
    expect(estimateAnswerPages("", answer, [], m)).toBe(estimateAnswerPages(null, answer, [], m));
    expect(estimateAnswerPages("Заголовок", answer, [], m)).not.toBe(estimateAnswerPages(null, answer, [], m));
  });
});
