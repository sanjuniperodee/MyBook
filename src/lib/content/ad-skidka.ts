import { toPublic, type Locale, type PublicLocale } from "@/i18n/config";

/**
 * Лендинг под рекламу в Instagram (/skidka): одно действие — написать в WhatsApp за скидкой. Код перехода дописывается
 * к первому сообщению и показан на странице как «код скидки»: так клиент реже его стирает, а CRM видит источник заявки.
 */
export interface AdSkidkaCopy {
  metaTitle: string;
  metaDescription: string;
  /** Первое сообщение в WhatsApp; к нему дописывается «(код: lp…)». */
  waText: string;
  eyebrow: string;
  titleStart: string;
  titleAccent: string;
  lead: string;
  cta: string;
  /** Под кнопкой: что будет после нажатия. */
  ctaNote: string;
  /** Подпись к коду перехода — «талон» скидки. */
  codeLabel: string;
  codeHint: string;
  facts: (days: string) => string[];
  stepsTitle: string;
  steps: { title: string; text: string }[];
  bookNote: string;
  finalTitle: string;
  finalText: string;
  sticky: string;
}

const ru: AdSkidkaCopy = {
  metaTitle: "Скидка на книгу о близком человеке",
  metaDescription: "Книга, которую пишете вы: ответы на вопросы и фото — в твёрдой обложке. Напишите в WhatsApp — менеджер назовёт скидку.",
  waText: "Здравствуйте, хочу скидку!",
  eyebrow: "Скидка из Instagram · Алматы",
  titleStart: "Книга о тех, кого любите, —",
  titleAccent: "со скидкой",
  lead: "Вы отвечаете на вопросы о близком человеке и добавляете фото. Мы печатаем настоящую книгу в твёрдой обложке.",
  cta: "Получить скидку в WhatsApp",
  ctaNote: "Откроется WhatsApp с готовым сообщением — его остаётся только отправить",
  codeLabel: "Код скидки",
  codeHint: "уже в сообщении",
  facts: (days) => ["Печатаем в Алматы", `${days} рабочих дней`, "Доставка по Казахстану"],
  stepsTitle: "Как получить скидку",
  steps: [
    { title: "Нажмите кнопку", text: "Откроется WhatsApp MyBooks с сообщением и кодом скидки." },
    { title: "Отправьте сообщение", text: "Менеджер ответит и назовёт вашу скидку." },
    { title: "Расскажите, кому книга", text: "Маме, любимому, другу — подскажем тему и обложку." },
  ],
  bookNote: "здесь будет ваша история",
  finalTitle: "Скидка ждёт в WhatsApp",
  finalText: "Писать книгу можно бесплатно — платите, когда она готова к печати.",
  sticky: "Скидка в WhatsApp",
};

const kk: AdSkidkaCopy = {
  metaTitle: "Жақын адам туралы кітапқа жеңілдік",
  metaDescription: "Өзіңіз жазатын кітап: сұрақтарға жауаптар мен фото — қатты мұқабада. WhatsApp-қа жазыңыз — менеджер жеңілдікті айтады.",
  waText: "Сәлеметсіз бе, жеңілдік алғым келеді!",
  eyebrow: "Instagram-нан жеңілдік · Алматы",
  titleStart: "Жақсы көретін адамыңыз туралы кітап —",
  titleAccent: "жеңілдікпен",
  lead: "Жақын адамыңыз туралы сұрақтарға жауап бересіз, фото қосасыз. Біз қатты мұқабалы нағыз кітап басып шығарамыз.",
  cta: "WhatsApp-та жеңілдік алу",
  ctaNote: "WhatsApp дайын хабарламамен ашылады — тек жіберу қалады",
  codeLabel: "Жеңілдік коды",
  codeHint: "хабарламада бар",
  facts: (days) => ["Алматыда басамыз", `${days} жұмыс күні`, "Қазақстан бойынша жеткізу"],
  stepsTitle: "Жеңілдікті қалай алуға болады",
  steps: [
    { title: "Батырманы басыңыз", text: "MyBooks WhatsApp-ы хабарлама мен жеңілдік кодымен ашылады." },
    { title: "Хабарламаны жіберіңіз", text: "Менеджер жауап беріп, жеңілдігіңізді айтады." },
    { title: "Кітап кімге екенін айтыңыз", text: "Анаңызға, сүйіктіңізге, досыңызға — тақырып пен мұқабаны ұсынамыз." },
  ],
  bookNote: "мұнда сіздің тарихыңыз болады",
  finalTitle: "Жеңілдік WhatsApp-та күтіп тұр",
  finalText: "Кітапты жазу тегін — ол басуға дайын болғанда төлейсіз.",
  sticky: "WhatsApp-та жеңілдік",
};

