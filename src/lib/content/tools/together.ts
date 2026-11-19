import type { ToolDef } from "./types";

export const dniVmeste: ToolDef = {
  slug: "dni-vmeste",
  kind: "together",
  theme: "love",
  landing: "podarok-na-godovshchinu",
  content: {
    ru: {
      label: "Сколько мы вместе",
      h1: "Сколько мы вместе:",
      accent: "счётчик дней и годовщин",
      metaTitle: "Сколько мы вместе — калькулятор дней, месяцев и лет отношений",
      metaDescription: "Укажите дату начала отношений или свадьбы — узнаете, сколько дней вы вместе, когда ближайшая круглая дата и как называется годовщина: ситцевая, бумажная, серебряная.",
      teaser: "Дни, месяцы и годы вместе, ближайшие круглые даты и название годовщины свадьбы.",
      lead: "Введите дату — и счётчик покажет, сколько дней, недель и часов вы вместе, какая годовщина ближайшая и когда отметить тысячный день. Всё считается прямо в браузере, дата никуда не отправляется.",
      sections: [
        {
          heading: "Как считаются дни вместе",
          paragraphs: [
            "Счётчик берёт день, с которого вы отсчитываете отношения — первое свидание, знакомство или свадьбу, — и считает полные дни до сегодняшнего. Годы и месяцы считаются от числа к числу: если вы начали 14 мая, то 14 мая следующего года — ровно год.",
            "Если дата выпала на 29 февраля, в невисокосные годы годовщина переносится на 28 февраля.",
          ],
        },
        {
          heading: "Какие даты стоит отмечать",
          paragraphs: [
            "Кроме годовщин, пары любят отмечать круглые числа дней: 100, 500, 1000, 5000. Тысячный день наступает примерно через 2 года и 9 месяцев — отличный повод для неожиданного подарка, когда его никто не ждёт.",
            "Круглую дату проще всего запомнить заранее: откройте счётчик, запишите в календарь день и напомните себе за две недели — на хороший подарок нужно время.",
          ],
        },
        {
          heading: "Названия годовщин свадьбы",
          paragraphs: [
            "Если вы в браке, переключите режим на «Свадьба» — счётчик покажет, как называется ваша годовщина. Традиционные названия идут от материалов: от хрупкого ситца в первый год до золота на пятидесятый — как будто брак со временем становится прочнее. Полный список — в таблице ниже.",
          ],
        },
      ],
      faq: [
        ["Как узнать, сколько дней мы вместе?", "Введите дату начала отношений в счётчик выше — он покажет дни, недели, месяцы и годы. Дата не сохраняется и никуда не отправляется: расчёт идёт в вашем браузере."],
        ["Когда наступит 1000-й день вместе?", "Через 1000 дней после выбранной даты — это примерно 2 года и 9 месяцев. Точный день счётчик показывает в списке круглых дат."],
        ["Как называется годовщина свадьбы по годам?", "1 год — ситцевая, 2 — бумажная, 3 — кожаная, 5 — деревянная, 10 — оловянная (розовая), 15 — хрустальная, 25 — серебряная, 50 — золотая. Все названия — в таблице ниже."],
        ["Что подарить на годовщину?", "Подарок, в котором есть ваша история. Например, книга: вы отвечаете на вопросы о знакомстве, первых свиданиях и мечтах, добавляете фотографии — получается вещь, которую можно перечитывать."],
      ],
      cta: { title: "Подарите книгу о вашей истории", text: "Ваша дата — уже готовая глава. Ответьте на вопросы о знакомстве и первых годах вместе, добавьте фото — мы сверстаем и напечатаем книгу. Писать можно бесплатно." },
    },
    kk: {
      label: "Бірге қанша күн",
      h1: "Бірге қанша болдық:",
      accent: "күндер мен мерейлі жылдарды санағыш",
      metaTitle: "Бірге қанша күн болдық — қарым-қатынас күндері мен жылдарын есептеу",
      metaDescription: "Қарым-қатынас немесе үйлену тойының күнін енгізіңіз — бірге қанша күн болғаныңызды, келесі айтулы күнді және неке жылдығы қалай аталатынын білесіз: бөз, қағаз, күміс.",
      teaser: "Бірге өткен күндер, айлар мен жылдар, жақын айтулы күндер және неке жылдығының атауы.",
      lead: "Күнді енгізіңіз — санағыш бірге қанша күн, апта және сағат болғаныңызды, ең жақын мерейлі күнді және мыңыншы күнді қашан атап өтуге болатынын көрсетеді. Есептеу браузерде жүреді, күн ешқайда жіберілмейді.",
      sections: [
        {
          heading: "Бірге өткен күндер қалай есептеледі",
          paragraphs: [
            "Санағыш қарым-қатынасыңызды санайтын күнді — алғашқы кездесуді, танысқан күнді немесе үйлену тойын — алып, бүгінге дейінгі толық күндерді санайды. Жылдар мен айлар күннен күнге дейін есептеледі: 14 мамырда бастасаңыз, келесі жылғы 14 мамыр — тура бір жыл.",
            "Егер күн 29 ақпанға келсе, кібісе емес жылдары мерейлі күн 28 ақпанға ауысады.",
          ],
        },
        {
          heading: "Қандай күндерді атап өткен жөн",
          paragraphs: [
            "Жылдықтардан бөлек, жұптар күндердің дөңгелек санын атап өтуді ұнатады: 100, 500, 1000, 5000. Мыңыншы күн шамамен 2 жыл 9 айдан кейін келеді — ешкім күтпеген кезде күтпеген сыйлық жасауға тамаша себеп.",
            "Дөңгелек күнді алдын ала белгілеген оңай: санағышты ашып, күнді күнтізбеге жазыңыз да, екі апта бұрын өзіңізге ескертіңіз — жақсы сыйлыққа уақыт керек.",
          ],
        },
        {
          heading: "Неке жылдықтарының атаулары",
          paragraphs: [
            "Некеде болсаңыз, режимді «Үйлену тойы» деп ауыстырыңыз — санағыш жылдығыңыздың атауын көрсетеді. Дәстүрлі атаулар материалдардан шыққан: бірінші жылғы нәзік бөзден елуінші жылғы алтынға дейін — неке уақыт өте келе беріктене түскендей. Толық тізім төмендегі кестеде.",
          ],
        },
      ],
      faq: [
        ["Бірге қанша күн болғанымызды қалай білуге болады?", "Қарым-қатынас басталған күнді жоғарыдағы санағышқа енгізіңіз — ол күндерді, апталарды, айлар мен жылдарды көрсетеді. Күн сақталмайды және ешқайда жіберілмейді: есептеу браузерде жүреді."],
        ["Бірге 1000-шы күн қашан болады?", "Таңдалған күннен 1000 күн өткенде — бұл шамамен 2 жыл 9 ай. Нақты күнді санағыш айтулы күндер тізімінде көрсетеді."],
        ["Неке жылдығы жылдар бойынша қалай аталады?", "1 жыл — бөз, 2 — қағаз, 3 — былғары, 5 — ағаш, 10 — қалайы, 15 — биллур, 25 — күміс, 50 — алтын той. Барлық атаулар төмендегі кестеде."],
        ["Мерейлі жылдыққа не сыйлау керек?", "Ішінде сіздердің тарихыңыз бар сыйлық. Мысалы, кітап: танысу, алғашқы кездесулер мен армандар туралы сұрақтарға жауап беріп, суреттер қосасыз — қайта-қайта оқуға болатын зат шығады."],
      ],
      cta: { title: "Сіздердің тарихыңыз туралы кітап сыйлаңыз", text: "Сіздің күніңіз — дайын тарау. Танысу мен бірге өткен алғашқы жылдар туралы сұрақтарға жауап беріп, сурет қосыңыз — біз кітапты беттеп, басып шығарамыз. Жазу тегін." },
    },
    uz: {
      label: "Biz qancha vaqt birgamiz",
      h1: "Biz qancha vaqt birgamiz:",
      accent: "kunlar va yubileylar hisoblagichi",
      metaTitle: "Biz qancha vaqt birgamiz — munosabat kunlari va yillari kalkulyatori",
      metaDescription: "Munosabat yoki to‘y sanasini kiriting — necha kundan beri birga ekaningizni, yaqin yaxlit sanani va yubiley nomini bilasiz: chit, qog‘oz, kumush to‘y.",
      teaser: "Birga o‘tgan kunlar, oylar va yillar, eng yaqin yaxlit sanalar va to‘y yubileyining nomi.",
      lead: "Sanani kiriting — hisoblagich necha kun, hafta va soatdan beri birga ekaningizni, eng yaqin yubiley qaysi ekanini va minginchi kunni qachon nishonlashni ko‘rsatadi. Hammasi to‘g‘ridan-to‘g‘ri brauzerda hisoblanadi, sana hech qayoqqa yuborilmaydi.",
      sections: [
        {
          heading: "Birga o‘tgan kunlar qanday hisoblanadi",
          paragraphs: [
            "Hisoblagich munosabatni sanashni boshlagan kuningizni — birinchi uchrashuv, tanishuv yoki to‘y kunini — oladi va bugungi kungacha to‘liq kunlarni hisoblaydi. Yillar va oylar sanadan sanagacha hisoblanadi: 14 mayda boshlagan bo‘lsangiz, keyingi yilning 14 mayi — roppa-rosa bir yil.",
            "Sana 29 fevralga to‘g‘ri kelsa, kabisa bo‘lmagan yillarda yubiley 28 fevralga o‘tkaziladi.",
          ],
        },
        {
          heading: "Qaysi sanalarni nishonlash kerak",
          paragraphs: [
            "Yubileylardan tashqari, juftliklar kunlarning yaxlit sonlarini nishonlashni yaxshi ko‘radi: 100, 500, 1000, 5000. Minginchi kun taxminan 2 yil 9 oydan keyin keladi — hech kim kutmagan paytda kutilmagan sovg‘a qilish uchun ajoyib bahona.",
            "Yaxlit sanani oldindan eslab qolish eng oson: hisoblagichni oching, kunni kalendarga yozib qo‘ying va ikki hafta oldin o‘zingizga eslatib qo‘ying — yaxshi sovg‘a uchun vaqt kerak.",
          ],
        },
        {
          heading: "To‘y yubileylarining nomlari",
          paragraphs: [
            "Nikohda bo‘lsangiz, rejimni «To‘y»ga o‘tkazing — hisoblagich yubileyingiz qanday atalishini ko‘rsatadi. An’anaviy nomlar materiallardan kelib chiqadi: birinchi yildagi nozik chitdan ellikinchi yildagi oltingacha — go‘yo nikoh vaqt o‘tishi bilan mustahkamlanib boradi. To‘liq ro‘yxat quyidagi jadvalda.",
          ],
        },
      ],
      faq: [
        ["Necha kundan beri birga ekanimizni qanday bilsam bo‘ladi?", "Munosabat boshlangan sanani yuqoridagi hisoblagichga kiriting — u kunlar, haftalar, oylar va yillarni ko‘rsatadi. Sana saqlanmaydi va hech qayoqqa yuborilmaydi: hisob-kitob brauzeringizda bajariladi."],
        ["Birga o‘tgan 1000-kun qachon keladi?", "Tanlangan sanadan 1000 kun o‘tgach — bu taxminan 2 yil 9 oy. Aniq kunni hisoblagich yaxlit sanalar ro‘yxatida ko‘rsatadi."],
        ["To‘y yubileyi yillar bo‘yicha qanday ataladi?", "1 yil — chit to‘y, 2 — qog‘oz, 3 — teri, 5 — yog‘och, 10 — qalay (pushti), 15 — billur, 25 — kumush, 50 — oltin. Barcha nomlar quyidagi jadvalda."],
        ["Yubileyga nima sovg‘a qilish kerak?", "Ichida sizning hikoyangiz bor sovg‘a. Masalan, kitob: tanishuv, birinchi uchrashuvlar va orzular haqidagi savollarga javob berasiz, suratlar qo‘shasiz — qayta o‘qish mumkin bo‘lgan buyum hosil bo‘ladi."],
      ],
      cta: { title: "Hikoyangiz haqida kitob sovg‘a qiling", text: "Sizning sanangiz — tayyor bob. Tanishuv va birga o‘tgan dastlabki yillar haqidagi savollarga javob bering, surat qo‘shing — kitobni biz maketlab, bosamiz. Yozish bepul." },
    },
  },
};
