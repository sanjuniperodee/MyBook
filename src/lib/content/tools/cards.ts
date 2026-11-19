import type { ToolDef } from "./types";

export const voprosyDlyaRazgovora: ToolDef = {
  slug: "voprosy-dlya-razgovora",
  kind: "cards",
  theme: "mom",
  landing: "kniga-mame",
  content: {
    ru: {
      label: "Вопросы для разговора",
      h1: "Вопросы для разговора:",
      accent: "карточки с историями близких",
      metaTitle: "Вопросы для разговора с родителями и близкими — случайные карточки",
      metaDescription: "Случайные вопросы для разговора с мамой, папой, бабушкой, любимым человеком и другом: вытяните карточку, задайте вопрос и запишите ответ. Можно скопировать подборку или распечатать.",
      teaser: "Случайные вопросы маме, папе, бабушке, любимому и другу — вытяните карточку и начните разговор.",
      lead: "Выберите, о ком хотите узнать больше, и вытяните карточку. Вопросы конкретные и тёплые — они помогают разговорить даже тех, кто «ничего особенного не рассказывал».",
      sections: [
        {
          heading: "Как задавать вопросы, чтобы получались истории",
          paragraphs: [
            "Задавайте по одному вопросу и слушайте, не перебивая. Если человек замолчал, подождите: самое ценное нередко говорят после паузы. Уточняйте: «А что было потом?», «Что ты тогда почувствовал?», «Как это выглядело?» — конкретные детали и превращают ответ в историю.",
            "Включите диктофон на телефоне и не стесняйтесь: голос потом пригодится не меньше текста. За один вечер хватит двух-трёх вопросов, не нужно проводить допрос.",
          ],
        },
        {
          heading: "Что делать с ответами",
          paragraphs: [
            "Лучшие ответы стоит сохранить, пока они не забылись. Из них можно собрать книгу: каждый вопрос — одна страница, к ним добавляются фотографии и письма близких. Тогда семейные истории будут читать и внуки.",
          ],
        },
      ],
      faq: [
        ["Какие вопросы задать маме или папе, чтобы узнать их лучше?", "Начните с детства и юности: где росли, о чём мечтали, как познакомились. Эти вопросы легче всего и не кажутся личными. Выберите «Маму» или «Папу» и вытяните карточку."],
        ["Что делать, если человек не любит рассказывать о себе?", "Не настаивайте. Начните с нейтральных вопросов — о любимой песне, блюде, месте. Часто достаточно одного такого вопроса, чтобы разговор пошёл сам."],
        ["Откуда взяты вопросы?", "Для мамы, папы, любимого человека и друга мы написали их специально для живого разговора, а вопросы бабушкам и дедушкам взяты из банка вопросов книги о жизни. Решите оформить ответы в книгу — в редакторе вас ждёт гораздо больше вопросов."],
        ["Можно ли распечатать вопросы?", "Да. Нажмите «10 случайных вопросов», затем «Распечатать» — получится лист, который можно взять с собой на встречу."],
      ],
      cta: { title: "Соберите ответы в книгу", text: "Каждый ответ станет страницей. Добавьте фотографии, письма родных и выберите обложку — мы сверстаем и напечатаем книгу. Писать можно бесплатно." },
    },
    kk: {
      label: "Әңгімеге арналған сұрақтар",
      h1: "Әңгімеге арналған сұрақтар:",
      accent: "жақындардың тарихы бар карточкалар",
      metaTitle: "Ата-анамен және жақындармен әңгімеге арналған сұрақтар — кездейсоқ карточкалар",
      metaDescription: "Анамен, әкемен, әжемен, сүйікті адаммен және доспен әңгімеге арналған кездейсоқ сұрақтар: карточка алып, сұрақ қойып, жауабын жазыңыз. Іріктемені көшіруге немесе басып шығаруға болады.",
      teaser: "Анаға, әкеге, әжеге, сүйіктіге және доска кездейсоқ сұрақтар — карточка алып, әңгіме бастаңыз.",
      lead: "Кім туралы көбірек білгіңіз келетінін таңдап, карточка алыңыз. Сұрақтар нақты әрі жылы — олар «ерекше ештеңе айтпаған» адамдарды да әңгімелете алады.",
      sections: [
        {
          heading: "Әңгіме шығу үшін сұрақты қалай қою керек",
          paragraphs: [
            "Бір сұрақ қойып, бөлместен тыңдаңыз. Адам үндемей қалса, күтіңіз: ең құнды сөздер үзілістен кейін айтылады. Нақтылаңыз: «Ал содан кейін не болды?», «Сол кезде не сезіндің?», «Ол қандай болды?» — нақты бөлшектер жауапты әңгімеге айналдырады.",
            "Телефондағы дауыс жазғышты қосып, ұялмаңыз: дауыс кейін мәтіннен кем емес керек болады. Бір кешке екі-үш сұрақ жеткілікті, жауап алудың қажеті жоқ.",
          ],
        },
        {
          heading: "Жауаптарды не істеу керек",
          paragraphs: [
            "Ең жақсы жауаптарды ұмытылмай тұрып сақтаған жөн. Олардан кітап жинауға болады: әр сұрақ — бір бет, оған суреттер мен жақындардың хаттары қосылады. Сонда отбасылық әңгімелерді немерелер де оқиды.",
          ],
        },
      ],
      faq: [
        ["Анам мен әкемді жақсырақ білу үшін қандай сұрақтар қою керек?", "Балалық пен жастықтан бастаңыз: қайда өсті, нені армандады, қалай танысты. Бұл сұрақтар ең оңай және жеке болып көрінбейді. «Ана» немесе «Әке» таңдап, карточка алыңыз."],
        ["Адам өзі туралы айтқанды ұнатпаса не істеу керек?", "Қиыстырмаңыз. Бейтарап сұрақтардан бастаңыз: сүйікті ән, тағам, жер туралы. Көбіне осындай бір сұрақ әңгімені өздігінен жүргізу үшін жеткілікті."],
        ["Сұрақтар қайдан алынған?", "Ана, әке, сүйікті адам және дос үшін оларды тікелей әңгімеге арнап жаздық, ал әжелер мен аталарға арналған сұрақтар өмір туралы кітаптың сұрақтар банкінен алынған. Жауаптарды кітапқа рәсімдеуге шешім қабылдасаңыз, редакторда әлдеқайда көп сұрақ күтіп тұр."],
        ["Сұрақтарды басып шығаруға бола ма?", "Иә. «10 кездейсоқ сұрақ» батырмасын басып, содан кейін «Басып шығару» таңдаңыз — кездесуге ала кететін парақ шығады."],
      ],
      cta: { title: "Жауаптарды кітапқа жинаңыз", text: "Әр жауап бір бет болады. Суреттер мен туыстардың хаттарын қосып, мұқаба таңдаңыз — біз кітапты беттеп, басып шығарамыз. Жазу тегін." },
    },
    uz: {
      label: "Suhbat uchun savollar",
      h1: "Suhbat uchun savollar:",
      accent: "yaqinlar hikoyalari kartochkalari",
      metaTitle: "Ota-ona va yaqinlar bilan suhbat uchun savollar — kartochkalar",
      metaDescription: "Ona, ota, buvi, sevgan inson va do‘st bilan suhbat uchun tasodifiy savollar: kartochka torting, savol bering, javobni yozib oling. Chop etish mumkin.",
      teaser: "Onaga, otaga, buviga, sevgan insonga va do‘stga tasodifiy savollar — kartochka tortib, suhbatni boshlang.",
      lead: "Kim haqida ko‘proq bilmoqchi ekaningizni tanlang va kartochka torting. Savollar aniq va iliq — ular «alohida hech narsa aytmagan» odamlarni ham gapirtirishga yordam beradi.",
      sections: [
        {
          heading: "Hikoya chiqishi uchun savollarni qanday berish kerak",
          paragraphs: [
            "Savollarni bittadan bering va gapini bo‘lmay tinglang. Odam jim bo‘lib qolsa, kuting: eng qimmatli gaplar ko‘pincha pauzadan keyin aytiladi. Aniqlashtiring: «Keyin nima bo‘ldi?», «O‘shanda nima his qildingiz?», «Qanday ko‘rinardi?» — aynan aniq tafsilotlar javobni hikoyaga aylantiradi.",
            "Telefonda diktofonni yoqing va uyalmang: ovoz keyinchalik matn kabi kerak bo‘ladi. Bir kechaga ikki-uchta savol yetarli, so‘roq qilish shart emas.",
          ],
        },
        {
          heading: "Javoblar bilan nima qilish kerak",
          paragraphs: [
            "Eng yaxshi javoblarni unutilmasdan saqlab qo‘yish kerak. Ulardan kitob yig‘ish mumkin: har bir savol — bitta sahifa, ularga suratlar va yaqinlar xatlari qo‘shiladi. Shunda oila hikoyalarini nevaralar ham o‘qiydi.",
          ],
        },
      ],
      faq: [
        ["Onam yoki dadamni yaxshiroq bilish uchun qanday savollar berish kerak?", "Bolalik va o‘smirlikdan boshlang: qayerda o‘sgan, nimani orzu qilgan, qanday tanishgan. Bu savollar eng oson va shaxsiy tuyulmaydi. «Onaga» yoki «Otaga»ni tanlang va kartochka torting."],
        ["Odam o‘zi haqida gapirishni yoqtirmasa, nima qilish kerak?", "Majburlamang. Betaraf savollardan boshlang — sevimli qo‘shiq, taom, joy haqida. Ko‘pincha bitta shunday savol suhbat o‘zi ketishi uchun yetarli."],
        ["Savollar qayerdan olingan?", "Ona, ota, sevgan inson va do‘st uchun ularni jonli suhbat uchun maxsus yozganmiz, buvi va bobolarga savollar esa hayot haqidagi kitobning savollar bankidan olingan. Javoblarni kitobga aylantirishga qaror qilsangiz, muharrirda sizni yana ko‘p savollar kutadi."],
        ["Savollarni chop etish mumkinmi?", "Ha. «10 ta tasodifiy savol»ni bosing, so‘ng «Chop etish»ni bosing — uchrashuvga o‘zingiz bilan olib borish mumkin bo‘lgan varaq hosil bo‘ladi."],
      ],
      cta: { title: "Javoblarni kitobga yig‘ing", text: "Har bir javob bitta sahifaga aylanadi. Suratlar va yaqinlar xatlarini qo‘shing, muqovani tanlang — kitobni biz maketlab, bosamiz. Yozish bepul." },
    },
  },
};
