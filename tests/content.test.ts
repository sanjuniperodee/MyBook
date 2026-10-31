import { describe, expect, it } from "vitest";
import { applyGender } from "@/lib/content/gender";
import { bookKind, hasOutline, hasQuestionBank, progressOf, progressChanged, recipientPolicy } from "@/lib/content/kinds";
import { bankThemes, countQuestions, getTheme, getThemes, giftThemes, themeChaptersByLocale, themeIds } from "@/lib/content/themes";

/** Темы с банком вопросов на обоих языках: своя книга (blank) банка не имеет и из проверок банка исключена. */
const allThemes = [...bankThemes("ru"), ...bankThemes("kk")];
const bankIds = themeIds.filter(hasQuestionBank);

describe("applyGender", () => {
  it("подставляет род автора и адресата независимо", () => {
    const t = "Я {увидел|увидела} тебя, и ты [улыбнулся|улыбнулась]";
    expect(applyGender(t, "m", "f")).toBe("Я увидел тебя, и ты улыбнулась");
    expect(applyGender(t, "f", "m")).toBe("Я увидела тебя, и ты улыбнулся");
  });
  it("поддерживает пустую форму", () => {
    expect(applyGender("сказал[|а]", "m", "f")).toBe("сказала");
    expect(applyGender("сказал[|а]", "m", "m")).toBe("сказал");
  });
  it("не трогает текст без шаблонов", () => {
    expect(applyGender("Обычный [текст] без {вариантов}", "m", "m")).toBe("Обычный [текст] без {вариантов}");
  });
});