const uz: AdSkidkaCopy = {
  metaTitle: "Yaqin inson haqidagi kitobga chegirma",
  metaDescription: "O‘zingiz yozadigan kitob: savollarga javoblar va suratlar — qattiq muqovada. WhatsApp’ga yozing — menejer chegirmani aytadi.",
  waText: "Assalomu alaykum, chegirma olmoqchiman!",
  eyebrow: "Instagram’dan chegirma · Olmaota",
  titleStart: "Siz sevgan inson haqida kitob —",
  titleAccent: "chegirma bilan",
  lead: "Yaqin insoningiz haqidagi savollarga javob berasiz va surat qo‘shasiz. Biz qattiq muqovali haqiqiy kitob chop etamiz.",
  cta: "WhatsApp’da chegirma olish",
  ctaNote: "WhatsApp tayyor xabar bilan ochiladi — faqat yuborish qoladi",
  codeLabel: "Chegirma kodi",
  codeHint: "xabarda bor",
  facts: (days) => ["Olmaotada chop etamiz", `${days} ish kuni`, "Qozog‘iston bo‘ylab yetkazish"],
  stepsTitle: "Chegirmani qanday olish mumkin",
  steps: [
    { title: "Tugmani bosing", text: "MyBooks WhatsApp’i xabar va chegirma kodi bilan ochiladi." },
    { title: "Xabarni yuboring", text: "Menejer javob beradi va chegirmangizni aytadi." },
    { title: "Kitob kimga ekanini ayting", text: "Onangizga, sevgan insoningizga, do‘stingizga — mavzu va muqovani taklif qilamiz." },
  ],
  bookNote: "bu yerda sizning tarixingiz bo‘ladi",
  finalTitle: "Chegirma WhatsApp’da kutmoqda",
  finalText: "Kitobni yozish bepul — u chop etishga tayyor bo‘lganda to‘laysiz.",
  sticky: "WhatsApp’da chegirma",
};

const en: AdSkidkaCopy = {
  metaTitle: "A discount on a book about someone you love",
  metaDescription: "A book you write yourself: answers to questions and photos, in a hardcover. Message us on WhatsApp and a manager will tell you your discount.",
  waText: "Hello, I’d like the discount!",
  eyebrow: "Instagram discount · Almaty",
  titleStart: "A book about the people you love —",
  titleAccent: "at a discount",
  lead: "You answer questions about someone close to you and add photos. We print a real hardcover book.",
  cta: "Get the discount on WhatsApp",
  ctaNote: "WhatsApp opens with a ready message — all that’s left is to send it",
  codeLabel: "Discount code",
  codeHint: "already in the message",
  facts: (days) => ["Printed in Almaty", `${days} working days`, "Delivery across Kazakhstan"],
  stepsTitle: "How to get the discount",
  steps: [
    { title: "Tap the button", text: "MyBooks WhatsApp opens with a message and your discount code." },
    { title: "Send the message", text: "A manager replies and tells you your discount." },
    { title: "Tell us who it’s for", text: "Mum, your partner, a friend — we’ll suggest a theme and a cover." },
  ],
  bookNote: "your story goes here",
  finalTitle: "Your discount is waiting on WhatsApp",
  finalText: "Writing the book is free — you pay when it’s ready to print.",
  sticky: "Discount on WhatsApp",
};

const copy: Record<PublicLocale, AdSkidkaCopy> = { ru, kk, uz, en };

export const adSkidkaCopy = (locale: Locale) => copy[toPublic(locale)];
