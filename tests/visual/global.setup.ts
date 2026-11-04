import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { VISUAL_PASSWORD } from "./clock";

const ROOT = process.cwd();
const AUTH_DIR = path.join(ROOT, "tests/visual/.auth");
const SEED_FILE = path.join(ROOT, "tests/visual/.seed.json");

async function waitForServer(url: string, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // сервер ещё поднимается
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Сервер не поднялся за ${timeoutMs} мс: ${url}`);
}

function seedDatabase() {
  const databaseUrl = process.env.VISUAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Нужен VISUAL_DATABASE_URL (или DATABASE_URL) тестовой базы");
  execFileSync("npx", ["tsx", "--import", "./scripts/preload.mjs", "scripts/visual/seed.ts"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
    encoding: "utf8",
  });
}

async function login(page: Page, email: string, next: string) {
  const expected = next.split("?")[0];
  // Первый вход после холодного старта dev-сервера иногда приходит до готовности server action.
  // Две попытки с паузой: это инфраструктурный ретрай, а не обход ошибки приложения.
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    // Форма есть в серверном HTML сразу, а обработчик — только после гидратации. Без ожидания
    // клик может уйти нативным submit'ом, и server action получает пустое тело.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.fill("#email", email);
    await page.fill("#password", VISUAL_PASSWORD);
    await page.click("button[type=submit]");
    try {
      await page.waitForURL((url) => url.pathname === expected, { timeout: 30_000 });
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      await page.waitForTimeout(1000);
    }
  }
}

async function saveState(browser: Browser, email: string, next: string, file: string) {
  const context = await browser.newContext({ baseURL: process.env.VISUAL_BASE_URL ?? `http://localhost:${process.env.VISUAL_PORT ?? 3210}` });
  const page = await context.newPage();
  await login(page, email, next);
  await context.storageState({ path: file });
  await context.close();
}

export default async function globalSetup() {
  const baseURL = process.env.VISUAL_BASE_URL ?? `http://localhost:${process.env.VISUAL_PORT ?? 3210}`;
  await waitForServer(baseURL);
  seedDatabase();
  const seed = JSON.parse(readFileSync(SEED_FILE, "utf8")) as { adminEmail: string; clientEmail: string };
  mkdirSync(AUTH_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    await saveState(browser, seed.adminEmail, "/admin", path.join(AUTH_DIR, "admin.json"));
    await saveState(browser, seed.clientEmail, "/books", path.join(AUTH_DIR, "client.json"));
  } finally {
    await browser.close();
  }
}
