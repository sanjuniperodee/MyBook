import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Визуальные эталоны ключевых страниц. Данные — scripts/visual/seed.ts,
 * серверное время фиксировано VISUAL_NOW (см. playwright.config.ts).
 */
const seed = JSON.parse(readFileSync(path.join(process.cwd(), "tests/visual/.seed.json"), "utf8")) as {
  bookId: string;
  orderId: string;
  dealId: string;
  clientId: string;
  conversationId: string;
};

/** Убираем всё, что не относится к интерфейсу: dev-оверлей, курсор, анимации, полосы прокрутки. */
const STABLE_CSS = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  html { scroll-behavior: auto !important; scrollbar-width: none !important; }
  ::-webkit-scrollbar { display: none !important; }
  nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button], #next-logo { display: none !important; }
  /* content-visibility: auto не рисует секции ниже экрана — в fullPage-снимке они были бы пустыми. */
  .below-fold { content-visibility: visible !important; }
  /* reveal-анимации привязаны к прокрутке; в снимке фиксируем конечное состояние. */
  .reveal, .reveal-stagger > * { animation: none !important; opacity: 1 !important; transform: none !important; }
`;

async function settle(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({ content: STABLE_CSS });
  // Прокручиваем страницу целиком: секции ниже первого экрана появляются по IntersectionObserver,
  // и без этого fullPage-снимок может поймать их ещё скрытыми (плавающий diff на длинном лендинге).
  const height = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
  const step = Math.max(400, Math.ceil(height / 12));
  for (let y = 0; y < height; y += step) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]);
    await Promise.race([
      Promise.all(
        [...document.images].map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }),
        ),
      ),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  });
  // Даём гидратации и запросам страницы закончиться; SSE не ждём — он живёт постоянно.
  await page.waitForTimeout(700);
}

async function shot(page: Page, name: string) {
  await settle(page);
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
}

const publicPages: [name: string, route: string][] = [
  ["public-home", "/"],
  ["public-home-kk", "/kk"],
  ["public-login", "/login"],
  ["public-landing-mom", "/kniga/kniga-mame"],
  ["public-gift", "/gift"],
];

test.describe("публичные страницы", () => {
  for (const [name, route] of publicPages) {
    test(name, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1").first()).toBeAttached();
      await shot(page, name);
    });
  }
});

test.describe("кабинет клиента", () => {
  test.use({ storageState: "tests/visual/.auth/client.json" });

  const pages: [name: string, route: string][] = [
    ["client-books", "/books"],
    ["client-book", `/books/${seed.bookId}`],
    ["client-book-questions", `/books/${seed.bookId}/questions`],
    ["client-book-cover", `/books/${seed.bookId}/cover`],
    ["client-book-checkout", `/books/${seed.bookId}/checkout`],
  ];

  for (const [name, route] of pages) {
    test(name, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1").first()).toBeAttached();
      await shot(page, name);
    });
  }
});

test.describe("админка", () => {
  test.use({ storageState: "tests/visual/.auth/admin.json" });

  const pages: [name: string, route: string][] = [
    ["admin-dashboard", "/admin"],
    ["admin-orders", "/admin/orders"],
    ["admin-order", `/admin/orders/${seed.orderId}`],
    ["admin-clients", "/admin/clients"],
    ["admin-client", `/admin/clients/${seed.clientId}`],
    ["admin-deals", "/admin/deals"],
    ["admin-deal", `/admin/deals/${seed.dealId}`],
    ["admin-chats", "/admin/chats"],
    ["admin-chat", `/admin/chats?c=${seed.conversationId}`],
    ["admin-settings", "/admin/settings"],
  ];

  for (const [name, route] of pages) {
    test(name, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1").first()).toBeAttached();
      await shot(page, name);
    });
  }
});
