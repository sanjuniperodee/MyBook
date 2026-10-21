import { describe, expect, it } from "vitest";
import { mobileLayout } from "@/server/mobile-layout";
import type { Permission } from "@/shared/domain/permissions";

const layout = (perms: Permission[], owner = false) => mobileLayout((p) => perms.includes(p), owner);

describe("Раскладка мобильного приложения по правам", () => {
  it("владелец и управляющий командой — руководитель", () => {
    expect(layout([], true)).toBe("leader");
    expect(layout(["team.manage", "chats.view"])).toBe("leader");
    expect(layout(["analytics.view", "deals.view"])).toBe("leader");
  });

  it("сделки и чаты без аналитики — продажи", () => {
    expect(layout(["deals.view", "deals.edit", "chats.view", "chats.send", "clients.view"])).toBe("sales");
    expect(layout(["deals.view"])).toBe("sales");
  });

  it("заказы без сделок и чатов — производство; аналитика без работы с клиентами — аналитик", () => {
    expect(layout(["orders.view", "orders.edit", "orders.files"])).toBe("production");
    expect(layout(["analytics.view"])).toBe("analyst");
    expect(layout(["analytics.view", "orders.view"])).toBe("production");
  });

  it("только переписка — поддержка; ничего — базовая", () => {
    expect(layout(["chats.view", "chats.send"])).toBe("support");
    expect(layout([])).toBe("basic");
  });
});
