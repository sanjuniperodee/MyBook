import type { bookStudio as ru } from "../ru/book-studio";
import { uzCount } from "../../plural";

export const bookStudio: typeof ru = {
  nav: {
    aria: "Kitob yo‘li",
    back: "Mening kitoblarim",
    overview: "Umumiy ko‘rinish",
    steps: { questions: "Savollar", text: "Matn", photos: "Suratlar", pages: "Sahifalar", cover: "Muqova", preview: "Maket", order: "Buyurtma" },
    /** Kitob sarlavhasidagi besh qadam: muqova va sahifalar — «Bezash», maket va buyurtma — «Buyurtma berish». */
    groups: { write: "Yozish", photos: "Suratlar", design: "Bezash", order: "Buyurtma berish" },
    designSwitch: { aria: "Nimani bezaymiz", cover: "Muqova", pages: "Sahifalar" },
    extrasAria: "Xatlar va sozlamalar",
    /** Макет и 3D-книга — всегда на виду: вкладка в ленте книги и кнопка под обложкой в обзоре. */
    previewTab: "Maket va 3D",
    previewCta: "Maket va 3D-kitobni ko‘rish",
    letters: "Xatlar",
    settings: "Sozlamalar",
    /** Ekran o‘qigich uchun: qadam holati (rang — yagona belgi emas). */
    state: { done: "tayyor", partial: "jarayonda", todo: "boshlanmagan", attention: "tuzatish kerak" },
    badge: { writing: "Yozilmoqda", ready: "Buyurtmaga tayyor" },
  },
  hub: {
    facts: { aria: "Kitob raqamlarda", pages: "Sahifa", answers: "Javob", sections: "Bo‘lim", words: "So‘z", photos: "Surat", of: (total: number) => `${total} tadan` },
    next: {
      label: "Keyingi qadam",
      coverTitle: "Muqovani tugallang",
      openCover: "Muqovani ochish",
      readyEyebrow: "Kitob buyurtmaga tayyor",
      readyTitle: "Maketni tekshiring va buyurtma bering",
      readyText: "Maket — bosmaga ketadigan o‘sha sahifalar. Buyurtmadan keyin kitobni tahrirlab bo‘lmaydi.",
      order: "Buyurtma berish",
      openPreview: "Maketni ochish",
      moreToWrite: (n: number) => `Yana yozish mumkin: javobsiz ${uzCount(n, "ta savol")}`,
      keepWriting: "Yozishda davom etish",
      orderedEyebrow: (n: number) => `Buyurtma №${n}`,
      orderedPayTitle: "Buyurtma to‘lovni kutmoqda",
      orderedPayText: "Buyurtmani to‘lang — kitob bosmaga ketadi.",
      openOrder: "Buyurtmani ochish",
      orderedNoOrder: "Kitob ishga topshirildi",
      reopenedText: "Kitob shu buyurtma bo‘yicha tuzatishlarga ochiq — tuzatishlar unga kiradi, qayta buyurtma berish shart emas.",
    },
    path: {
      title: "Kitob yo‘li",
      aria: "Kitob ustida ishlash qadamlari",
      photosHint: "Suratlarsiz kitob faqat matndan iborat bo‘ladi",
      previewValue: "Sahifalar bosiladigan ko‘rinishda",
      orderLater: "maket tekshirilgandan keyin",
      actions: { start: "Boshlash", continue: "Davom etish", add: "Qo‘shish", manage: "Boshqarish", change: "O‘zgartirish", fix: "Tuzatish", open: "Ochish", order: "Buyurtma berish", openOrder: "Buyurtmani ochish", pay: "To‘lash" },
    },
    needs: { errors: "Buyurtmagacha yetishmaydi", warnings: "Tekshirib ko‘rish kerak", fix: "Tuzatish" },
    lower: {
      lettersTitle: "Yaqinlar xatlari",
      lettersEmpty: "Do‘stlaringiz va yaqinlaringizni taklif qiling: ularning xatlari kitobga alohida bob bo‘lib kiradi.",
      lettersInvited: "Havola yuborildi — xatlar shu yerda paydo bo‘ladi, qaysilari kitobga kirishini esa siz hal qilasiz.",
      lettersState: (approved: number, pending: number) => [approved ? `${approved} tasi kitobda` : "", pending ? `${pending} tasi qarorni kutmoqda` : ""].filter(Boolean).join(", "),
      lettersCreate: "Havola yaratish",
      lettersOpen: "Xatlarni ochish",
      lettersReview: (n: number) => `Xatlarni ko‘rib chiqish (${n})`,
      photosTitle: "Suratlar",
      photosEmpty: "Hozircha suratlar yo‘q. Ularni qo‘shing — ular boblar va muqovani bezaydi.",
      photosAdd: "Surat qo‘shish",
      settingsTitle: "Sozlamalar",
      settingsOpen: "O‘zgartirish",
      helpTitle: "Yordam kerakmi?",
    },
  },
  /** Yaqinlar xatlari: xatlar ro‘yxati va taklif. */
  letters: {
    lead: "Do‘stlar va yaqinlar havola orqali yozadi, qaysi xatlar kitobga kirishini esa siz hal qilasiz.",
    all: "Hammasi",
    status: { pending: "Yangi", approved: "Kitobda", hidden: "Yashirilgan" },
    readMore: "To‘liq o‘qish",
    collapse: "Yig‘ish",
    inviteLead: "Yaqinlar uchun havola",
    countLine: (n: number) => uzCount(n, "ta xat"),
  },
  /** Kitob sozlamalari: bo‘limlar langarlari. */
  settings: {
    anchors: "Sozlamalar bo‘limlari",
    format: "Format",
    saveHint: "O‘zgarishlar o‘zi saqlanadi",
  },
  /** Maket o‘quvchisi. */
  reader: {
    tabs: { read: "O‘qish", model: "3D-kitob" },
    spreadMode: "Yoyilmalar bo‘yicha",
    scrollMode: "Barcha sahifalar ketma-ket",
    of: (n: number) => `${n} tadan`,
    hint: "Sahifani bosib, o‘qlar, surish yoki sirpanuvchi yordamida varaqlang",
    endTitle: "Bu oxirgi sahifa",
    endText: "Hammasi joyidami? Unda buyurtma bering: kitob aynan shunday bosmaga ketadi.",
  },
  /** To‘lov: usullar. */
  pay: {
    method: "To‘lov usuli",
    kaspi: "Kaspi",
    card: "Bank kartasi",
    transfer: "Rekvizitlar bo‘yicha o‘tkazma",
  },
};
