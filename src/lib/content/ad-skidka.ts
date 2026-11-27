import { toPublic, type Locale, type PublicLocale } from "@/i18n/config";

/*
 * ─── КРЕАТИВЫ РЕКЛАМЫ ────────────────────────────────────────────────────────────────────────────────────────────
 * Слово из адреса лендинга (mybooks.kz/skidka?c=<слово>) → первое сообщение в WhatsApp. Новый креатив — одна строка
 * здесь (слово — латиницей в нижнем регистре); больше на странице ничего менять не нужно. Нет слова или оно
 * неизвестное — AD_DEFAULT_TEXT. Регистр в адресе не важен.
 */
export const AD_CREATIVES: Readonly<Record<string, string>> = {
  nurtik: "Здравствуйте! Хочу книгу в подарок. Подскажите, как заказать?",
  predmetnaya: "Здравствуйте! Интересует книга в подарок. Хочу узнать подробности.",
  novyigod: "Здравствуйте! Хочу книгу в подарок на Новый год.",
  smmsidya: "Здравствуйте! Хочу заказать книгу в подарок. Расскажите, как это работает.",
};
export const AD_DEFAULT_TEXT = "Здравствуйте! Хочу книгу";
/* ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Первое сообщение в WhatsApp по слову креатива (?c=) — ровно эта фраза, без приписок. */
export function adCreativeText(c: string | null | undefined): string {
  const key = (c ?? "").trim().toLowerCase();
  return key && Object.prototype.hasOwnProperty.call(AD_CREATIVES, key) ? AD_CREATIVES[key] : AD_DEFAULT_TEXT;
}

/**
 * Лендинг под рекламу в Instagram (/skidka): одно действие — написать в WhatsApp. Текст первого сообщения — по
 * креативу (AD_CREATIVES); с какой рекламы заявка, CRM находит по времени нажатия кнопки (landing_visits).
 */
export interface AdSkidkaCopy {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  titleStart: string;
  titleAccent: string;
  lead: string;
  cta: string;
  /** Под кнопкой: что будет после нажатия. */
  ctaNote: string;
  facts: (days: string) => string[];
  stepsTitle: string;
  steps: { title: string; text: string }[];
  bookNote: string;
  finalTitle: string;
  finalText: string;
  sticky: string;
}

const ru: AdSkidkaCopy = {
  metaTitle: "Книга в подарок, которую пишете вы",
  metaDescription: "Ответы на вопросы о близком человеке и ваши фото — в настоящей книге в твёрдой обложке. Напишите нам в WhatsApp.",
  eyebrow: "Подарок, который пишете вы · Алматы",
  titleStart: "Книга, где главный герой —",
  titleAccent: "тот, кого вы любите",
  lead: "Вы отвечаете на вопросы о близком человеке и добавляете фото. Мы печатаем настоящую книгу в твёрдой обложке.",
  cta: "Написать в WhatsApp",
  ctaNote: "Откроется WhatsApp с готовым сообщением — его остаётся только отправить",
  facts: (days) => ["Печатаем в Алматы", `${days} рабочих дней`, "Доставка по Казахстану"],
  stepsTitle: "Как это работает",
  steps: [
    { title: "Напишите нам", text: "Ответим в WhatsApp, подскажем тему и обложку — маме, любимому, другу." },
    { title: "Заполните книгу", text: "Отвечаете на вопросы и добавляете фото с телефона, в своём темпе." },
    { title: "Получите подарок", text: "Проверяете макет — печатаем и доставляем по Казахстану." },
  ],
  bookNote: "здесь будет ваша история",
  finalTitle: "Расскажите, кому подарок",
  finalText: "Писать книгу можно бесплатно — платите, когда она готова к печати.",
  sticky: "Книга в подарок",
};

