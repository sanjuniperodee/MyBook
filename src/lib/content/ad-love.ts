import { toPublic, type Locale, type PublicLocale } from "@/i18n/config";

/**
 * Посадочная под таргет в Instagram (/love): книга о паре. Тексты живут здесь, а не в общем словаре —
 * страница рекламная, отдельная от SEO-посадочных, и браузеру они нужны только на ней.
 */
export interface AdLoveCopy {
  metaTitle: string;
  metaDescription: string;
  /** Первое сообщение в WhatsApp; код ссылки дописывается к нему для атрибуции в CRM. */
  waText: string;
  hero: {
    eyebrow: string;
    titleStart: string;
    titleAccent: string;
    lead: string;
    note: string;
    cta: string;
    cta2: string;
    facts: string[];
  };
  questionsLabel: (count: number) => string;
  try: {
    eyebrow: string;
    title: string;
    lead: string;
    chapterLabel: (n: number, title: string) => string;
    sample: string;
    placeholder: string;
    hint: string;
    yours: string;
    cta: string;
  };
  inside: { eyebrow: string; title: string; text: string };
  photos: { eyebrow: string; title: string; text: string; note: string };
  how: { eyebrow: string; title: string; steps: { title: string; text: string }[]; secret: string };
  price: { eyebrow: string; title: string; from: (price: string) => string; delivery: string; deadline: string; deadlineCta: string };
  faqTitle: string;
  faqExtra: [string, string];
  final: { title: string; text: string; cta: string; cta2: string };
  sticky: { from: (price: string) => string; cta: string };
}

const ru: AdLoveCopy = {
  metaTitle: "Книга о вашей любви — подарок, который пишете вы",
  metaDescription: "Отвечаете на вопросы о вашей истории, добавляете фото — мы печатаем настоящую книгу в твёрдой обложке. Алматы, доставка по Казахстану.",
  waText: "Здравствуйте! Хочу книгу о нашей истории любви",
  hero: {
    eyebrow: "Подарок на годовщину · Алматы",
    titleStart: "Книга, где главные герои —",
    titleAccent: "вы двое",
    lead: "Вы отвечаете на вопросы о вашей истории: как познакомились, что было на первом свидании, за что любите. Мы превращаем ответы и фото в настоящую книгу в твёрдой обложке.",
    note: "тут будут ваши имена",
    cta: "Узнать подробнее в WhatsApp",
    cta2: "Начать писать бесплатно",
    facts: ["Печатаем в Алматы", "5–7 рабочих дней", "Доставка по Казахстану"],
  },
  questionsLabel: (n) => `${n} вопросов внутри. Вот некоторые:`,
  try: {
    eyebrow: "Попробуйте прямо сейчас",
    title: "Одна строчка — и это уже страница",
    lead: "Ответьте на вопрос из настоящей книги. Пишете ответ — и сразу видите, как он будет напечатан.",
    chapterLabel: (n, title) => `Глава ${n} · ${title}`,
    sample: "Кок-Тобе, ветер. Ты сказал: «Смотри, весь город». А я смотрела на тебя.",
    placeholder: "Пару слов — как помните",
    hint: "Пишите так, как рассказали бы подруге. Красиво сверстаем мы.",
    yours: "это вы написали",
    cta: "Хочу всю книгу",
  },
  inside: {
    eyebrow: "Внутри",
    title: "Полистайте книгу-пример",
    text: "Каждый ответ становится частью главы: заголовок, эпиграф, буквица, фото рядом с текстом. Перед печатью вы видите точный макет каждой страницы — ровно так книга и выйдет из типографии.",
  },
  photos: {
    eyebrow: "Фотографии",
    title: "Снимки из телефона — на плотной бумаге",
    text: "Загружаете фото прямо с телефона и выбираете макет разворота. Полноцветная печать на бумаге 150 г/м², твёрдый переплёт, шитый блок — такую книгу перечитывают годами.",
    note: "тот самый день",
  },
  how: {
    eyebrow: "Как это происходит",
    title: "Пара вечеров — и подарок готов",
    steps: [
      { title: "Пишете", text: "С телефона, в своём темпе: обычно хватает двух-трёх вечеров. Всё сохраняется само, а отвечать на все вопросы не обязательно — в книгу попадут только заполненные." },
      { title: "Собираете", text: "Добавляете фото, выбираете обложку и оформление страниц. Название и имена на обложке — ваши." },
      { title: "Получаете", text: "Проверяете макет, оплачиваете — печатаем за 5–7 рабочих дней и привозим курьером или отправляем по Казахстану." },
    ],
    secret: "Сюрприз останется сюрпризом: до вручения книгу видите только вы.",
  },
  price: {
    eyebrow: "Стоимость",
    title: "Сколько стоит",
    from: (p) => `от ${p}`,
    delivery: "Курьер по Алматы и Астане, доставка по Казахстану или самовывоз из студии.",
    deadline: "Успеваете к своей дате?",
    deadlineCta: "Напишите дату — посчитаем срок",
  },
  faqTitle: "Частые вопросы",
  faqExtra: [
    "Успеете к нашей дате?",
    "Печать занимает 5–7 рабочих дней, с экспресс-печатью — 3–4. Напишите нам дату в WhatsApp — скажем, до какого дня нужно оформить заказ. Если совсем не успеваете, электронная версия будет готова сразу после оплаты.",
  ],
  final: {
    title: "Первая глава пишется сегодня вечером",
    text: "Писать можно бесплатно — платите, только когда книга готова к печати.",
    cta: "Написать в WhatsApp",
    cta2: "Начать писать",
  },
  sticky: { from: (p) => `Книга от ${p}`, cta: "WhatsApp" },
};

