import { describe, expect, it } from "vitest";
import { GET } from "@/app/blog/rss.xml/route";
import { rssPath } from "@/app/blog/rss.xml/feed";
import { articles } from "@/lib/content/articles";
import { absoluteUrl } from "@/lib/seo";

describe("RSS блога", () => {
  it("русская лента: все статьи, абсолютные адреса, самая свежая первой, правильный тип ответа", async () => {
    const res = GET(new Request("https://mybook.kz/blog/rss.xml"));
    expect(res.headers.get("Content-Type")).toContain("application/rss+xml");
    const xml = await res.text();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"')).toBe(true);
    expect(xml.match(/<item>/g)).toHaveLength(articles.length);
    for (const a of articles) expect(xml).toContain(`<link>${absoluteUrl(`/blog/${a.slug}`, "ru")}</link>`);
    expect(xml).toContain("<language>ru-ru</language>");
    const newest = [...articles].sort((a, b) => (b.updated ?? b.published).localeCompare(a.updated ?? a.published))[0];
    expect(xml.indexOf(newest.slug)).toBeLessThan(xml.indexOf("</item>"));
    expect(xml).toContain(`href="${absoluteUrl("/", "ru")}/blog/rss.xml"`);
  });

  it("казахская лента — по ?l=kk: казахские заголовки и адреса под /kk; незнакомый язык — русский", async () => {
    const xml = await GET(new Request("https://mybook.kz/blog/rss.xml?l=kk")).text();
    expect(xml).toContain("<language>kk-kz</language>");
    expect(xml).toContain(`<link>${absoluteUrl(`/blog/${articles[0].slug}`, "kk")}</link>`);
    expect(xml).toContain(`<title>${articles[0].content.kk.title.replace(/&/g, "&amp;")}</title>`);
    expect(await GET(new Request("https://mybook.kz/blog/rss.xml?l=de")).text()).toContain("<language>ru-ru</language>");
    expect(rssPath("ru")).toBe("/blog/rss.xml");
    expect(rssPath("kk")).toBe("/blog/rss.xml?l=kk");
  });

  it("спецсимволы в текстах экранируются — лента остаётся валидным XML", async () => {
    const xml = await GET(new Request("https://mybook.kz/blog/rss.xml")).text();
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|#)/);
  });
});
