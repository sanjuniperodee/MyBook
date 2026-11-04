import { defineConfig, devices } from "@playwright/test";
import { VISUAL_NOW } from "./tests/visual/clock";

/**
 * Визуальная регрессия админки и кабинета.
 *
 * Отдельная БД (VISUAL_DATABASE_URL), детерминированный seed, фиксированные серверные часы.
 * Запуск: VISUAL_DATABASE_URL=postgres://… npx playwright test
 * Обновление эталонов: … --update-snapshots (только осознанно, с записью в PROGRESS).
 */
const PORT = Number(process.env.VISUAL_PORT ?? 3210);
const BASE_URL = process.env.VISUAL_BASE_URL ?? `http://localhost:${PORT}`;
const DATABASE_URL = process.env.VISUAL_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://mybook:mybook@localhost:5432/mybook_visual";
const STORAGE_DIR = process.env.VISUAL_STORAGE_DIR ?? "/tmp/mybook-visual-storage";

export default defineConfig({
  testDir: "./tests/visual",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./tests/visual/global.setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: {
    timeout: 20_000,
    toHaveScreenshot: {
      maxDiffPixels: 0,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  outputDir: "tests/visual/.artifacts",
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "tests/visual/.report" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "ru-RU",
    timezoneId: "Asia/Almaty",
    colorScheme: "light",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: {
        // Chromium, а не WebKit: визуальные тесты не должны требовать ещё один браузер.
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `npm run build:visual && npm run start -- -p ${PORT}`,
    url: BASE_URL,
    // Всегда свой production-сервер: иначе можно случайно снять эталоны с dev-сборки или старого кода.
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      ...process.env,
      DATABASE_URL,
      APP_URL: BASE_URL,
      APP_SECRET: process.env.APP_SECRET ?? "visual-test-secret-0123456789",
      ADMIN_EMAILS: "admin@visual.local",
      STORAGE_DIR,
      SCHEDULER: "off",
      SKIP_AUTO_MIGRATE: "1",
      VISUAL_NOW,
      VISUAL_TEST: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