const kk: AdLoveCopy = {
  metaTitle: "Махаббатыңыз туралы кітап — өзіңіз жазатын сыйлық",
  metaDescription: "Тарихыңыз туралы сұрақтарға жауап бересіз, фото қосасыз — біз қатты мұқабалы нағыз кітап басып шығарамыз. Алматы, Қазақстан бойынша жеткізу.",
  waText: "Сәлеметсіз бе! Махаббат тарихымыз туралы кітап алғым келеді",
  hero: {
    eyebrow: "Мерейтойға сыйлық · Алматы",
    titleStart: "Бас кейіпкерлері —",
    titleAccent: "сіз екеуіңіз",
    lead: "Тарихыңыз туралы сұрақтарға жауап бересіз: қалай танысқансыздар, алғашқы кездесуде не болды, не үшін жақсы көресіз. Біз жауаптар мен фотоларды қатты мұқабалы нағыз кітапқа айналдырамыз.",
    note: "есімдеріңіз осында",
    cta: "WhatsApp-та толығырақ білу",
    cta2: "Тегін жаза бастау",
    facts: ["Алматыда басамыз", "5–7 жұмыс күні", "Қазақстан бойынша жеткізу"],
  },
  questionsLabel: (n) => `Ішінде ${n} сұрақ. Солардың кейбірі:`,
  try: {
    eyebrow: "Қазір байқап көріңіз",
    title: "Бір жол — және бұл енді кітап беті",
    lead: "Нағыз кітаптағы сұраққа жауап беріңіз. Жауап жазасыз — оның қалай басылатынын бірден көресіз.",
    chapterLabel: (n, title) => `${n}-тарау · ${title}`,
    sample: "Көктөбе, жел. Сен: «Қарашы, бүкіл қала», — дедің. Ал мен саған қарап тұрдым.",
    placeholder: "Есіңізде қалғандай бірер сөз",
    hint: "Құрбыңызға айтып бергендей жазыңыз. Әдемі етіп біз беттейміз.",
    yours: "мұны сіз жаздыңыз",
    cta: "Бүкіл кітапты қалаймын",
  },
  inside: {
    eyebrow: "Ішінде",
    title: "Үлгі кітапты парақтап көріңіз",
    text: "Әр жауап тараудың бөлігіне айналады: тақырып, эпиграф, бас әріп, мәтін жанында фото. Басып шығармас бұрын әр беттің нақты макетін көресіз — кітап баспаханадан дәл солай шығады.",
  },
  photos: {
    eyebrow: "Фотолар",
    title: "Телефондағы суреттер — тығыз қағазда",
    text: "Фотоларды тікелей телефоннан жүктеп, бет жайылмасының макетін таңдайсыз. 150 г/м² қағазға толық түсті басу, қатты түптеме, тігілген блок — мұндай кітапты жылдар бойы қайта оқиды.",
    note: "сол бір күн",
  },
  how: {
    eyebrow: "Қалай жасалады",
    title: "Бірнеше кеш — сыйлық дайын",
    steps: [
      { title: "Жазасыз", text: "Телефоннан, өз қарқыныңызбен: әдетте екі-үш кеш жетеді. Бәрі өздігінен сақталады, барлық сұраққа жауап беру міндетті емес — кітапқа тек толтырылғандары кіреді." },
      { title: "Құрастырасыз", text: "Фото қосып, мұқаба мен беттердің безендірілуін таңдайсыз. Мұқабадағы атау мен есімдер — сіздікі." },
      { title: "Аласыз", text: "Макетті тексеріп, төлейсіз — 5–7 жұмыс күнінде басып, курьермен жеткіземіз немесе Қазақстан бойынша жібереміз." },
    ],
    secret: "Тосынсый тосынсый болып қалады: тапсырғанға дейін кітапты тек сіз көресіз.",
  },
  price: {
    eyebrow: "Бағасы",
    title: "Қанша тұрады",
    from: (p) => `${p} бастап`,
    delivery: "Алматы мен Астанада курьер, Қазақстан бойынша жеткізу немесе студиядан алып кету.",
    deadline: "Өз күніңізге үлгересіз бе?",
    deadlineCta: "Күнін жазыңыз — мерзімін есептейміз",
  },
  faqTitle: "Жиі қойылатын сұрақтар",
  faqExtra: [
    "Біздің күнге үлгересіздер ме?",
    "Басып шығару 5–7 жұмыс күні, жедел басумен — 3–4. Күнін WhatsApp-қа жазыңыз — тапсырысты қай күнге дейін рәсімдеу керегін айтамыз. Мүлде үлгермесеңіз, электронды нұсқасы төлегеннен кейін бірден дайын болады.",
  ],
  final: {
    title: "Алғашқы тарау бүгін кешке жазылады",
    text: "Жазу тегін — кітап басуға дайын болғанда ғана төлейсіз.",
    cta: "WhatsApp-қа жазу",
    cta2: "Жаза бастау",
  },
  sticky: { from: (p) => `Кітап ${p} бастап`, cta: "WhatsApp" },
};

