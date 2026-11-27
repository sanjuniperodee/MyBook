import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * С 26.11 сайт и CRM работают на Vercel (ADR 0013), а на сервере остаётся только бэкенд. Процесс сайта выключается
 * файлом-флагом ~/mybook-flags/site (или MYBOOK_SITE=off), и deploy/deploy.sh с deploy/rollback.sh его больше не поднимают.
 * С 27.11 бэкенд собирается без Next: в новых релизах нет server.js — процесса сайта нет и без флага.
 */
const dir = mkdtempSync(path.join(tmpdir(), "mybook-flags-"));
const withSite = path.join(dir, "with-site");
mkdirSync(path.join(withSite, "current"), { recursive: true });
writeFileSync(path.join(withSite, "current", "server.js"), "");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function apps(env: Record<string, string>): string[] {
  const out = execFileSync(
    process.execPath,
    ["-e", 'console.log(JSON.stringify(require("./deploy/ecosystem.config.cjs").apps.map((a) => a.name)))'],
    { env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", MYBOOK_RELEASES_DIR: withSite, MYBOOK_FLAGS_DIR: dir, ...env }, encoding: "utf8" },
  );
  return JSON.parse(out) as string[];
}

describe("процесс сайта в PM2-конфиге", () => {
  it("в релизе с server.js по умолчанию запускается", () => {
    expect(apps({})).toContain("mybook");
  });

  it("не запускается с MYBOOK_SITE=off", () => {
    expect(apps({ MYBOOK_SITE: "off" })).not.toContain("mybook");
  });

  it("не запускается с файлом-флагом site = off", () => {
    writeFileSync(path.join(dir, "site"), "off\n");
    try {
      expect(apps({})).not.toContain("mybook");
    } finally {
      rmSync(path.join(dir, "site"));
    }
  });

  it("не запускается, если в релизе нет server.js (сборка без Next)", () => {
    expect(apps({ MYBOOK_RELEASES_DIR: path.join(dir, "no-releases") })).not.toContain("mybook");
  });

  it("в конфиге нет пустых записей", () => {
    expect(apps({ MYBOOK_SITE: "off" }).every(Boolean)).toBe(true);
  });
});
