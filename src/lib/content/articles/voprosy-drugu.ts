import type { Article } from "./types";

export const voprosyDrugu: Article = {
  slug: "voprosy-drugu",
  published: "2026-10-05",
  readMinutes: 6,
  theme: "friend",
  bank: { afterSection: 2, perChapter: 3, skip: ["intro"], author: "f", recipient: "f" },
  landings: ["kniga-drugu"],
  content: {
    ru: {
      title: "Вопросы другу или подруге: как узнать друг друга лучше",
      description: "Вопросы для друга и подруги: о знакомстве, приключениях, шутках для своих и благодарности. Как провести разговор и сохранить ответы в книге о вашей дружбе.",
      lead: "С друзьями мы смеёмся и поддерживаем друг друга — а иногда годами не говорим о важном. Вопросы помогают вспомнить, как всё началось, и сказать «спасибо» без пафоса.",
      sections: [
        {
          heading: "Зачем спрашивать близкого друга",
          paragraphs: [
            "Со временем друзья становятся как родные, и кажется, что мы знаем о них всё. Но самые тёплые разговоры часто начинаются с простого вопроса: «Помнишь, как мы познакомились?»",
            "Вопросы о дружбе напоминают, сколько вы прошли вместе, и возвращают тепло, которое теряется в суете.",
          ],
        },
        {
          heading: "Как провести разговор",
          list: [
            "Выберите повод: встреча в кафе, поездка, день рождения друга.",
            "Начинайте с воспоминаний — смешные истории сближают лучше всего.",
            "Добавляйте юмор: дружеский разговор не должен быть слишком серьёзным.",
            "Общие фотографии из архива помогут вспомнить забытое.",
            "Скажите «спасибо» вслух — друзья слышат это реже, чем близкие родственники.",
          ],
        },
        {
          heading: "Как сохранить вашу историю",
          paragraphs: [
            "Дружба — тоже история, достойная книги. Запишите ответы, добавьте общие фото, и получится подарок, который друг перечитает через годы.",
            "Книга хорошо подходит на день рождения, выпускной, прощание перед переездом или просто как знак внимания.",
          ],
        },
      ],
      questions: { heading: "Вопросы другу или подруге по главам", intro: "Это вопросы из книги «Другу или подруге»: их можно задать в разговоре или ответить на них письменно для подарочной книги." },
      faq: [
        ["Подойдёт ли это для друга-мужчины?", "Да. Вопросы нейтральные, а формулировки подстраиваются под пол адресата. Тон книги вы выбираете сами — от шутливого до тёплого."],
        ["Можно ли собрать письма от других друзей?", "Да. Пригласите общих друзей по ссылке — их письма войдут в книгу отдельной главой."],
      ],
      cta: { title: "Превратите ответы в книгу", text: "Запишите историю вашей дружбы, добавьте общие фото и выберите обложку — мы напечатаем настоящую книгу." },
    },
    kk: {
      title: "Досқа немесе құрбыға қоятын сұрақтар: бір-бірін жақсы тану жолдары",
      description: "Дос пен құрбыға арналған сұрақтар: танысу, қызықты оқиғалар, өзара әзілдер және алғыс туралы. Әңгімені қалай өткізу және жауаптарды достық туралы кітапқа сақтау.",
      lead: "Достарымызбен күлеміз, бір-бірімізді қолдаймыз — ал кейде жылдар бойы маңызды нәрсе туралы сөйлеспейміз. Сұрақтар бәрі қалай басталғанын еске түсіріп, «рахмет» дегенді пафоссыз айтуға көмектеседі.",
      sections: [
        {
          heading: "Жақын досыңыздан не үшін сұрау керек",
          paragraphs: [
            "Уақыт өте достар туыстай болып кетеді де, олар туралы бәрін білетіндей көрінеді. Бірақ ең жылы әңгімелер көбіне қарапайым сұрақтан басталады: «Қалай танысқанымыз есіңде ме?»",
            "Достық туралы сұрақтар бірге қанша жол жүргеніңізді еске салады және күйбең тірлікте жоғалатын жылуды қайтарады.",
          ],
        },
        {
          heading: "Әңгімені қалай өткізу керек",
          list: [
            "Себеп таңдаңыз: кафеде кездесу, сапар, достың туған күні.",
            "Естеліктерден бастаңыз — күлкілі оқиғалар ең жақсы жақындастырады.",
            "Әзіл қосыңыз: достық әңгіме тым салмақты болмауы керек.",
            "Ортақ архивтегі суреттер ұмытылғанды еске түсіруге көмектеседі.",
            "«Рахмет» дегенді дауыстап айтыңыз — достар мұны жақын туыстарға қарағанда сирек естиді.",
          ],
        },
        {
          heading: "Тарихыңызды қалай сақтау керек",
          paragraphs: [
            "Достық та кітапқа лайық тарих. Жауаптарды жазыңыз, ортақ суреттер қосыңыз — сонда дос жылдар өткенде қайта оқитын сыйлық шығады.",
            "Кітап туған күнге, мектеп бітіруге, көшер алдындағы қоштасуға немесе жай назар белгісі ретінде жақсы келеді.",
          ],
        },
      ],
      questions: { heading: "Досқа немесе құрбыға қоятын сұрақтар тараулар бойынша", intro: "Бұл «Досқа немесе құрбыға» кітабындағы сұрақтар: оларды әңгімеде қоюға немесе сыйлық кітап үшін жазбаша жауап беруге болады." },
      faq: [
        ["Бұл ер дос үшін де лайық па?", "Иә. Сұрақтар бейтарап, ал тұжырымдар кімге арналғанына қарай бейімделеді. Кітаптың тонын өзіңіз таңдайсыз — әзілден жылыға дейін."],
        ["Басқа достардан хат жинауға бола ма?", "Иә. Ортақ достарды сілтеме арқылы шақырыңыз — олардың хаттары кітапқа жеке тарау болып кіреді."],
      ],
      cta: { title: "Жауаптарды кітапқа айналдырыңыз", text: "Достығыңыздың тарихын жазыңыз, ортақ суреттер қосып, мұқаба таңдаңыз — біз нағыз кітап басып шығарамыз." },
    },
    uz: {
      title: "Do‘st yoki dugonaga savollar: bir-biringizni yaxshiroq bilish uchun",
      description: "Do‘st va dugonaga savollar: tanishuv, sarguzashtlar, hazillar va minnatdorchilik haqida. Suhbat o‘tkazish va javoblarni do‘stligingiz kitobida saqlash.",
      lead: "Do‘stlarimiz bilan kulamiz, bir-birimizni qo‘llab-quvvatlaymiz, ammo ba’zan yillar davomida muhim narsalar haqida gaplashmaymiz. Savollar hammasi qanday boshlanganini eslashga va «rahmat»ni balandparvozliksiz aytishga yordam beradi.",
      sections: [
        {
          heading: "Yaqin do‘stingizdan nega so‘rash kerak",
          paragraphs: [
            "Vaqt o‘tib do‘stlar qondosh kabi bo‘lib qoladi va ular haqida hamma narsani bilamiz, deb o‘ylaymiz. Lekin eng iliq suhbatlar ko‘pincha oddiy savoldan boshlanadi: «Qanday tanishganimiz esingdami?»",
            "Do‘stlik haqidagi savollar birga qanchalik yo‘l bosib o‘tganingizni eslatadi va tashvishlar orasida yo‘qolib borayotgan iliqlikni qaytaradi.",
          ],
        },
        {
          heading: "Suhbatni qanday o‘tkazish kerak",
          list: [
            "Bahona tanlang: kafedagi uchrashuv, sayohat, do‘stingizning tug‘ilgan kuni.",
            "Xotiralardan boshlang: kulgili voqealar insonlarni hammadan ko‘ra yaqinlashtiradi.",
            "Hazil qo‘shing: do‘stona suhbat juda jiddiy bo‘lmasligi kerak.",
            "Arxivdagi birgalikdagi suratlar unutilgan voqealarni eslashga yordam beradi.",
            "«Rahmat»ni ovoz chiqarib ayting: do‘stlar buni yaqin qarindoshlarga qaraganda kamroq eshitadi.",
          ],
        },
        {
          heading: "Hikoyangizni qanday saqlash kerak",
          paragraphs: [
            "Do‘stlik ham kitobga arziydigan hikoya. Javoblarni yozib qo‘ying, birgalikdagi suratlarni qo‘shing, shunda do‘stingiz yillar o‘tib qayta o‘qiydigan sovg‘a paydo bo‘ladi.",
            "Kitob tug‘ilgan kunga, bitiruv kechasiga, ko‘chib ketish oldidan xayrlashuvga yoki shunchaki e’tibor belgisi sifatida yaxshi mos keladi.",
          ],
        },
      ],
      questions: { heading: "Do‘st yoki dugonaga bob bo‘yicha savollar", intro: "Bu «Do‘st yoki dugonaga» kitobidagi savollar: ularni suhbatda so‘rash yoki sovg‘a kitob uchun yozma javob berish mumkin." },
      faq: [
        ["Bu erkak do‘st uchun ham mos keladimi?", "Ha. Savollar betaraf, ifodalar esa kimga atalganiga qarab moslashadi. Kitob ohangini o‘zingiz tanlaysiz: hazilomuzdan iliqgacha."],
        ["Boshqa do‘stlardan xat yig‘ish mumkinmi?", "Ha. Umumiy do‘stlaringizni havola orqali taklif qiling: ularning xatlari kitobga alohida bob bo‘lib kiradi."],
      ],
      cta: { title: "Javoblarni kitobga aylantiring", text: "Do‘stligingiz tarixini yozing, birgalikdagi suratlarni qo‘shing va muqova tanlang: biz haqiqiy kitob chop etamiz." },
    },
  },
};
