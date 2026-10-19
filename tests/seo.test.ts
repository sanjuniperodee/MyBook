import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { articles, getArticle } from "@/lib/content/articles";
import { landings } from "@/lib/content/landings";
import { bookKind, hasQuestionBank } from "@/lib/content/kinds";
import { bankThemes, isThemeId } from "@/lib/content/themes";
import { absoluteUrl, articleLd, breadcrumbLd, faqLd, ogImage, organizationLd, productLd, reviewsLd, websiteLd } from "@/lib/seo";
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

describe("посадочные новых видов книг", () => {
  const byKind = (kind: string) => landings.filter((l) => bookKind(l.theme) === kind);

  it("у каждой известной темы есть посадочная; род адресата нужен только подаркам", () => {
    for (const l of landings) {
      expect(isThemeId(l.theme), l.slug).toBe(true);
      if (bookKind(l.theme) === "gift") expect(l.recipientGender, l.slug).toBeDefined();
    }
    expect(byKind("autobiography")).toHaveLength(1);
    expect(byKind("blank")).toHaveLength(1);
  });

  it("автобиография и своя книга попадают в первые восемь — их показывает футер", () => {
    const top = landings.slice(0, 8).map((l) => l.slug);
    for (const l of [...byKind("autobiography"), ...byKind("blank")]) expect(top, l.slug).toContain(l.slug);
  });

  it("свою книгу строят без банка вопросов: у неё нет примеров, их место занимает блок о редакторе", () => {
    for (const l of byKind("blank")) expect(hasQuestionBank(l.theme)).toBe(false);
    for (const lc of locales) {
      const sp = messagesFor(lc).landing.seoPage;
      expect(sp.editor.items.length).toBeGreaterThanOrEqual(3);
      expect(sp.howSteps(5, true)[0]).not.toBe(sp.howSteps(5)[0]);
    }
  });

  it("у автобиографии примеры вопросов есть в обоих языках, и они не падают без рода адресата", () => {
    for (const l of byKind("autobiography"))
      for (const theme of bankThemes().filter((t) => t.id === l.theme)) expect(theme.chapters.every((ch) => ch.questions.length > 0)).toBe(true);
  });

  for (const lc of locales) {
    it(`${lc}: главная рассказывает о книге про себя и о своей книге с чистого листа`, () => {
      const m = messagesFor(lc).landing;
      expect(m.modes.autobiography.meta(60)).toContain("60");
      expect(m.modes.blank.meta.length).toBeGreaterThan(0);
      const faq = m.faq.items({ standard: "5–7", premium: "3–4" }).map(([q]) => q);
      expect(faq.length).toBeGreaterThanOrEqual(11);
      expect(m.ideas.selfTitle.length).toBeGreaterThan(0);
    });
  }
});

describe("статьи блога", () => {
  it("адреса уникальны, посадочные из ссылок существуют, тема известна", () => {
    expect(dup(articles.map((a) => a.slug))).toEqual([]);
    for (const a of articles) {
      expect(isThemeId(a.theme)).toBe(true);
      // Подборка вопросов статьи берётся из банка темы: у своей книги (blank) банка нет.
      expect(hasQuestionBank(a.theme), a.slug).toBe(true);
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
    expect(urls.filter((u) => /\/(login|register|books|orders|account|admin|api)(\/|$)/.test(u))).toEqual([]);
  });

  it("у каждой записи — картинка для поиска по картинкам (та же, что для соцсетей), у статей — дата", () => {
    for (const e of entries) expect(e.images).toEqual([expect.stringMatching(/\/api\/og\?l=(ru|kk)/)]);
    const landing = entries.find((e) => e.url === absoluteUrl(`/kniga/${landings[0].slug}`, "kk"));
    expect(landing?.images?.[0]).toContain(`s=${landings[0].slug}`);
    expect(landing?.images?.[0]).toContain("l=kk");
    expect(entries.find((e) => e.url === absoluteUrl(`/blog/${articles[0].slug}`, "ru"))?.lastModified).toBe(articles[0].updated ?? articles[0].published);
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
    for (const p of ["/", "/kniga", "/blog", "/gift", "/kk", "/blog/rss.xml"]) expect(disallow.some((d) => p.startsWith(d) && d !== "/")).toBe(false);
    expect(r.sitemap).toBe(absoluteUrl("/", "ru") + "/sitemap.xml");
  });

  it("Clean-param для Яндекса — в той же группе «*»: метки рекламы и коротких ссылок не плодят адресов", () => {
    const clean = String((rule as { other?: Record<string, unknown> }).other?.["Clean-param"] ?? "");
    for (const p of ["utm_source", "utm_campaign", "lnk", "ref", "theme", "gclid"]) expect(clean).toContain(p);
    expect(clean.endsWith(" /")).toBe(true);
    expect(Array.isArray(r.rules) ? r.rules.length : 1).toBe(1);
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

  it("Organization: номер-заглушка не попадает в разметку, другие названия бренда и город — попадают", () => {
    const org = organizationLd("d", { alternateName: ["MyBook", "mybook.kz"], address: { locality: "Almaty", country: "KZ" } }) as Record<string, unknown> & { contactPoint: Record<string, unknown>[] };
    // В конфиге пока номер «+7 700 000 00 00» — поисковик не должен показать его в карточке компании.
    expect(org).not.toHaveProperty("telephone");
    expect(org.contactPoint[0]).not.toHaveProperty("telephone");
    expect(org).toMatchObject({ alternateName: ["MyBook", "mybook.kz"], address: { "@type": "PostalAddress", addressLocality: "Almaty", addressCountry: "KZ" } });
    expect(websiteLd("kk", ["MyBook"])).toMatchObject({ alternateName: ["MyBook"], inLanguage: "kk-KZ" });
    expect(organizationLd("d")).not.toHaveProperty("alternateName");
  });

  it("Product и Article: свой @id, адрес и ссылка на организацию", () => {
    const m = messagesFor("ru");
    const names = Object.fromEntries(Object.entries(m.common.plans).map(([id, p]) => [id, p.name]));
    const product = productLd({ name: "N", description: "D", url: "https://x.kz/kniga/a", image: "/api/og?l=ru", locale: "ru", planNames: names });
    expect(product).toMatchObject({ "@id": "https://x.kz/kniga/a#product", manufacturer: { "@id": expect.stringMatching(/#organization$/) } });
    expect(product).not.toHaveProperty("inLanguage");
    const article = articleLd({ title: "T", description: "D", url: "https://x.kz/blog/a", image: "/api/og?l=ru&s=a", locale: "ru", published: "2026-10-05" });
    expect(article).toMatchObject({ "@id": "https://x.kz/blog/a#article", url: "https://x.kz/blog/a", mainEntityOfPage: { "@type": "WebPage", "@id": "https://x.kz/blog/a" }, dateModified: "2026-10-05", publisher: { "@id": expect.stringMatching(/#organization$/), logo: { url: expect.stringMatching(/logo\.png$/) } } });
  });

  it("поводы на главной ведут на существующие посадочные страницы, у тем есть посадочная", () => {
    for (const lc of locales) {
      const items = messagesFor(lc).landing.occasions.items;
      expect(items.length).toBeGreaterThanOrEqual(6);
      for (const o of items) if (o.slug) expect(landings.some((l) => l.slug === o.slug), o.slug).toBe(true);
      expect(items.filter((o) => o.slug).length).toBeGreaterThanOrEqual(3);
    }
    for (const theme of ["love", "mom", "dad", "friend"]) expect(landings.some((l) => l.theme === theme), theme).toBe(true);
  });
});