describe("банк вопросов", () => {
  it("во всех темах шаблоны корректно раскрываются для всех сочетаний рода", () => {
    for (const theme of allThemes)
      for (const ch of theme.chapters)
        for (const s of [ch.title, ...ch.questions.flat()].filter(Boolean) as string[])
          for (const a of ["m", "f"] as const)
            for (const r of ["m", "f"] as const) expect(applyGender(s, a, r), `${theme.id}: ${s}`).not.toMatch(/[[\]{}|]/);
  });
  it("в каждой теме достаточно вопросов и уникальные ключи глав", () => {
    for (const theme of allThemes) {
      expect(countQuestions(theme), theme.id).toBeGreaterThan(40);
      const keys = theme.chapters.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
  it("казахский банк повторяет русский: те же главы и столько же вопросов в каждой", () => {
    // Ключ вопроса (theme.chapter.N) одинаков на обоих языках — на нём держатся аналитика и CRM.
    for (const id of bankIds) {
      const { ru, kk } = themeChaptersByLocale(id);
      expect(kk.map((c) => c.key), id).toEqual(ru.map((c) => c.key));
      ru.forEach((ch, i) => {
        expect(kk[i].questions.length, `${id}.${ch.key}`).toBe(ch.questions.length);
        expect(Boolean(kk[i].epigraph), `${id}.${ch.key} эпиграф`).toBe(Boolean(ch.epigraph));
        ch.questions.forEach((q, j) => expect(Boolean(kk[i].questions[j][2]), `${id}.${ch.key}.${j + 1} подсказка`).toBe(Boolean(q[2])));
      });
    }
  });
  it("в казахских текстах нет русских слов-двойников", () => {
    // Грубая проверка на недопереведённые строки: русские буквы ё/щ/ъ/э в казахском почти не встречаются.
    for (const id of bankIds)
      for (const ch of themeChaptersByLocale(id).kk)
        for (const s of [ch.title, ch.epigraph ?? "", ...ch.questions.flat()] as string[]) expect(s, `${id}.${ch.key}`).not.toMatch(/[ёщъэ]/i);
  });
});

describe("виды книг", () => {
  it("вид и политика получателя — по теме; незнакомая тема — подарок", () => {
    expect(["love", "mom", "dad", "grandma", "child", "sibling", "friend", "teacher", "autobiography", "blank", "nope"].map((t) => [bookKind(t), recipientPolicy(t), hasQuestionBank(t), hasOutline(t)])).toEqual([
      ["gift", "required", true, false],
      ["gift", "required", true, false],
      ["gift", "required", true, false],
      ["gift", "required", true, false],
      ["gift", "required", true, false],
      ["gift", "required", true, false],
      ["gift", "required", true, false],
      ["gift", "required", true, false],
      ["autobiography", "none", true, false],
      ["blank", "optional", false, true],
      ["gift", "required", true, false],
    ]);
  });

  it("каталог: десять тем, у каждой вид и получатель как в kinds; подарки — первые восемь, любимому — первой", () => {
    for (const lang of ["ru", "kk"] as const) {
      const all = getThemes(lang);
      expect(all.map((t) => t.id)).toEqual(["love", "mom", "dad", "grandma", "child", "sibling", "friend", "teacher", "autobiography", "blank"]);
      for (const t of all) expect([t.id, t.kind, t.recipient]).toEqual([t.id, bookKind(t.id), recipientPolicy(t.id)]);
      expect(giftThemes(lang).map((t) => t.id)).toEqual(["love", "mom", "dad", "grandma", "child", "sibling", "friend", "teacher"]);
      expect(bankThemes(lang).map((t) => t.id)).toEqual(["love", "mom", "dad", "grandma", "child", "sibling", "friend", "teacher", "autobiography"]);
    }
  });

  it("своя книга: банка нет, название по умолчанию и первая глава есть на обоих языках, получатель необязателен", () => {
    for (const lang of ["ru", "kk"] as const) {
      const t = getTheme("blank", lang);
      expect(t.chapters).toEqual([]);
      expect(t.titleSuggestions[0]).toBeTruthy();
      expect(t.firstChapterTitle).toBeTruthy();
      expect(t.recipientLabel).toBeTruthy();
    }
    expect([getTheme("blank", "ru").firstChapterTitle, getTheme("blank", "kk").firstChapterTitle]).toEqual(["Начало", "Бастау"]);
  });

  it("автобиография: получателя нет — ни подписи поля, ни [..|..] в банке; {..|..} — род рассказчика", () => {
    for (const lang of ["ru", "kk"] as const) {
      const t = getTheme("autobiography", lang);
      expect(t.recipientLabel).toBeUndefined();
      for (const ch of t.chapters) for (const s of [ch.title, ch.epigraph ?? "", ...ch.questions.flat()] as string[]) expect(s, `${lang}.${ch.key}`).not.toMatch(/\[[^\]]*\|[^\]]*\]/);
    }
    expect(themeChaptersByLocale("autobiography").ru.map((c) => c.key)).toEqual(["intro", "roots", "childhood", "school", "youth", "work", "love", "children", "home", "times", "trials", "joys", "wisdom", "letter"]);
  });

  it("автобиография: не меньше 60 вопросов на обоих языках; подсказка первого вопроса объясняет запись со слов близкого", () => {
    for (const lang of ["ru", "kk"] as const) expect(countQuestions(getTheme("autobiography", lang)), lang).toBeGreaterThanOrEqual(60);
    expect(getTheme("autobiography", "ru").chapters[0].questions[0][2]).toContain("пишите его словами, от первого лица");
    expect(getTheme("autobiography", "kk").chapters[0].questions[0][2]).toBeTruthy();
  });

  it("учителю: подарок с банком на обоих языках, обращение «Вы» в заголовках, род учителя подставляется", () => {
    for (const lang of ["ru", "kk"] as const) {
      const t = getTheme("teacher", lang);
      expect([t.kind, t.recipient, t.defaultRecipientGender, t.defaultCover]).toEqual(["gift", "required", "f", "autumn"]);
      expect(countQuestions(t), lang).toBeGreaterThanOrEqual(45);
      expect(t.recipientLabel).toBeTruthy();
    }
    expect(themeChaptersByLocale("teacher").ru.map((c) => c.key)).toEqual(["intro", "meet", "lessons", "portrait", "class", "support", "legacy", "thanks"]);
    const letter = getTheme("teacher", "ru").chapters.at(-1)!.questions.at(-1)!;
    expect(applyGender(letter[0], "m", "f")).toBe("Напишите письмо своей учительнице от всего сердца.");
    expect(applyGender(letter[0], "f", "m")).toBe("Напишите письмо своему учителю от всего сердца.");
    expect(letter[1]).toBe("Письмо Вам");
    expect(applyGender(getTheme("teacher", "kk").chapters.at(-1)!.questions[0][1], "m", "f")).toBe("Рахмет Сізге, апай…");
  });

  it("бабушке: подарок с банком на обоих языках, адресат всегда женского рода — без [..|..]", () => {
    for (const lang of ["ru", "kk"] as const) {
      const t = getTheme("grandma", lang);
      expect([t.kind, t.recipient, t.recipientGender]).toEqual(["gift", "required", "f"]);
      expect(countQuestions(t), lang).toBeGreaterThanOrEqual(45);
      for (const ch of t.chapters) for (const s of [ch.title, ch.epigraph ?? "", ...ch.questions.flat()] as string[]) expect(s, `${lang}.${ch.key}`).not.toMatch(/\[[^\]]*\|[^\]]*\]/);
    }
    expect(themeChaptersByLocale("grandma").ru.map((c) => c.key)).toEqual(["intro", "home", "care", "life", "you", "family", "wisdom", "thanks"]);
  });

  it("брату или сестре: подарок с банком на обоих языках, род адресата подставляется", () => {
    for (const lang of ["ru", "kk"] as const) {
      const t = getTheme("sibling", lang);
      expect([t.kind, t.recipient, t.recipientGender]).toEqual(["gift", "required", undefined]);
      expect(countQuestions(t), lang).toBeGreaterThanOrEqual(45);
    }
    expect(themeChaptersByLocale("sibling").ru.map((c) => c.key)).toEqual(["intro", "childhood", "family", "you", "grownup", "future", "thanks"]);
    const letter = getTheme("sibling", "ru").chapters.at(-1)!.questions.at(-1)!;
    expect(applyGender(letter[0], "f", "m")).toBe("Напишите письмо брату от всего сердца.");
    expect(applyGender(letter[0], "m", "f")).toBe("Напишите письмо сестре от всего сердца.");
    expect(applyGender(getTheme("sibling", "kk").chapters.at(-1)!.questions.at(-1)![0], "m", "f")).toBe("Әпкеңізге не сіңліңізге шын жүректен хат жазыңыз.");
  });

  it("дочери или сыну: подарок с банком на обоих языках, род ребёнка подставляется", () => {
    for (const lang of ["ru", "kk"] as const) {
      const t = getTheme("child", lang);
      expect([t.kind, t.recipient, t.recipientGender]).toEqual(["gift", "required", undefined]);
      expect(countQuestions(t), lang).toBeGreaterThanOrEqual(45);
    }
    expect(themeChaptersByLocale("child").ru.map((c) => c.key)).toEqual(["intro", "waiting", "baby", "growing", "family", "you", "advice", "future", "thanks"]);
    const letter = getTheme("child", "ru").chapters.at(-1)!.questions.at(-1)!;
    expect(applyGender(letter[0], "f", "m")).toBe("Напишите письмо сыну от всего сердца.");
    expect(applyGender(letter[0], "m", "f")).toBe("Напишите письмо дочери от всего сердца.");
    expect(applyGender(getTheme("child", "ru").chapters[1].questions[4][1], "f", "f")).toBe("День, когда ты родилась");
    expect(applyGender(getTheme("child", "kk").chapters.at(-1)!.questions.at(-1)![1], "f", "m")).toBe("Саған хат, ұлым");
  });

  it("варианты названий ru и kk одной длины — смена языка сопоставляет их по индексу", () => {
    for (const id of themeIds) expect(getTheme(id, "kk").titleSuggestions.length, id).toBe(getTheme(id, "ru").titleSuggestions.length);
  });
});

