import type { Article } from "./types";

export const voprosyLyubimomu: Article = {
  slug: "voprosy-lyubimomu",
  published: "2026-10-05",
  readMinutes: 8,
  theme: "love",
  bank: { afterSection: 2, perChapter: 3, skip: ["intro", "letter"], author: "f", recipient: "m" },
  landings: ["podarok-lyubimomu", "podarok-na-godovshchinu", "podarok-muzhu", "podarok-zhene"],
  content: {
    ru: {
      title: "Вопросы любимому человеку: о любви, прошлом и мечтах",
      description: "Вопросы для пары, которые сближают: о знакомстве, первых свиданиях, мечтах и любви. Как задавать их без неловкости и как сохранить ответы в книге.",
      lead: "Даже после лет вместе остаётся многое, о чём вы не спрашивали друг друга. Вопросы помогают вспомнить, как всё начиналось, и сказать то, что редко звучит в повседневности.",
      sections: [
        {
          heading: "Зачем паре задавать друг другу вопросы",
          paragraphs: [
            "В быту мы обсуждаем дела, но редко говорим о том, что чувствуем и о чём мечтаем. Хорошие вопросы возвращают внимание друг к другу — и к истории, которая у вас общая.",
            "Для давних пар вопросы — повод вспомнить забытое: первую встречу, первую поездку, первую ссору. Для новых — быстрый способ узнать человека глубже.",
          ],
        },
        {
          heading: "Как задавать вопросы без неловкости",
          list: [
            "Выберите вечер без телефонов — за ужином или на прогулке.",
            "Начните с лёгкого: знакомство, первое впечатление, смешные случаи.",
            "Переходите к глубокому постепенно — к мечтам, страхам, благодарности.",
            "Отвечайте оба: разговор, где говорит только один, превращается в интервью.",
            "Не оценивайте ответы — важнее слушать.",
          ],
        },
        {
          heading: "Как сохранить ответы",
          paragraphs: [
            "Лучшие ответы жалко оставлять разговором. Запишите их — и получится книга о вашей паре: знакомство, свидания, поддержка, мечты.",
            "Книгу можно подарить на годовщину, день рождения или 14 февраля. Она получается личной: ваши слова, ваши фото и обложка на выбор.",
          ],
        },
      ],
      questions: { heading: "Вопросы любимому человеку по главам", intro: "Это вопросы из книги «Любимому человеку»: их можно использовать для разговора или написать на них ответы для подарочной книги." },
      faq: [
        ["С каких вопросов начать, если мы вместе недавно?", "С начала истории: как вы познакомились, что привлекло друг в друге, какое было первое впечатление. Глубокие вопросы о мечтах и ценностях оставьте на потом."],
        ["Можно ли отвечать на эти вопросы письменно?", "Да, и многим так проще. Именно так устроена книга: вы пишете ответы по главам, а потом показываете или дарите результат."],
      ],
      cta: { title: "Превратите ответы в книгу", text: "Запишите вашу историю, отвечая на тёплые вопросы по главам, добавьте фото — мы сверстаем и напечатаем книгу." },
    },
    kk: {
      title: "Сүйікті адамға қоятын сұрақтар: махаббат, өткен шақ және армандар туралы",
      description: "Жұпты жақындататын сұрақтар: танысу, алғашқы кездесулер, армандар және махаббат туралы. Оларды ыңғайсыздықсыз қою және жауаптарды кітапқа сақтау.",
      lead: "Бірге көп жыл тұрсаңыздар да, бір-біріңізден сұрамаған көп нәрсе қалады. Сұрақтар бәрі қалай басталғанын еске түсіруге және күнделікті өмірде сирек айтылатын сөздерді айтуға көмектеседі.",
      sections: [
        {
          heading: "Жұп бір-бірінен не үшін сұрақ қояды",
          paragraphs: [
            "Күнделікті өмірде біз шаруаны талқылаймыз, ал сезім мен арман туралы сирек сөйлесеміз. Жақсы сұрақтар назарды бір-біріңізге және ортақ тарихқа қайтарады.",
            "Көптен бірге жүрген жұптар үшін сұрақтар ұмытылғанды еске түсіруге себеп: алғашқы кездесу, алғашқы сапар, алғашқы ұрыс. Жаңа жұптар үшін — адамды тереңірек тануға жылдам жол.",
          ],
        },
        {
          heading: "Сұрақтарды ыңғайсыздықсыз қалай қою керек",
          list: [
            "Телефонсыз кеш таңдаңыз — кешкі асқа немесе серуенге.",
            "Жеңілден бастаңыз: танысу, алғашқы әсер, күлкілі оқиғалар.",
            "Тереңіне біртіндеп өтіңіз — армандарға, қорқыныштарға, алғысқа.",
            "Екеуіңіз де жауап беріңіздер: біреу ғана сөйлейтін әңгіме сұхбатқа айналады.",
            "Жауаптарды бағаламаңыз — тыңдау маңыздырақ.",
          ],
        },
        {
          heading: "Жауаптарды қалай сақтау керек",
          paragraphs: [
            "Ең жақсы жауаптарды әңгіме күйінде қалдыру өкінішті. Оларды жазып алыңыз — сонда жұбыңыз туралы кітап шығады: танысу, кездесулер, қолдау, армандар.",
            "Кітапты жылдыққа, туған күніне немесе 14 ақпанға сыйлауға болады. Ол жеке болып шығады: сіздің сөздеріңіз, сіздің суреттеріңіз және таңдаған мұқабаңыз.",
          ],
        },
      ],
      questions: { heading: "Сүйікті адамға қоятын сұрақтар тараулар бойынша", intro: "Бұл «Сүйікті адамға» кітабындағы сұрақтар: оларды әңгімеге қолдануға немесе сыйлық кітап үшін жауабын жазуға болады." },
      faq: [
        ["Бірге жақында ғана болсақ, қандай сұрақтардан бастау керек?", "Тарихтың басынан: қалай таныстыңыздар, бір-біріңізде не ұнады, алғашқы әсер қандай болды. Арман мен құндылықтар туралы терең сұрақтарды кейінге қалдырыңыз."],
        ["Бұл сұрақтарға жазбаша жауап беруге бола ма?", "Иә, көпшілікке солай оңай. Кітап дәл солай жасалған: сіз тараулар бойынша жазбаша жауап бересіз, ал нәтижені кейін көрсетуге немесе сыйлауға болады."],
      ],
      cta: { title: "Жауаптарды кітапқа айналдырыңыз", text: "Тарихыңызды тараулар бойынша жылы сұрақтарға жауап беріп жазыңыз, сурет қосыңыз — біз кітапты беттеп, басып шығарамыз." },
    },
    uz: {
      title: "Sevgan insoningizga savollar: muhabbat, o‘tmish va orzular haqida",
      description: "Juftlarni yaqinlashtiradigan savollar: tanishuv, birinchi uchrashuvlar, orzular va muhabbat haqida. Ularni noqulaylik sezmay so‘rash va javoblarni saqlash.",
      lead: "Yillar birga o‘tgandan keyin ham bir-biringizdan so‘ramagan ko‘p narsalar qoladi. Savollar hammasi qanday boshlanganini eslashga va kundalik hayotda kamdan-kam aytiladigan so‘zlarni aytishga yordam beradi.",
      sections: [
        {
          heading: "Juftlar nega bir-biriga savol berishi kerak",
          paragraphs: [
            "Kundalik hayotda ishlarni muhokama qilamiz, lekin his-tuyg‘ularimiz va orzularimiz haqida kamdan-kam gaplashamiz. Yaxshi savollar e’tiborni yana bir-biringizga va ikkalangizga tegishli hikoyaga qaytaradi.",
            "Uzoq yillik juftlar uchun savollar unutilganlarni eslash bahonasi: birinchi uchrashuv, birinchi safar, birinchi janjal. Yangi juftlar uchun esa insonni chuqurroq bilishning tez yo‘li.",
          ],
        },
        {
          heading: "Savollarni noqulaylik sezmay qanday so‘rash kerak",
          list: [
            "Telefonsiz kechani tanlang: kechki ovqat paytida yoki sayrda.",
            "Yengildan boshlang: tanishuv, birinchi taassurot, kulgili voqealar.",
            "Chuqurroq savollarga asta-sekin o‘ting: orzular, qo‘rquvlar, minnatdorchilik.",
            "Ikkalangiz ham javob bering: faqat bitta kishi gapiradigan suhbat intervyuga aylanib qoladi.",
            "Javoblarni baholamang: eshitish muhimroq.",
          ],
        },
        {
          heading: "Javoblarni qanday saqlash kerak",
          paragraphs: [
            "Eng yaxshi javoblarni shunchaki suhbat bo‘lib qolishiga qo‘yib bo‘lmaydi. Ularni yozib qo‘ying, shunda juftligingiz haqida kitob paydo bo‘ladi: tanishuv, uchrashuvlar, o‘zaro qo‘llab-quvvatlash, orzular.",
            "Kitobni yubileyga, tug‘ilgan kunga yoki 14 fevralga sovg‘a qilish mumkin. U shaxsiy bo‘ladi: sizning so‘zlaringiz, sizning suratlaringiz va o‘zingiz tanlagan muqova.",
          ],
        },
      ],
      questions: { heading: "Sevgan insonga bob bo‘yicha savollar", intro: "Bu «Sevgan insonga» kitobidagi savollar: ularni suhbat uchun ishlatish yoki sovg‘a kitob uchun javob yozish mumkin." },
      faq: [
        ["Agar birga bo‘lganimizga ko‘p bo‘lmagan bo‘lsa, qaysi savollardan boshlash kerak?", "Hikoyaning boshidan: qanday tanishganingiz, bir-biringizda nima yoqqani, birinchi taassurot qanday bo‘lgani. Orzular va qadriyatlar haqidagi chuqur savollarni keyinga qoldiring."],
        ["Bu savollarga yozma javob berish mumkinmi?", "Ha, ko‘pchilik uchun bu osonroq. Kitob aynan shunday tuzilgan: siz bob bo‘yicha javob yozasiz, keyin natijani ko‘rsatasiz yoki sovg‘a qilasiz."],
      ],
      cta: { title: "Javoblarni kitobga aylantiring", text: "Bob bo‘yicha iliq savollarga javob berib, hikoyangizni yozing, suratlarni qo‘shing: kitobni biz maketlab, chop etamiz." },
    },
  },
};
