import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readDeploy = (name: string) => readFileSync(new URL(`../deploy/${name}`, import.meta.url), "utf8");

function checkNginxBracesAndDirectives(text: string, label: string) {
  let depth = 0;
  for (const [idx, raw] of text.split("\n").entries()) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    for (const ch of line) {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      expect(depth, `${label}:${idx + 1} баланс скобок`).toBeGreaterThanOrEqual(0);
    }
    if (!line.endsWith("{") && !line.endsWith("}")) {
      expect(line.endsWith(";"), `${label}:${idx + 1} директива без ';': ${line}`).toBe(true);
    }
  }
  expect(depth, `${label} незакрытый блок`).toBe(0);
}

describe("deploy nginx карта контекстов NestJS (этап г)", () => {
  it("синтаксис upstream, proxy и contexts корректен и не переключает трафик раньше времени", () => {
    const upstream = readDeploy("nginx-nest-upstream.conf");
    const proxy = readDeploy("nginx-nest-proxy.conf");
    const contexts = readDeploy("nginx-nest-contexts.conf");
    const main = readDeploy("nginx-mybook.conf");

    checkNginxBracesAndDirectives(upstream, "nginx-nest-upstream.conf");
    checkNginxBracesAndDirectives(proxy, "nginx-nest-proxy.conf");
    checkNginxBracesAndDirectives(contexts, "nginx-nest-contexts.conf");

    expect(upstream).toContain("upstream mybook_nest");
    expect(upstream).toContain("127.0.0.1:3046 max_fails=0;");
    expect(upstream).toContain("127.0.0.1:3044 backup max_fails=0;");

    expect(proxy).toContain("proxy_pass http://mybook_nest;");

    const activeLines = contexts
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    expect(activeLines).toEqual([
      "location ^~ /api/v1/__nest/ {",
      "return 404;",
      "}",
    ]);

    expect(contexts).toContain("mybook-nest-proxy.conf");
    expect(main).toContain("include snippets/mybook-nest-contexts*.conf;");
  });
});