const kk: AdSkidkaCopy = {
  metaTitle: "Өзіңіз жазатын сыйлық кітап",
  metaDescription: "Жақын адам туралы сұрақтарға жауаптар мен фотоларыңыз — қатты мұқабалы нағыз кітапта. WhatsApp-қа жазыңыз.",
  eyebrow: "Өзіңіз жазатын сыйлық · Алматы",
  titleStart: "Бас кейіпкері —",
  titleAccent: "сіз жақсы көретін адам",
  lead: "Жақын адамыңыз туралы сұрақтарға жауап бересіз, фото қосасыз. Біз қатты мұқабалы нағыз кітап басып шығарамыз.",
  cta: "WhatsApp-қа жазу",
  ctaNote: "WhatsApp дайын хабарламамен ашылады — тек жіберу қалады",
  facts: (days) => ["Алматыда басамыз", `${days} жұмыс күні`, "Қазақстан бойынша жеткізу"],
  stepsTitle: "Бұл қалай жұмыс істейді",
  steps: [
    { title: "Бізге жазыңыз", text: "WhatsApp-та жауап береміз, тақырып пен мұқабаны ұсынамыз — анаңызға, сүйіктіңізге, досыңызға." },
    { title: "Кітапты толтырыңыз", text: "Сұрақтарға жауап беріп, телефоннан фото қосасыз — өз қарқыныңызбен." },
    { title: "Сыйлықты алыңыз", text: "Макетті тексересіз — басып шығарып, Қазақстан бойынша жеткіземіз." },
  ],
  bookNote: "мұнда сіздің тарихыңыз болады",
  finalTitle: "Сыйлық кімге екенін айтыңыз",
  finalText: "Кітапты жазу тегін — ол басуға дайын болғанда төлейсіз.",
  sticky: "Сыйлық кітап",
};

const uz: AdSkidkaCopy = {
  metaTitle: "O‘zingiz yozadigan sovg‘a kitob",
  metaDescription: "Yaqin inson haqidagi savollarga javoblar va suratlaringiz — qattiq muqovali haqiqiy kitobda. WhatsApp’ga yozing.",
  eyebrow: "O‘zingiz yozadigan sovg‘a · Olmaota",
  titleStart: "Bosh qahramoni —",
  titleAccent: "siz sevgan inson",
  lead: "Yaqin insoningiz haqidagi savollarga javob berasiz va surat qo‘shasiz. Biz qattiq muqovali haqiqiy kitob chop etamiz.",
  cta: "WhatsApp’ga yozish",
  ctaNote: "WhatsApp tayyor xabar bilan ochiladi — faqat yuborish qoladi",
  facts: (days) => ["Olmaotada chop etamiz", `${days} ish kuni`, "Qozog‘iston bo‘ylab yetkazish"],
  stepsTitle: "Bu qanday ishlaydi",
  steps: [
    { title: "Bizga yozing", text: "WhatsApp’da javob beramiz, mavzu va muqovani taklif qilamiz — onangizga, sevgan insoningizga, do‘stingizga." },
    { title: "Kitobni to‘ldiring", text: "Savollarga javob berasiz va telefondan surat qo‘shasiz — o‘z sur’atingizda." },
    { title: "Sovg‘ani oling", text: "Maketni tekshirasiz — chop etamiz va Qozog‘iston bo‘ylab yetkazamiz." },
  ],
  bookNote: "bu yerda sizning tarixingiz bo‘ladi",
  finalTitle: "Sovg‘a kimga ekanini ayting",
  finalText: "Kitobni yozish bepul — u chop etishga tayyor bo‘lganda to‘laysiz.",
  sticky: "Sovg‘a kitob",
};

const en: AdSkidkaCopy = {
  metaTitle: "A gift book you write yourself",
  metaDescription: "Answers to questions about someone close to you and your photos — in a real hardcover book. Message us on WhatsApp.",
  eyebrow: "A gift you write yourself · Almaty",
  titleStart: "A book where the main character is",
  titleAccent: "the one you love",
  lead: "You answer questions about someone close to you and add photos. We print a real hardcover book.",
  cta: "Message us on WhatsApp",
  ctaNote: "WhatsApp opens with a ready message — all that’s left is to send it",
  facts: (days) => ["Printed in Almaty", `${days} working days`, "Delivery across Kazakhstan"],
  stepsTitle: "How it works",
  steps: [
    { title: "Message us", text: "We reply on WhatsApp and suggest a theme and a cover — for mum, your partner, a friend." },
    { title: "Fill in the book", text: "Answer the questions and add photos from your phone, at your own pace." },
    { title: "Get the gift", text: "Check the layout — we print it and deliver across Kazakhstan." },
  ],
  bookNote: "your story goes here",
  finalTitle: "Tell us who the gift is for",
  finalText: "Writing the book is free — you pay when it’s ready to print.",
  sticky: "A gift book",
};

const copy: Record<PublicLocale, AdSkidkaCopy> = { ru, kk, uz, en };

export const adSkidkaCopy = (locale: Locale) => copy[toPublic(locale)];
