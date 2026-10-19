import { describe, expect, it } from "vitest";
import { systemBlocks } from "@/modules/assistant/domain/systemBlocks";

const stable = "Ты — помощница. ".repeat(40);

describe("Системная инструкция для кэша провайдера", () => {
  it("стабильное начало — отдельным кэшируемым блоком, остальное следом", () => {
    expect(systemBlocks(`${stable}\n## Сейчас\nсегодня суббота`, stable)).toEqual([
      { text: stable, cached: true },
      { text: "\n## Сейчас\nсегодня суббота", cached: false },
    ]);
  });

  it("префикс не является началом инструкции или слишком короткий — один блок без кэша", () => {
    expect(systemBlocks(`${stable}\nхвост`, "другое начало")).toEqual([{ text: `${stable}\nхвост`, cached: false }]);
    expect(systemBlocks("коротко\nхвост", "коротко")).toEqual([{ text: "коротко\nхвост", cached: false }]);
    expect(systemBlocks(stable, undefined)).toEqual([{ text: stable, cached: false }]);
  });

  it("вся инструкция стабильна — один кэшируемый блок", () => {
    expect(systemBlocks(stable, stable)).toEqual([{ text: stable, cached: true }]);
  });
});