const uz: AdLoveCopy = {
  metaTitle: "Sevgingiz haqidagi kitob — o‘zingiz yozadigan sovg‘a",
  metaDescription: "Hikoyangiz haqidagi savollarga javob berasiz, surat qo‘shasiz — biz qattiq muqovali haqiqiy kitob bosamiz. Almaty, butun Qozog‘iston bo‘ylab yetkazib beramiz.",
  waText: "Assalomu alaykum! Sevgi hikoyamiz haqida kitob buyurtma qilmoqchiman",
  hero: {
    eyebrow: "Yilligingizga sovg‘a · Almaty",
    titleStart: "Kitob, bosh qahramonlari —",
    titleAccent: "siz ikkovingiz",
    lead: "Hikoyangiz haqidagi savollarga javob berasiz: qanday tanishgansiz, birinchi uchrashuvda nima bo‘ldi, nimasi uchun sevasiz. Biz javoblar va suratlarni qattiq muqovali haqiqiy kitobga aylantiramiz.",
    note: "bu yerda ismlaringiz bo‘ladi",
    cta: "WhatsApp orqali batafsil bilish",
    cta2: "Bepul yozishni boshlash",
    facts: ["Almatyda bosamiz", "5–7 ish kuni", "Qozog‘iston bo‘ylab yetkazib berish"],
  },
  questionsLabel: (n) => `Ichida ${n} ta savol bor. Mana ulardan bir nechtasi:`,
  try: {
    eyebrow: "Hoziroq sinab ko‘ring",
    title: "Bitta qator — va bu endi kitob sahifasi",
    lead: "Haqiqiy kitobdagi savolga javob bering. Javobni yozasiz — va uning qanday bosilishini darhol ko‘rasiz.",
    chapterLabel: (n, title) => `${n}-bob · ${title}`,
    sample: "Ko‘ktobe, shamol. Sen: «Qara, butun shahar», — deding. Men esa senga qarab turardim.",
    placeholder: "Esingizda qolganicha bir-ikki so‘z",
    hint: "Do‘stingizga aytib berganingizdek yozing. Chiroyli qilib biz sahifalaymiz.",
    yours: "buni siz yozdingiz",
    cta: "Butun kitobni xohlayman",
  },
  inside: {
    eyebrow: "Ichida",
    title: "Namuna kitobni varaqlab ko‘ring",
    text: "Har bir javob bobning bir qismiga aylanadi: sarlavha, epigraf, bosh harf, matn yonida surat. Bosishdan oldin har bir sahifaning aniq maketini ko‘rasiz — kitob bosmaxonadan aynan shunday chiqadi.",
  },
  photos: {
    eyebrow: "Suratlar",
    title: "Telefondagi suratlar — qalin qog‘ozda",
    text: "Suratlarni to‘g‘ridan-to‘g‘ri telefondan yuklab, yoyilma maketini tanlaysiz. 150 g/m² qog‘ozda to‘liq rangli bosma, qattiq muqova, tikilgan blok — bunday kitobni yillar davomida qayta o‘qiydilar.",
    note: "o‘sha bir kun",
  },
  how: {
    eyebrow: "Qanday amalga oshadi",
    title: "Bir necha oqshom — sovg‘a tayyor",
    steps: [
      { title: "Yozasiz", text: "Telefondan, o‘zingizga qulay sur’atda: odatda ikki-uch oqshom yetadi. Hammasi o‘zi saqlanadi, barcha savollarga javob berish shart emas — kitobga faqat to‘ldirilganlari kiradi." },
      { title: "Yig‘asiz", text: "Suratlar qo‘shasiz, muqova va sahifalar bezagini tanlaysiz. Muqovadagi nom va ismlar — sizniki." },
      { title: "Olasiz", text: "Maketni tekshirib, to‘lov qilasiz — 5–7 ish kunida bosamiz va kuryer orqali olib boramiz yoki Qozog‘iston bo‘ylab jo‘natamiz." },
    ],
    secret: "Syurpriz syurpriz bo‘lib qoladi: sovg‘a qilgunga qadar kitobni faqat siz ko‘rasiz.",
  },
  price: {
    eyebrow: "Narxi",
    title: "Qancha turadi",
    from: (p) => `${p} dan`,
    delivery: "Almaty va Astanada kuryer, Qozog‘iston bo‘ylab yetkazib berish yoki studiyadan olib ketish.",
    deadline: "O‘z sanangizga ulgurasizmi?",
    deadlineCta: "Sanani yozing — muddatini hisoblab beramiz",
  },
  faqTitle: "Ko‘p beriladigan savollar",
  faqExtra: [
    "Sanamizga ulgurasizlarmi?",
    "Bosish 5–7 ish kuni davom etadi, ekspress bosma bilan — 3–4 kun. Sanani bizga WhatsApp orqali yozing — buyurtmani qaysi kungacha rasmiylashtirish kerakligini aytamiz. Umuman ulgurmasangiz, elektron nusxa to‘lovdan keyin darhol tayyor bo‘ladi.",
  ],
  final: {
    title: "Birinchi bob bugun kechqurun yoziladi",
    text: "Yozish bepul — kitob bosishga tayyor bo‘lgandagina to‘laysiz.",
    cta: "WhatsApp orqali yozish",
    cta2: "Yozishni boshlash",
  },
  sticky: { from: (p) => `Kitob ${p} dan`, cta: "WhatsApp" },
};

const copy: Record<PublicLocale, AdLoveCopy> = { ru, kk, uz };

export const adLoveCopy = (locale: Locale) => copy[toPublic(locale)];
