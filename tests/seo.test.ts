import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { articles, getArticle } from "@/lib/content/articles";
import { landings } from "@/lib/content/landings";
import { isThemeId } from "@/lib/content/themes";
import { absoluteUrl, breadcrumbLd, faqLd, ogImage, organizationLd, productLd, reviewsLd } from "@/lib/seo";
import { messagesFor } from "@/i18n/messages";
import { locales } from "@/i18n/config";

const dup = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);

describe("посадочные страницы", () => {
  it("адреса уникальны и пригодны для URL", () => {
    const slugs = landings.map((l) => l.slug);
    expect(dup(slugs)).toEqual([]);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  for (const locale of locales) {
    it(`${locale}: title и description укладываются в сниппет, тексты не повторяются`, () => {
      const c = landings.map((l) => l.content[locale]);
      for (const x of c) {
        expect(x.metaTitle.length, x.metaTitle).toBeLessThanOrEqual(80);
        expect(x.metaDescription.length, x.metaDescription).toBeGreaterThanOrEqual(80);
        expect(x.metaDescription.length, x.metaDescription).toBeLessThanOrEqual(200);
        expect(x.why).toHaveLength(3);
        expect(x.faq.length).toBeGreaterThan(0);
      }
      expect(dup(c.map((x) => x.metaTitle))).toEqual([]);
      expect(dup(c.map((x) => x.metaDescription))).toEqual([]);
      expect(dup(c.map((x) => `${x.h1} ${x.accent}`))).toEqual([]);
    });
  }
});

describe("статьи блога", () => {
  it("адреса уникальны, посадочные из ссылок существуют, тема известна", () => {
    expect(dup(articles.map((a) => a.slug))).toEqual([]);
    for (const a of articles) {
      expect(isThemeId(a.theme)).toBe(true);
      expect(a.landings.length).toBeGreaterThan(0);
      for (const slug of a.landings) expect(landings.some((l) => l.slug === slug), `${a.slug} → ${slug}`).toBe(true);
      expect(a.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (a.bank) expect(a.bank.afterSection).toBeLessThanOrEqual(a.content.ru.sections.length);
    }
  });

  for (const locale of locales) {
    it(`${locale}: у каждой статьи есть заголовок, описание, разделы и вопросы`, () => {
      const c = articles.map((a) => a.content[locale]);
      for (const [i, x] of c.entries()) {
        expect(x.title.length, x.title).toBeLessThanOrEqual(110);
        expect(x.description.length, x.description).toBeGreaterThanOrEqual(80);
        expect(x.description.length, x.description).toBeLessThanOrEqual(220);
        expect(x.sections.length).toBeGreaterThanOrEqual(3);
        for (const s of x.sections) expect(s.paragraphs?.length || s.list?.length, s.heading).toBeTruthy();
        expect(x.faq.length).toBeGreaterThan(0);
        if (articles[i].bank) expect(x.questions?.heading).toBeTruthy();
      }
      expect(dup(c.map((x) => x.title))).toEqual([]);
    });
  }

  it("структура русской и казахской версий совпадает", () => {
    for (const a of articles) {
      const { ru, kk } = a.content;
      expect(kk.sections.map((s) => [s.paragraphs?.length ?? 0, s.list?.length ?? 0])).toEqual(ru.sections.map((s) => [s.paragraphs?.length ?? 0, s.list?.length ?? 0]));
      expect(kk.faq).toHaveLength(ru.faq.length);
    }
  });

  it("в казахских текстах нет букв, которых в казахском почти нет", () => {
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    for (const l of landings) walk(l.content.kk);
    for (const a of articles) walk(a.content.kk);
    expect(strings.filter((s) => /[ёщъ]/i.test(s))).toEqual([]);
  });

  it("getArticle находит статью по адресу", () => {
    expect(getArticle(articles[0].slug)).toBe(articles[0]);
    expect(getArticle("net-takoj")).toBeUndefined();
  });
});

describe("sitemap", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it("в карте нет повторов, а каждая страница есть на обоих языках", () => {
    expect(dup(urls)).toEqual([]);
    for (const l of landings) {
      expect(urls).toContain(absoluteUrl(`/kniga/${l.slug}`, "ru"));
      expect(urls).toContain(absoluteUrl(`/kniga/${l.slug}`, "kk"));
    }
    for (const a of articles) {
      expect(urls).toContain(absoluteUrl(`/blog/${a.slug}`, "ru"));
      expect(urls).toContain(absoluteUrl(`/blog/${a.slug}`, "kk"));
    }
    for (const p of ["/", "/kniga", "/blog", "/gift"]) for (const lc of locales) expect(urls).toContain(absoluteUrl(p, lc));
  });

  it("служебные страницы не попадают в карту", () => {
    expect(urls.filter((u) => /\/(login|books|orders|account|admin|api)(\/|$)/.test(u))).toEqual([]);
  });

  it("каждая запись ссылается на обе версии и x-default", () => {
    for (const e of entries) expect(Object.keys(e.alternates?.languages ?? {}).sort()).toEqual(["kk", "ru", "x-default"]);
  });
});

describe("robots", () => {
  const r = robots();
  const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
  const disallow = ([] as string[]).concat(rule.disallow ?? []);
  const allow = ([] as string[]).concat(rule.allow ?? []);

  it("закрывает кабинет на обоих языках и API, но оставляет картинки для соцсетей и обложки", () => {
    for (const p of ["/books", "/kk/books", "/orders", "/account", "/admin", "/api", "/gift/", "/kk/gift/"]) expect(disallow).toContain(p);
    expect(allow).toEqual(expect.arrayContaining(["/", "/api/og", "/api/covers/"]));
  });

  it("не закрывает публичные страницы и указывает карту сайта", () => {
    for (const p of ["/", "/kniga", "/blog", "/gift", "/kk"]) expect(disallow.some((d) => p.startsWith(d) && d !== "/")).toBe(false);
    expect(r.sitemap).toBe(absoluteUrl("/", "ru") + "/sitemap.xml");
  });
});

describe("разметка schema.org", () => {
  it("абсолютные адреса: русский без префикса, казахский — под /kk, главная без слеша", () => {
    expect(absoluteUrl("/gift", "ru")).toMatch(/\/gift$/);
    expect(absoluteUrl("/gift", "kk")).toMatch(/\/kk\/gift$/);
    expect(absoluteUrl("/", "ru")).not.toMatch(/\/$/);
    expect(absoluteUrl("/", "kk")).toMatch(/\/kk$/);
  });

  it("картинка для соцсетей учитывает язык и страницу", () => {
    expect(ogImage("ru")).toBe("/api/og?l=ru");
    expect(ogImage("kk", "kniga-mame")).toBe("/api/og?l=kk&s=kniga-mame");
  });

  it("BreadcrumbList нумерует пункты с единицы", () => {
    const b = breadcrumbLd([{ name: "A", path: "/" }, { name: "B", path: "/blog" }], "kk") as { itemListElement: { position: number; item: string }[] };
    expect(b.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(b.itemListElement[1].item).toMatch(/\/kk\/blog$/);
  });

  it("FAQPage повторяет вопросы без изменений", () => {
    const f = faqLd([["Q?", "A."]]) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(f.mainEntity[0]).toMatchObject({ name: "Q?", acceptedAnswer: { text: "A." } });
  });

  it("Product содержит предложение на каждый тариф, а звёзды — только при настоящих отзывах", () => {
    const m = messagesFor("ru");
    const names = Object.fromEntries(Object.entries(m.common.plans).map(([id, p]) => [id, p.name]));
    const base = { name: "N", description: "D", url: "https://x.kz/", image: "/api/og?l=ru", locale: "ru" as const, planNames: names };
    const none = productLd(base) as { offers: { offerCount: number; offers: unknown[] } };
    expect(none.offers.offers).toHaveLength(none.offers.offerCount);
    expect(none).not.toHaveProperty("aggregateRating");
    expect(reviewsLd({ summary: null, reviews: [] })).toEqual({});
    const withReviews = reviewsLd({ summary: { average: 4.8, count: 12 }, reviews: [{ authorName: "A", text: "T", rating: 5, publishedAt: new Date("2026-01-02") }] });
    expect(withReviews).toHaveProperty("aggregateRating.reviewCount", 12);
  });

  it("Organization содержит название, адрес и логотип", () => {
    expect(organizationLd("d")).toMatchObject({ "@type": "Organization", name: expect.any(String), url: expect.any(String), logo: { url: expect.stringMatching(/logo\.png$/) } });
  });
});