describe("progressOf", () => {
  const p = (answered: number, total: number, words: number) => ({ answered, total, words });

  it("книга с банком — по ответам: шаг «Текст» с 10, почти готова с 25, половина — ответов не меньше половины вопросов", () => {
    expect(progressOf("gift", p(0, 172, 0))).toEqual({ started: false, half: false, ready: false, textStepDone: false, short: false });
    expect(progressOf("gift", p(9, 172, 900))).toEqual({ started: true, half: false, ready: false, textStepDone: false, short: true });
    expect(progressOf("gift", p(10, 172, 50))).toEqual({ started: true, half: false, ready: false, textStepDone: true, short: false });
    expect(progressOf("autobiography", p(30, 60, 0))).toMatchObject({ half: true, ready: true });
    expect(progressOf("gift", p(5, 10, 0))).toMatchObject({ half: true, ready: false });
  });

  it("монотонна: «почти готова» ⇒ «половина» ⇒ «начата» (у любимому готовность наступает раньше половины)", () => {
    expect(progressOf("gift", p(25, 172, 0))).toMatchObject({ started: true, half: true, ready: true });
    for (const kind of ["gift", "autobiography", "blank"] as const)
      for (const [a, t, w] of [[0, 0, 0], [1, 600, 3], [25, 172, 0], [3, 3, 3000], [2, 2, 1500]])
        {
          const r = progressOf(kind, p(a, t, w));
          if (r.ready) expect(r.half).toBe(true);
          if (r.half) expect(r.started).toBe(true);
        }
  });

  it("своя книга — по словам: 1000 — шаг «Текст» и не короткая, 1500 — половина, 3000 — почти готова", () => {
    expect(progressOf("blank", p(1, 1, 999))).toEqual({ started: true, half: false, ready: false, textStepDone: false, short: true });
    expect(progressOf("blank", p(1, 1, 1000))).toMatchObject({ textStepDone: true, short: false, half: false });
    expect(progressOf("blank", p(1, 1, 1500))).toMatchObject({ half: true, ready: false });
    expect(progressOf("blank", p(40, 40, 2999))).toMatchObject({ ready: false });
    expect(progressOf("blank", p(1, 50, 3000))).toMatchObject({ ready: true, half: true });
  });

  it("progressChanged: только при пересечении порога", () => {
    expect(progressChanged("blank", p(1, 1, 990), p(1, 1, 999))).toBe(false);
    expect(progressChanged("blank", p(1, 1, 990), p(1, 1, 1010))).toBe(true);
    expect(progressChanged("blank", p(1, 1, 3010), p(1, 1, 2990))).toBe(true);
    expect(progressChanged("gift", p(3, 100, 0), p(4, 100, 0))).toBe(false);
  });
});
