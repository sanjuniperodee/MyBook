import { toPublic, type Locale, type PublicLocale } from "@/i18n/config";

/** Фраза первого сообщения: по-русски и по-казахски (kk — после согласования с владельцем; пока нет — русская). */
export interface AdPhrase {
  ru: string;
  kk?: string;
}

/*
 * ─── КРЕАТИВЫ РЕКЛАМЫ ────────────────────────────────────────────────────────────────────────────────────────────
 * Слово из адреса лендинга (mybooks.kz/skidka?c=<слово>) → первое сообщение в WhatsApp на языке страницы. Новый
 * креатив — одна строка здесь (слово — латиницей в нижнем регистре); больше на странице ничего менять не нужно. Нет
 * слова или оно неизвестное — AD_DEFAULT_TEXT. Регистр в адресе не важен.
 */
export const AD_CREATIVES: Readonly<Record<string, AdPhrase>> = {
  nurtik: { ru: "Здравствуйте! Хочу книгу в подарок. Подскажите, как заказать?" },
  predmetnaya: { ru: "Здравствуйте! Интересует книга в подарок. Хочу узнать подробности." },
  novyigod: { ru: "Здравствуйте! Хочу книгу в подарок на Новый год." },
  smmsidya: { ru: "Здравствуйте! Хочу заказать книгу в подарок. Расскажите, как это работает." },
};
export const AD_DEFAULT_TEXT: AdPhrase = { ru: "Здравствуйте! Хочу книгу" };
/* ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Первое сообщение в WhatsApp по слову креатива (?c=) на языке страницы — ровно эта фраза, без приписок. */
export function adCreativeText(c: string | null | undefined, locale: Locale = "ru"): string {
  const key = (c ?? "").trim().toLowerCase();
  const phrase = key && Object.prototype.hasOwnProperty.call(AD_CREATIVES, key) ? AD_CREATIVES[key] : AD_DEFAULT_TEXT;
  return (toPublic(locale) === "kk" ? phrase.kk : null) ?? phrase.ru;
}

/** Видео лендинга: файл mp4 и обложка WebP — в mybook-web/public/lp/skidka (сжимает scripts/landing-media.sh). */
export interface AdVideo {
  src: string;
  poster: string;
  /** Ширина к высоте; по умолчанию вертикальное 9:16. */
  aspect?: number;
  name?: string;
  city?: string;
}

/*
 * ─── МАТЕРИАЛЫ ЛЕНДИНГА ──────────────────────────────────────────────────────────────────────────────────────────
 * Блоки страницы по порядку: видео-отзывы (3–6), текстовые отзывы (4–6), «Живой обзор» (одно видео до минуты),
 * примеры книг (3–4 фото). Пустой список — блока на странице нет. Только настоящие отзывы и фото клиентов MyBooks.
 */
export const AD_LANDING_MEDIA: {
  videoReviews: AdVideo[];
  textReviews: { name: string; city: string; text: string }[];
  liveReview: AdVideo | null;
  bookPhotos: { src: string; alt: string }[];
} = {
  videoReviews: [],
  textReviews: [],
  liveReview: null,
  bookPhotos: [],
};
/* ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

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
  facts: string[];
  videoReviewsTitle: string;
  textReviewsTitle: string;
  liveTitle: string;
  liveText: string;
  examplesTitle: string;
  /** Подпись кнопки запуска видео (для экранного диктора). */
  play: string;
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
  eyebrow: "Подарок, который пишете вы",
  titleStart: "Книга, где главный герой —",
  titleAccent: "тот, кого вы любите",
  lead: "Вы отвечаете на вопросы о близком человеке и добавляете фото. Мы печатаем настоящую книгу в твёрдой обложке.",
  cta: "Написать в WhatsApp",
  ctaNote: "Откроется WhatsApp с готовым сообщением — его остаётся только отправить",
  facts: ["Твёрдая обложка", "Ваши фото внутри", "Доставка по Казахстану"],
  videoReviewsTitle: "Как дарят наши книги",
  textReviewsTitle: "Что пишут клиенты",
  liveTitle: "Живой обзор",
  liveText: "Книга без фильтров: страницы, переплёт, фото.",
  examplesTitle: "Примеры книг",
  play: "Смотреть видео",
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
  eyebrow: "Өзіңіз жазатын сыйлық",
  titleStart: "Бас кейіпкері —",
  titleAccent: "сіз жақсы көретін адам",
  lead: "Жақын адамыңыз туралы сұрақтарға жауап бересіз, фото қосасыз. Біз қатты мұқабалы нағыз кітап басып шығарамыз.",
  cta: "WhatsApp-қа жазу",
  ctaNote: "WhatsApp дайын хабарламамен ашылады — тек жіберу қалады",
  facts: ["Қатты мұқаба", "Ішінде сіздің фотоларыңыз", "Қазақстан бойынша жеткізу"],
  videoReviewsTitle: "Кітаптарымызды қалай сыйлайды",
  textReviewsTitle: "Клиенттер не дейді",
  liveTitle: "Тірі шолу",
  liveText: "Сүзгісіз кітап: беттері, мұқабасы, фотолары.",
  examplesTitle: "Кітап үлгілері",
  play: "Бейнені көру",
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
  eyebrow: "O‘zingiz yozadigan sovg‘a",
  titleStart: "Bosh qahramoni —",
  titleAccent: "siz sevgan inson",
  lead: "Yaqin insoningiz haqidagi savollarga javob berasiz va surat qo‘shasiz. Biz qattiq muqovali haqiqiy kitob chop etamiz.",
  cta: "WhatsApp’ga yozish",
  ctaNote: "WhatsApp tayyor xabar bilan ochiladi — faqat yuborish qoladi",
  facts: ["Qattiq muqova", "Ichida sizning suratlaringiz", "Qozog‘iston bo‘ylab yetkazish"],
  videoReviewsTitle: "Kitoblarimizni qanday sovg‘a qilishadi",
  textReviewsTitle: "Mijozlar fikri",
  liveTitle: "Jonli ko‘rib chiqish",
  liveText: "Filtrsiz kitob: sahifalar, muqova, suratlar.",
  examplesTitle: "Kitob namunalari",
  play: "Videoni ko‘rish",
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
  eyebrow: "A gift you write yourself",
  titleStart: "A book where the main character is",
  titleAccent: "the one you love",
  lead: "You answer questions about someone close to you and add photos. We print a real hardcover book.",
  cta: "Message us on WhatsApp",
  ctaNote: "WhatsApp opens with a ready message — all that’s left is to send it",
  facts: ["Hardcover", "Your photos inside", "Delivery across Kazakhstan"],
  videoReviewsTitle: "How our books are given",
  textReviewsTitle: "What customers say",
  liveTitle: "Live walkthrough",
  liveText: "The book without filters: pages, binding, photos.",
  examplesTitle: "Book examples",
  play: "Watch the video",
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
