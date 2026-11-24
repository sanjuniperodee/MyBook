import { describe, expect, it } from "vitest";
import { AVATAR_RECHECK_MS, avatarIdOf, refreshChatAvatars, type AvatarDeps } from "@/modules/messaging/application/chatAvatars";

const NOW = new Date("2026-11-24T12:00:00Z");
const link = (conv: string, id: string) => `/api/chat-avatar/${conv}_${id}_${"s".repeat(22)}.webp`;

function deps(rows: { id: string; chatId: string; avatarUrl: string | null }[], pics: Record<string, { id: string; url: string } | null | Error>) {
  const saved: [string, string | null | undefined][] = [];
  const stored: string[] = [];
  const errors: string[] = [];
  let checkedBefore: Date | null = null;
  const d: AvatarDeps = {
    async due(limit, before) {
      checkedBefore = before;
      return rows.slice(0, limit);
    },
    async avatar(chatId) {
      const p = pics[chatId];
      if (p instanceof Error) throw p;
      return p ?? null;
    },
    async store(conv, id) {
      if (id === "bad") throw new Error("download failed");
      stored.push(`${conv}:${id}`);
      return link(conv, id);
    },
    async save(conv, url) {
      saved.push([conv, url]);
    },
    sleep: async () => undefined,
    now: () => NOW,
    logger: { error: (msg) => errors.push(msg) },
  };
  return { d, saved, stored, errors, before: () => checkedBefore };
}

describe("фото профиля WhatsApp в чатах", () => {
  it("новое фото сохраняется своей ссылкой, то же — не качается заново, убранное — буква", async () => {
    const t = deps(
      [
        { id: "a", chatId: "7701", avatarUrl: null },
        { id: "b", chatId: "7702", avatarUrl: link("b", "55") },
        { id: "c", chatId: "7703", avatarUrl: link("c", "1") },
        { id: "d", chatId: "7704", avatarUrl: link("d", "9") },
      ],
      { "7701": { id: "10", url: "u" }, "7702": { id: "55", url: "u" }, "7703": { id: "2", url: "u" }, "7704": null },
    );
    expect(await refreshChatAvatars(t.d, 10)).toBe(3);
    expect(t.stored).toEqual(["a:10", "c:2"]);
    expect(t.saved).toEqual([
      ["a", link("a", "10")],
      ["b", undefined],
      ["c", link("c", "2")],
      ["d", null],
    ]);
    expect(t.before()!.getTime()).toBe(NOW.getTime() - AVATAR_RECHECK_MS);
  });

  it("шлюз не отвечает — проход останавливается, чаты остаются в очереди", async () => {
    const t = deps(
      [
        { id: "a", chatId: "7701", avatarUrl: null },
        { id: "b", chatId: "7702", avatarUrl: null },
      ],
      { "7701": new Error("unreachable") },
    );
    expect(await refreshChatAvatars(t.d, 10)).toBe(0);
    expect(t.saved).toEqual([]);
    expect(t.errors).toEqual(["gateway"]);
  });

  it("фото не скачалось — чат отмечен проверенным, остальные идут дальше", async () => {
    const t = deps(
      [
        { id: "a", chatId: "7701", avatarUrl: null },
        { id: "b", chatId: "7702", avatarUrl: null },
      ],
      { "7701": { id: "bad", url: "u" }, "7702": { id: "7", url: "u" } },
    );
    expect(await refreshChatAvatars(t.d, 10)).toBe(1);
    expect(t.saved).toEqual([
      ["a", undefined],
      ["b", link("b", "7")],
    ]);
  });

  it("id фото читается из своей ссылки, чужая ссылка — нет", () => {
    expect(avatarIdOf(link("x", "123"))).toBe("123");
    expect(avatarIdOf("https://wazzup.example/a.jpg")).toBeNull();
    expect(avatarIdOf(null)).toBeNull();
  });
});
