import { describe, expect, it } from "vitest";
import { followUpDelayMs, materialsAlreadySent, materialsFor, materialsSummary, newSellerAiState, parseMaterials, type BotMaterial } from "@/modules/messaging/domain";

const m = (id: string, kind: BotMaterial["kind"], lang: BotMaterial["lang"] = "any", on = true): BotMaterial => ({ id, kind, key: `bot-media/${"0".repeat(35)}${id.length}.jpg`, name: id, mime: "image/jpeg", size: 1, caption: "", lang, about: "", on });

describe("подборка материалов продажника", () => {
  it("порядок: фото, видео, документы; язык клиента; документ другого языка — если своего нет", () => {
    const list = [m("doc-kk", "document", "kk"), m("v", "video"), m("i1", "image"), m("off", "image", "any", false), m("doc-ru", "document", "ru"), m("i-kk", "image", "kk")];
    expect(materialsFor(list, "ru").map((x) => x.id)).toEqual(["i1", "v", "doc-ru"]);
    expect(materialsFor(list, "kk").map((x) => x.id)).toEqual(["i1", "i-kk", "v", "doc-kk"]);
    expect(materialsFor([m("doc-kk", "document", "kk")], "ru").map((x) => x.id)).toEqual(["doc-kk"]);
    expect(materialsSummary(list)).toBe("2 фото, 1 видео, 2 PDF");
  });

  it("из настроек: чужие ключи хранилища и мусор отбрасываются", () => {
    const ok = { id: "a", kind: "image", key: "bot-media/123e4567-e89b-12d3-a456-426614174000.jpg", name: "a.jpg", mime: "image/jpeg", size: 10 };
    const list = parseMaterials(JSON.stringify([ok, { ...ok, id: "b", key: "../../etc/passwd" }, null, { ...ok, id: "c", kind: "exe" }]));
    expect(list.map((x) => [x.id, x.kind, x.lang, x.on])).toEqual([
      ["a", "image", "any", true],
      ["c", "document", "any", true],
    ]);
    expect(parseMaterials("не json")).toEqual([]);
  });

  it("подборку уже прислал менеджер — три файла от нас в переписке", () => {
    expect(materialsAlreadySent([{ from: "manager", type: "image" }, { from: "manager", type: "video" }, { from: "client", type: "image" }])).toBe(false);
    expect(materialsAlreadySent([{ from: "manager", type: "image" }, { from: "manager", type: "video" }, { from: "bot", type: "document" }])).toBe(true);
  });

  it("напоминания: тёплому — 20 минут, N часов, следующий день; остальным — N часов и следующий день", () => {
    const cold = newSellerAiState();
    const warm = { ...cold, materialsSent: true };
    const day = 20 * 3_600_000;
    expect([0, 1, 2].map((n) => followUpDelayMs({ ...warm, followUps: n }, 3, day))).toEqual([20 * 60_000, 3 * 3_600_000, day]);
    expect([0, 1, 2].map((n) => followUpDelayMs({ ...cold, followUps: n }, 3, day))).toEqual([3 * 3_600_000, day, null]);
    expect(followUpDelayMs(warm, 0, day)).toBeNull();
  });
});
