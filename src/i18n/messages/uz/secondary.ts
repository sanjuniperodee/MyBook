import type { secondary as ru } from "../ru/secondary";
import { uzCount } from "../../plural";

/** Вторичные страницы витрины: каталог и рабочий лист инструментов, журнал блога. */
export const secondary: typeof ru = {
  tools: {
    hub: {
      groupsLabel: "Katalog bo‘limlari",
      groups: [
        { id: "book", title: "Kitobingiz uchun", note: "Yozishni boshlamasdan oldin tayyorgarlik ko‘ring: suratlar, hajm, muddatlar, shajara va suhbat uchun anketa." },
        { id: "family", title: "Oila va sanalar", note: "Tug‘ilgan kunlar, muchal yoshi, to‘ylar yilligi: qachon nimani nishonlash kerak va hech kimni unutmaslik." },
        { id: "talk", title: "So‘z va suhbat", note: "O‘z so‘zlaringiz bilan tabrik, suhbat uchun savollar va yaqinlarni qanchalik bilishingizni tekshiradigan testlar." },
      ],
      kind: {
        together: "Hisoblagich",
        deadline: "Muddat hisobi",
        price: "Narx hisobi",
        greeting: "Generator",
        cards: "Kartochkalar",
        quiz: "Test",
        photo: "Tekshiruv",
        pages: "Hajm hisobi",
        planner: "Reja",
        shezhire: "Plakat",
        mushel: "Hisob-kitob",
        family: "Taqvim",
        anketa: "Anketa",
      },
      count: (n: number) => uzCount(n, "ta vosita"),
      startHere: "Shundan boshlang",
      guidesNote: "Savollar to‘plami, sovg‘a g‘oyalari va yaqinlaringiz hikoyalarini qanday yozib olish bo‘yicha maslahatlar.",
      bookKicker: "Keyingi qadam",
      bookTitle: "Bu tayyorgarliklardan kitob bo‘lib chiqadi",
      bookText: "Suratlar, sanalar, shajara va savollar yozishga o‘tirganingizda asqotadi. Savollarni biz aytib turamiz, muqovani o‘zingiz tanlaysiz, bosma kitobni esa o‘zimiz yetkazamiz.",
    },
    sheet: {
      input: "Dastlabki ma’lumotlar",
      result: "Natija",
      photoEmpty: "Bu yerda har bir surat bo‘yicha tekshiruv paydo bo‘ladi: santimetrga nechta nuqta to‘g‘ri kelishi va u qanday o‘lchamgacha aniq bosilishi.",
      makeBook: "Shundan kitob yasash",
      makeBookNote: "Savollarni biz aytib turamiz, surat va muqovani o‘zingiz tanlaysiz. Kitob yozish bepul.",
    },
    page: {
      onPage: "Shu sahifada",
      tool: "Vosita",
      aboutKicker: "Bu qanday ishlaydi",
      faqKicker: "Javoblar",
      facts: ["Brauzerda ishlaydi", "Ma’lumotlar hech qayerga yuborilmaydi"],
    },
  },
  blog: {
    featured: "Asosiy maqola",
    more: "Blogdagi boshqa maqolalar",
    all: "Barcha maqolalar",
    count: (n: number) => uzCount(n, "ta maqola"),
    updated: (d: string) => `yangilangan: ${d}`,
    readNext: "Davomini o‘qish",
    startBook: "Kitobni boshlash",
    toc: "Bo‘limlarga",
    ctaKicker: "Keyingi qadam — kitob",
    published: "Chop etilgan",
    next: "Keyingi maqola",
  },
};
