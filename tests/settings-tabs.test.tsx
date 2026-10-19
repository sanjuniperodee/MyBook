import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

const { SETTINGS_TABS, parseTab } = await import("@/app/admin/settings/tabs");
const { SettingsNav } = await import("@/app/admin/settings/SettingsNav");

describe("страница «Интеграции»: вкладки", () => {
  it("вкладка берётся из адреса; пустая и незнакомая — первая", () => {
    expect(parseTab("bot")).toBe("bot");
    expect(parseTab(["ai", "bot"])).toBe("ai");
    expect(parseTab(undefined)).toBe(SETTINGS_TABS[0].id);
    expect(parseTab("nonsense")).toBe(SETTINGS_TABS[0].id);
    // Старый адрес со ссылкой-якорем (#…) не ломает страницу: вкладки идентифицируются только по ?tab.
    expect(new Set(SETTINGS_TABS.map((t) => t.id)).size).toBe(SETTINGS_TABS.length);
  });

  it("все разделы на месте: оплата, мессенджеры, почта, телефония, AI, бот, CRM", () => {
    expect(SETTINGS_TABS.map((t) => t.id)).toEqual(["payments", "messengers", "mail", "telephony", "ai", "bot", "crm"]);
  });

  it("навигация: ссылки ?tab=…, активная отмечена, группы подписаны", () => {
    const html = renderToStaticMarkup(<SettingsNav active="bot" />);
    for (const t of SETTINGS_TABS) expect(html).toContain(`href="/admin/settings?tab=${t.id}"`);
    expect(html.match(/aria-current="page"/g)).toHaveLength(2); // мобильная лента и боковое меню
    for (const g of ["Деньги", "Каналы связи", "Автоматизация", "Работа менеджеров"]) expect(html).toContain(g);
  });
});
