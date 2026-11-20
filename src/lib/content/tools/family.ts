import type { ToolDef } from "./types";

export const mushelZhas: ToolDef = {
  slug: "mushel-zhas-kalkulyator",
  kind: "mushel",
  theme: "mom",
  landing: "podarok-na-yubilej-mame",
  content: {
    ru: {
      label: "Мүшел жас: калькулятор",
      h1: "Мүшел жас:",
      accent: "когда ваш мүшел и какой вы по году",
      metaTitle: "Мүшел жас калькулятор: когда мүшел, год животного и все возрасты",
      metaDescription: "Введите дату рождения — узнаете животное своего года (тышқан, сиыр, барыс…), когда наступит ближайший мүшел жас и все семь кругов: 13, 25, 37, 49, 61, 73, 85 лет.",
      teaser: "Год животного, ближайший мүшел жас и все семь кругов по дате рождения.",
      lead: "Мүшел жас — важная дата в казахской традиции: каждые 12 лет, когда возвращается год вашего животного. Введите дату рождения, и калькулятор покажет год, когда вы или ваши близкие отмечаете мүшел, и сколько лет остаётся до него.",
      sections: [
        {
          heading: "Что такое мүшел жас",
          paragraphs: [
            "Мүшел — двенадцатилетний цикл, по которому счёт лет идёт по животным: тышқан (крыса), сиыр (бык), барыс (тигр), қоян (кролик), ұлу (дракон), жылан (змея), жылқы (лошадь), қой (коза), мешін (обезьяна), тауық (петух), ит (собака), доңыз (свинья). Когда снова наступает год вашего животного, у человека мүшел жас.",
            "В традиционном счёте год рождения считается первым, поэтому мүшел жас — это 13, 25, 37, 49, 61, 73 и 85 лет. Если считать полными годами, это 12, 24, 36, 48, 60, 72 и 84.",
          ],
        },
        {
          heading: "Как отмечают мүшел жас",
          paragraphs: [
            "Мүшел жас принято отмечать как значимый юбилей: собираются родные, говорят добрые слова, дарят подарки. К круглым мүшел обычно готовятся заранее — особенно к 37, 49 и 61 году, которые в семьях нередко считают серьёзными рубежами.",
            "Хороший подарок на мүшел — то, что остаётся надолго: например, книга о юбиляре с воспоминаниями, фото и словами родных. Для печатной книги лучше заложить 3–4 недели.",
          ],
        },
        {
          heading: "Как считается год животного",
          paragraphs: ["Калькулятор берёт календарный год рождения: например, 2000 год — год дракона (ұлу), 1996 — крысы (тышқан). Некоторые семьи считают начало года по лунному календарю или по Наурызу; если вы родились в январе или феврале, уточните это у старших."],
        },
      ],
      faq: [
        ["Что такое мүшел жас?", "Это возраст, когда в 12-летнем животном календаре снова наступает год вашего рождения. По традиционному счёту это 13, 25, 37, 49, 61, 73 и 85 лет."],
        ["Почему мүшел жас 13, а не 12 лет?", "В традиционном счёте год рождения считается первым годом жизни. Поэтому полных лет на мүшел 12, 24, 36 и так далее, а по традиционному счёту — 13, 25, 37."],
        ["Как узнать свой год животного?", "Введите дату рождения в калькулятор: он покажет животное вашего года, например, тышқан, барыс или ұлу, и все мүшел жас."],
        ["Что подарить на мүшел жас?", "Подарок с памятью: книга с воспоминаниями и фотографиями, семейный альбом, поездка. Если мүшел у мамы или папы, подойдёт книга от всей семьи с письмами детей и внуков."],
      ],
      cta: { title: "Подарок на мүшел, который сохранится", text: "Книга о юбиляре: воспоминания, фото и слова родных в твёрдой обложке. Писать можно бесплатно." },
    },
    kk: {
      label: "Мүшел жас: калькулятор",
      h1: "Мүшел жас:",
      accent: "мүшел қашан және жылыңыз қандай",
      metaTitle: "Мүшел жас калькуляторы: мүшел қашан, жыл жануары және барлық жас",
      metaDescription: "Туған күнді енгізіңіз — жылыңыздың жануарын (тышқан, сиыр, барыс…), ең жақын мүшел жас қашан келетінін және жеті айналымды біліңіз: 13, 25, 37, 49, 61, 73, 85 жас.",
      teaser: "Туған күн бойынша жыл жануары, ең жақын мүшел жас және жеті айналым.",
      lead: "Мүшел жас — қазақ дәстүріндегі маңызды күн: жыл жануарыңыз қайта келетін әр 12 жыл. Туған күнді енгізіңіз — калькулятор өзіңіз немесе жақындарыңыз мүшел жасын атап өтетін жылды және оған дейін қанша қалғанын көрсетеді.",
      sections: [
        {
          heading: "Мүшел жас дегеніміз не",
          paragraphs: [
            "Мүшел — жылдарды жануарлар бойынша санайтын он екі жылдық айналым: тышқан, сиыр, барыс, қоян, ұлу, жылан, жылқы, қой, мешін, тауық, ит, доңыз. Жыл жануарыңыз қайта келгенде, адам мүшел жасқа толады.",
            "Дәстүрлі есепте туған жыл бірінші жыл болып саналады, сондықтан мүшел жас — 13, 25, 37, 49, 61, 73 және 85 жас. Толық жыл бойынша санасақ, бұл 12, 24, 36, 48, 60, 72 және 84.",
          ],
        },
        {
          heading: "Мүшел жасты қалай атап өтеді",
          paragraphs: [
            "Мүшел жасты маңызды мерейтой ретінде атап өту қалыптасқан: туыстар жиналып, жақсы сөздер айтып, сыйлық береді. Мүшел жасқа әдетте алдын ала дайындалады — әсіресе 37, 49 және 61 жасқа, оларды отбасыларда жиі маңызды межелер деп санайды.",
            "Мүшел жасқа жақсы сыйлық — ұзақ сақталатын нәрсе: мысалы, мерейтой иесі туралы естеліктері, суреттері және туыстарының сөздері бар кітап. Басылған кітапқа 3–4 апта қор қалдырған жөн.",
          ],
        },
        {
          heading: "Жыл жануары қалай есептеледі",
          paragraphs: ["Калькулятор туған күнтізбелік жылды алады: мысалы, 2000 жыл — ұлу жылы, 1996 — тышқан жылы. Кейбір отбасылар жыл басын ай күнтізбесі немесе Наурыз бойынша санайды; қаңтарда немесе ақпанда туған болсаңыз, үлкендерден нақтылаңыз."],
        },
      ],
      faq: [
        ["Мүшел жас дегеніміз не?", "Бұл 12 жылдық жануарлар күнтізбесінде туған жылыңыз қайта келетін жас. Дәстүрлі есеп бойынша бұл 13, 25, 37, 49, 61, 73 және 85 жас."],
        ["Мүшел жас неге 12 емес, 13 жас?", "Дәстүрлі есепте туған жыл өмірдің бірінші жылы болып саналады. Сондықтан мүшелде толық жас 12, 24, 36 және т.б., ал дәстүрлі есеппен — 13, 25, 37."],
        ["Өз жыл жануарымды қалай білуге болады?", "Туған күнді калькуляторға енгізіңіз: ол жылыңыздың жануарын, мысалы, тышқан, барыс немесе ұлу, және барлық мүшел жасты көрсетеді."],
        ["Мүшел жасқа не сыйлау керек?", "Есте қалатын сыйлық: естеліктері мен суреттері бар кітап, отбасылық альбом, сапар. Мүшел анада немесе әкеде болса, балалары мен немерелерінің хаттары бар бүкіл отбасынан кітап лайық."],
      ],
      cta: { title: "Сақталатын мүшел сыйлығы", text: "Мерейтой иесі туралы кітап: естеліктер, суреттер және туыстардың сөздері қатты мұқабада. Жазу тегін." },
    },
    uz: {
      label: "Muchal yoshi: kalkulyator",
      h1: "Muchal yoshi:",
      accent: "muchalingiz qachon va yilingiz qaysi hayvon",
      metaTitle: "Muchal yoshi kalkulyatori: muchal qachon, yil hayvoni, barcha yoshlar",
      metaDescription: "Tug‘ilgan sanani kiriting: yil hayvoningiz, eng yaqin muchal yoshi va yetti davra — 13, 25, 37, 49, 61, 73, 85 yosh — ko‘rsatiladi.",
      teaser: "Tug‘ilgan sana bo‘yicha yil hayvoni, eng yaqin muchal yoshi va yetti davra.",
      lead: "Muchal yoshi — turkiy xalqlar an’anasidagi muhim sana: yil hayvoningiz qaytib keladigan har 12 yilda nishonlanadi. Tug‘ilgan sanani kiriting — kalkulyator siz yoki yaqinlaringiz muchalni nishonlaydigan yilni va unga necha yil qolganini ko‘rsatadi.",
      sections: [
        {
          heading: "Muchal yoshi nima",
          paragraphs: [
            "Muchal — yillar hayvonlar bo‘yicha sanaladigan o‘n ikki yillik davra: sichqon (kalamush), sigir (buqa), yo‘lbars, quyon, nahang (ajdar), ilon, ot, qo‘y (echki), maymun, tovuq (xo‘roz), it, cho‘chqa. Yil hayvoningiz yana kelganda, insonning muchal yoshi bo‘ladi.",
            "An’anaviy hisobda tug‘ilgan yil birinchi yil sanaladi, shuning uchun muchal yoshi — 13, 25, 37, 49, 61, 73 va 85 yosh. To‘liq yillar bo‘yicha sanasak, bu 12, 24, 36, 48, 60, 72 va 84.",
          ],
        },
        {
          heading: "Muchal yoshi qanday nishonlanadi",
          paragraphs: [
            "Muchal yoshini muhim yubiley sifatida nishonlash odat tusiga kirgan: yaqinlar yig‘ilib, ezgu so‘zlar aytishadi, sovg‘alar berishadi. Yumaloq muchallarga odatda oldindan tayyorgarlik ko‘riladi — ayniqsa 37, 49 va 61 yoshga, oilalarda ularni ko‘pincha jiddiy marralar deb hisoblashadi.",
            "Muchal uchun yaxshi sovg‘a — uzoq saqlanadigan narsa: masalan, yubilyar haqida xotiralar, suratlar va yaqinlarining so‘zlari jamlangan kitob. Bosma kitob uchun 3–4 hafta vaqt qoldirgan ma’qul.",
          ],
        },
        {
          heading: "Yil hayvoni qanday aniqlanadi",
          paragraphs: ["Kalkulyator tug‘ilgan kalendar yilini oladi: masalan, 2000-yil — nahang (ajdar) yili, 1996-yil — sichqon yili. Ba’zi oilalar yil boshini qamariy kalendar yoki Navro‘z bo‘yicha hisoblaydi; yanvar yoki fevralda tug‘ilgan bo‘lsangiz, kattalardan aniqlab oling."],
        },
      ],
      faq: [
        ["Muchal yoshi nima?", "Bu 12 yillik hayvonlar kalendarida tug‘ilgan yilingiz yana keladigan yosh. An’anaviy hisob bo‘yicha bu 13, 25, 37, 49, 61, 73 va 85 yosh."],
        ["Nega muchal yoshi 12 emas, 13 yosh?", "An’anaviy hisobda tug‘ilgan yil hayotning birinchi yili sanaladi. Shuning uchun muchalda to‘liq yosh 12, 24, 36 va hokazo, an’anaviy hisobda esa — 13, 25, 37."],
        ["Yil hayvonimni qanday bilsam bo‘ladi?", "Tug‘ilgan sanani kalkulyatorga kiriting: u yilingiz hayvonini, masalan, sichqon, yo‘lbars yoki nahangni va barcha muchal yoshlarini ko‘rsatadi."],
        ["Muchal yoshiga nima sovg‘a qilish kerak?", "Esda qoladigan sovg‘a: xotiralar va suratlar jamlangan kitob, oilaviy albom, sayohat. Muchal onangiz yoki otangizda bo‘lsa, farzandlari va nevaralarining xatlari bilan butun oiladan kitob mos keladi."],
      ],
      cta: { title: "Saqlanib qoladigan muchal sovg‘asi", text: "Yubilyar haqida kitob: xotiralar, suratlar va yaqinlarining so‘zlari qattiq muqovada. Yozish bepul." },
    },
    en: {
      label: "Muchal age: calculator",
      h1: "Muchal age:",
      accent: "when your muchal comes and which animal year you were born in",
      metaTitle: "Muchal age calculator: your muchal, animal year and all ages",
      metaDescription: "Enter a date of birth to find your animal year (rat, ox, tiger…), when your next muchal age comes and all seven cycles: 13, 25, 37, 49, 61, 73, 85.",
      teaser: "Your animal year, your next muchal age and all seven cycles, from a date of birth.",
      lead: "Muchal age is an important date in Kazakh tradition: it comes every 12 years, when the year of your animal returns. Enter a date of birth and the calculator shows the year when you or your loved ones celebrate a muchal, and how many years are left until it.",
      sections: [
        {
          heading: "What muchal age is",
          paragraphs: [
            "The muchal is a twelve-year cycle in which years are counted by animals: tyshqan (rat), siyr (ox), barys (tiger), qoyan (rabbit), ulu (dragon), zhylan (snake), zhylqy (horse), qoy (sheep), meshin (monkey), tauyq (rooster), it (dog) and dongyz (pig). When the year of your animal comes round again, you reach your muchal age.",
            "In the traditional count the year of birth is the first year, so muchal ages are 13, 25, 37, 49, 61, 73 and 85. Counted in completed years, they are 12, 24, 36, 48, 60, 72 and 84.",
          ],
        },
        {
          heading: "How muchal age is celebrated",
          paragraphs: [
            "A muchal age is usually celebrated as a significant anniversary: relatives gather, say kind words and give gifts. Families prepare for the round muchals well in advance, especially 37, 49 and 61, which many families see as serious milestones.",
            "A good muchal gift is something that lasts: for example, a book about the person being celebrated, with memories, photos and words from loved ones. For a printed book, allow 3–4 weeks.",
          ],
        },
        {
          heading: "How the animal year is worked out",
          paragraphs: ["The calculator uses the calendar year of birth: for example, 2000 is the year of the dragon (ulu) and 1996 the year of the rat (tyshqan). Some families count the start of the year by the lunar calendar or by Nauryz; if you were born in January or February, ask the older members of your family."],
        },
      ],
      faq: [
        ["What is muchal age?", "It is the age at which the year of your birth comes round again in the 12-year animal calendar. In the traditional count these are 13, 25, 37, 49, 61, 73 and 85."],
        ["Why is muchal age 13 and not 12?", "In the traditional count the year of birth is the first year of life. So in completed years a muchal is 12, 24, 36 and so on, while in the traditional count it is 13, 25, 37."],
        ["How do I find out my animal year?", "Enter your date of birth in the calculator: it shows the animal of your year, for example the rat, tiger or dragon, and all your muchal ages."],
        ["What should I give for a muchal age?", "A gift that holds memories: a book of recollections and photos, a family album, a trip. If the muchal is your mum’s or dad’s, a book from the whole family with letters from children and grandchildren is a perfect choice."],
      ],
      cta: { title: "A muchal gift that will last", text: "A book about the person being celebrated: memories, photos and words from loved ones in a hardcover. Writing is free." },
    },
  },
};

export const semejnyjKalendar: ToolDef = {
  slug: "semejnyj-kalendar",
  kind: "family",
  theme: "mom",
  landing: "kniga-mame",
  content: {
    ru: {
      label: "Семейный календарь дней рождения",
      h1: "Семейный календарь:",
      accent: "дни рождения, мүшел и напоминания",
      metaTitle: "Календарь дней рождения семьи с напоминаниями и мүшел жас (.ics)",
      metaDescription: "Добавьте близких — получите их возраст, ближайший день рождения, год животного и мүшел жас. Скачайте календарь с ежегодными напоминаниями за 1–4 недели, чтобы успеть выбрать подарок.",
      teaser: "Дни рождения и мүшел близких в одном календаре, с напоминаниями заранее.",
      lead: "Подарок, выбранный в последний день, редко получается душевным. Добавьте родных и друзей: календарь покажет ближайшие дни рождения, мүшел жас и скачается файлом, который сам напомнит за неделю, две или месяц.",
      sections: [
        {
          heading: "Как пользоваться календарём",
          paragraphs: [
            "Впишите имя, укажите, кем вам приходится человек, и дату рождения. Список сортируется по ближайшим дням рождения, рядом — возраст, год животного и ближайший мүшел жас. Данные хранятся только в вашем браузере.",
            "Кнопка «Скачать календарь» создаёт файл .ics. Откройте его на телефоне или компьютере: дни рождения появятся в Google Календаре, Apple Календаре или Outlook с повторением каждый год.",
          ],
        },
        {
          heading: "Какие напоминания приходят",
          paragraphs: [
            "Для каждого дня рождения — напоминание за выбранный срок (неделя, две или месяц) и накануне. Для ближайшего мүшел жас — отдельное событие с напоминанием за два месяца: на такой юбилей лучше выбрать особенный подарок, а для печатной книги нужно время.",
          ],
        },
        {
          heading: "Что подарить заранее",
          paragraphs: ["Когда до дня рождения две-три недели, хватит времени и на нормальный подарок, и на книгу о человеке: отвечайте на вопросы, добавляйте фото, собирайте письма родных, и книга успеет напечататься."],
        },
      ],
      faq: [
        ["Куда сохраняются даты рождения?", "Только в вашем браузере на этом устройстве. Мы их не получаем и никуда не отправляем. Файл календаря создаётся тоже у вас, а не на сервере."],
        ["Как добавить дни рождения в календарь телефона?", "Нажмите «Скачать календарь (.ics)» и откройте файл. На iPhone события добавятся в «Календарь», на Android — в Google Календарь. События повторяются каждый год."],
        ["За сколько дней лучше напоминать о дне рождения?", "За две недели: хватает времени выбрать и заказать подарок. Если хотите подарить книгу, ставьте напоминание за месяц."],
        ["Как считается мүшел жас?", "Это возраст, когда снова наступает год вашего животного: 13, 25, 37, 49, 61 год по традиционному счёту. Калькулятор показывает ближайший для каждого человека."],
      ],
      cta: { title: "Подарок, к которому успеете подготовиться", text: "Книга о близком человеке — ответы на вопросы, фото и письма родных. Писать можно бесплатно, а календарь напомнит, когда начинать." },
    },
    kk: {
      label: "Отбасылық туған күндер күнтізбесі",
      h1: "Отбасылық күнтізбе:",
      accent: "туған күндер, мүшел және ескертулер",
      metaTitle: "Отбасының туған күндер күнтізбесі: ескертулер және мүшел жас (.ics)",
      metaDescription: "Жақындарыңызды қосыңыз — олардың жасын, ең жақын туған күнін, жыл жануарын және мүшел жасын аласыз. Сыйлық таңдауға үлгеру үшін 1–4 апта бұрын ескертетін күнтізбені жүктеңіз.",
      teaser: "Жақындардың туған күндері мен мүшел жасы бір күнтізбеде, алдын ала ескертулермен.",
      lead: "Соңғы күні таңдалған сыйлық сирек жүрекпен шығады. Туыстар мен достарды қосыңыз: күнтізбе ең жақын туған күндер мен мүшел жасты көрсетіп, бір апта, екі апта немесе бір ай бұрын өзі ескертетін файл ретінде жүктеледі.",
      sections: [
        {
          heading: "Күнтізбені қалай пайдалану керек",
          paragraphs: [
            "Атын жазып, адам сізге кім болатынын және туған күнін көрсетіңіз. Тізім ең жақын туған күндер бойынша сұрыпталады, жанында жасы, жыл жануары және ең жақын мүшел жас тұрады. Деректер тек браузеріңізде сақталады.",
            "«Күнтізбені жүктеу» батырмасы .ics файлын жасайды. Оны телефонда немесе компьютерде ашыңыз: туған күндер Google Күнтізбесінде, Apple Күнтізбесінде немесе Outlook-та жыл сайын қайталанып пайда болады.",
          ],
        },
        {
          heading: "Қандай ескертулер келеді",
          paragraphs: ["Әр туған күнге — таңдалған мерзімге (бір апта, екі апта немесе бір ай) және алдыңғы күні ескерту. Ең жақын мүшел жасқа — екі ай бұрын ескертуі бар бөлек оқиға: мұндай мерейтойға ерекше сыйлық таңдаған жөн, ал басылған кітапқа уақыт керек."],
        },
        {
          heading: "Алдын ала не сыйлау керек",
          paragraphs: ["Туған күнге екі-үш апта қалғанда жақсы сыйлыққа да, адам туралы кітапқа да уақыт жетеді: сұрақтарға жауап беріп, сурет қосып, туыстардың хаттарын жинаңыз — кітап басылып үлгереді."],
        },
      ],
      faq: [
        ["Туған күндер қайда сақталады?", "Тек осы құрылғыдағы браузеріңізде. Біз оларды алмаймыз және ешқайда жібермейміз. Күнтізбе файлы да серверде емес, сізде жасалады."],
        ["Туған күндерді телефон күнтізбесіне қалай қосуға болады?", "«Күнтізбені жүктеу (.ics)» батырмасын басып, файлды ашыңыз. iPhone-да оқиғалар «Күнтізбеге», Android-та Google Күнтізбесіне қосылады. Оқиғалар жыл сайын қайталанады."],
        ["Туған күн туралы неше күн бұрын ескерту жақсы?", "Екі апта бұрын: сыйлықты таңдап, тапсырыс беруге уақыт жетеді. Кітап сыйлағыңыз келсе, бір ай бұрынға қойыңыз."],
        ["Мүшел жас қалай есептеледі?", "Бұл жыл жануарыңыз қайта келетін жас: дәстүрлі есеппен 13, 25, 37, 49, 61 жас. Калькулятор әр адам үшін ең жақынын көрсетеді."],
      ],
      cta: { title: "Дайындалып үлгеретін сыйлық", text: "Жақын адам туралы кітап — сұрақтарға жауаптар, суреттер және туыстардың хаттары. Жазу тегін, ал күнтізбе қашан бастау керегін ескертеді." },
    },
    uz: {
      label: "Oilaviy tug‘ilgan kunlar kalendari",
      h1: "Oilaviy kalendar:",
      accent: "tug‘ilgan kunlar, muchal va eslatmalar",
      metaTitle: "Oilaning tug‘ilgan kunlar kalendari: eslatmalar va muchal yoshi (.ics)",
      metaDescription: "Yaqinlaringizni qo‘shing: yoshi, eng yaqin tug‘ilgan kuni, yil hayvoni va muchal yoshini ko‘ring. 1–4 hafta oldin eslatadigan kalendarni yuklab oling.",
      teaser: "Yaqinlarning tug‘ilgan kunlari va muchal yoshi bitta kalendarda, oldindan eslatmalar bilan.",
      lead: "Oxirgi kuni tanlangan sovg‘a kamdan-kam samimiy chiqadi. Qarindosh va do‘stlarni qo‘shing: kalendar eng yaqin tug‘ilgan kunlar va muchal yoshini ko‘rsatadi hamda bir hafta, ikki hafta yoki bir oy oldin o‘zi eslatadigan fayl sifatida yuklab olinadi.",
      sections: [
        {
          heading: "Kalendardan qanday foydalanish kerak",
          paragraphs: [
            "Ismini yozing, odam sizga kim bo‘lishini va tug‘ilgan sanasini belgilang. Ro‘yxat eng yaqin tug‘ilgan kunlar bo‘yicha saralanadi, yonida yoshi, yil hayvoni va eng yaqin muchal yoshi turadi. Ma’lumotlar faqat brauzeringizda saqlanadi.",
            "«Kalendarni yuklab olish» tugmasi .ics faylini yaratadi. Uni telefon yoki kompyuterda oching: tug‘ilgan kunlar Google Kalendar, Apple Kalendar yoki Outlook’da har yili takrorlanib paydo bo‘ladi.",
          ],
        },
        {
          heading: "Qanday eslatmalar keladi",
          paragraphs: [
            "Har bir tug‘ilgan kun uchun — tanlangan muddatdan (bir hafta, ikki hafta yoki bir oy) oldin va bir kun avval eslatma. Eng yaqin muchal yoshi uchun — ikki oy oldin eslatmali alohida tadbir: bunday yubileyga alohida sovg‘a tanlagan ma’qul, bosma kitob uchun esa vaqt kerak.",
          ],
        },
        {
          heading: "Oldindan nima sovg‘a qilish mumkin",
          paragraphs: ["Tug‘ilgan kunga ikki-uch hafta qolganda yaxshi sovg‘aga ham, inson haqidagi kitobga ham vaqt yetadi: savollarga javob bering, surat qo‘shing, yaqinlarining xatlarini yig‘ing — kitob bosilib ulguradi."],
        },
      ],
      faq: [
        ["Tug‘ilgan sanalar qayerda saqlanadi?", "Faqat shu qurilmadagi brauzeringizda. Biz ularni olmaymiz va hech qayoqqa yubormaymiz. Kalendar fayli ham serverda emas, sizning qurilmangizda yaratiladi."],
        ["Tug‘ilgan kunlarni telefon kalendariga qanday qo‘shaman?", "«Kalendarni yuklab olish (.ics)» tugmasini bosib, faylni oching. iPhone’da tadbirlar «Kalendar»ga, Android’da Google Kalendar’ga qo‘shiladi. Tadbirlar har yili takrorlanadi."],
        ["Tug‘ilgan kun haqida necha kun oldin eslatgan yaxshi?", "Ikki hafta oldin: sovg‘a tanlash va buyurtma berishga vaqt yetadi. Kitob sovg‘a qilmoqchi bo‘lsangiz, bir oy oldinga qo‘ying."],
        ["Muchal yoshi qanday hisoblanadi?", "Bu yil hayvoningiz yana keladigan yosh: an’anaviy hisobda 13, 25, 37, 49, 61 yosh. Kalkulyator har bir inson uchun eng yaqinini ko‘rsatadi."],
      ],
      cta: { title: "Tayyorlanishga ulguradigan sovg‘a", text: "Yaqin inson haqida kitob — savollarga javoblar, suratlar va yaqinlarining xatlari. Yozish bepul, kalendar esa qachon boshlashni eslatadi." },
    },
    en: {
      label: "Family birthday calendar",
      h1: "Family calendar:",
      accent: "birthdays, muchals and reminders",
      metaTitle: "Family birthday calendar with reminders and muchal age (.ics)",
      metaDescription: "Add loved ones to see their age, next birthday, animal year and muchal age. Download a calendar with reminders 1–4 weeks ahead to choose a gift in time.",
      teaser: "Your loved ones’ birthdays and muchals in one calendar, with reminders in advance.",
      lead: "A gift chosen on the last day rarely feels heartfelt. Add family and friends: the calendar shows upcoming birthdays and muchal ages, and downloads as a file that reminds you a week, two weeks or a month ahead.",
      sections: [
        {
          heading: "How to use the calendar",
          paragraphs: [
            "Enter a name, say how the person is related to you, and add their date of birth. The list is sorted by upcoming birthdays, with their age, animal year and next muchal age beside each one. The data is stored only in your browser.",
            "The “Download calendar” button creates an .ics file. Open it on your phone or computer: the birthdays will appear in Google Calendar, Apple Calendar or Outlook, repeating every year.",
          ],
        },
        {
          heading: "Which reminders you get",
          paragraphs: [
            "For each birthday there is a reminder at the time you choose (a week, two weeks or a month ahead) and another the day before. For the next muchal age there is a separate event with a reminder two months ahead: for such an anniversary it is worth choosing a special gift, and a printed book needs time.",
          ],
        },
        {
          heading: "What to give in good time",
          paragraphs: ["With two or three weeks before a birthday, there is time both for a proper gift and for a book about the person: answer the questions, add photos, collect letters from relatives, and the book will be printed in time."],
        },
      ],
      faq: [
        ["Where are the birth dates saved?", "Only in your browser on this device. We do not receive them or send them anywhere. The calendar file is also created on your device, not on a server."],
        ["How do I add the birthdays to my phone’s calendar?", "Tap “Download calendar (.ics)” and open the file. On an iPhone the events are added to Calendar, on Android to Google Calendar. The events repeat every year."],
        ["How far ahead should I be reminded about a birthday?", "Two weeks: enough time to choose and order a gift. If you want to give a book, set the reminder a month ahead."],
        ["How is muchal age counted?", "It is the age at which the year of your animal comes round again: 13, 25, 37, 49, 61 in the traditional count. The calculator shows the next one for each person."],
      ],
      cta: { title: "A gift you will have time to prepare", text: "A book about someone close: answers to questions, photos and letters from relatives. Writing is free, and the calendar will remind you when to start." },
    },
  },
};

export const anketaIntervyu: ToolDef = {
  slug: "anketa-dlya-intervyu",
  kind: "anketa",
  theme: "autobiography",
  landing: "kniga-o-svoej-zhizni",
  content: {
    ru: {
      label: "Анкета для интервью с близкими",
      h1: "Анкета для интервью:",
      accent: "вопросы бабушке, маме, папе — на печать",
      metaTitle: "Анкета для интервью с бабушкой, мамой, папой: вопросы на печать",
      metaDescription: "Выберите, с кем беседа, отметьте вопросы и распечатайте анкету с местом под ответы. Подходит для тех, у кого нет смартфона: запишите истории близких от руки, а потом соберите книгу.",
      teaser: "Выберите вопросы и распечатайте анкету с местом для ответов — для беседы с бабушкой, мамой, папой.",
      lead: "Не у всех старших есть смартфон и привычка надиктовывать воспоминания. Выберите вопросы, распечатайте анкету, побеседуйте за чаем и запишите ответы от руки. Потом из них можно собрать книгу.",
      sections: [
        {
          heading: "Как устроена анкета",
          paragraphs: [
            "Вы выбираете, с кем беседа, и отмечаете подходящие вопросы — можно взять десять случайных или собрать свой список. Анкета печатается на листах A4: у каждого вопроса три строки для ответа, сверху поля для даты и имени того, кто записывает.",
            "Для бабушек и дедушек вопросы взяты из банка вопросов книги о жизни: о детстве, семье, работе, традициях. Для мамы, папы, любимого человека и друга вопросы написаны для живого разговора.",
          ],
        },
        {
          heading: "Как провести беседу",
          paragraphs: [
            "Лучше проводить беседу за чаем, без спешки, и задавать два-три вопроса за встречу. Не перебивайте, уточняйте детали («А что было потом?», «Как это выглядело?») и записывайте слова человека как можно ближе к тому, как он говорит: так книга будет звучать его голосом.",
            "Если ответ получился длинным, не переписывайте его набело сразу. Сначала запишите ключевые слова, а дома дополните по памяти или по записи на диктофон.",
          ],
        },
        {
          heading: "Что делать с готовыми ответами",
          paragraphs: ["Записанные истории можно собрать в книгу: каждый ответ станет страницей, к ним добавятся старые фотографии. Так рассказы бабушки останутся в семье надолго."],
        },
      ],
      faq: [
        ["Какие вопросы задать бабушке или дедушке?", "Начните с детства: где росли, какой был дом, во что играли. Затем — о семье, работе, традициях, самых ярких событиях. Выберите «С бабушкой, дедушкой» и отметьте вопросы."],
        ["Можно ли распечатать анкету?", "Да. Отметьте вопросы и нажмите «Распечатать анкету»: откроется окно печати с листами A4, где у каждого вопроса есть место для ответа."],
        ["Сколько вопросов выбрать для одной беседы?", "Для одной встречи достаточно 5–10 вопросов: человек не устанет, а ответы будут развёрнутыми. Остальные задайте в следующий раз."],
        ["Как превратить записи в книгу?", "Перенесите ответы в редактор книги: он подскажет вопросы, расставит фото и сверстает страницы. Писать можно бесплатно."],
      ],
      cta: { title: "Соберите записанные истории в книгу", text: "Ответы, старые фотографии и письма родных — в твёрдой обложке. Писать можно бесплатно и в своём темпе." },
    },
    kk: {
      label: "Жақындармен сұхбатқа анкета",
      h1: "Сұхбатқа арналған анкета:",
      accent: "әжеге, анаға, әкеге сұрақтар — басып шығаруға",
      metaTitle: "Әжемен, анамен, әкемен сұхбатқа анкета: басып шығаруға сұрақтар",
      metaDescription: "Кіммен әңгіме екенін таңдап, сұрақтарды белгілеңіз де, жауапқа орны бар анкетаны басып шығарыңыз. Смартфоны жоқтарға лайық: жақындардың әңгімесін қолмен жазып алып, кейін кітапқа жинаңыз.",
      teaser: "Сұрақтарды таңдап, жауапқа орны бар анкетаны басып шығарыңыз — әжемен, анамен, әкемен әңгімеге.",
      lead: "Үлкендердің бәрінде смартфон және естелікті айтып жаздыру әдеті бола бермейді. Сұрақтарды таңдап, анкетаны басып шығарыңыз, шай үстінде әңгімелесіп, жауаптарды қолмен жазып алыңыз. Кейін олардан кітап жинауға болады.",
      sections: [
        {
          heading: "Анкета қалай құрылған",
          paragraphs: [
            "Кіммен әңгіме екенін таңдап, лайықты сұрақтарды белгілейсіз — он кездейсоқ сұрақты алуға немесе өз тізіміңізді жинауға болады. Анкета A4 парақтарына басылады: әр сұраққа жауап үшін үш жол, жоғарыда күн мен жазып алушының аты үшін өрістер бар.",
            "Әже мен атаға арналған сұрақтар өмір туралы кітаптың сұрақтар банкінен алынған: балалық, отбасы, жұмыс, дәстүрлер туралы. Ана, әке, сүйікті адам және дос үшін сұрақтар тікелей әңгімеге арнап жазылған.",
          ],
        },
        {
          heading: "Әңгімені қалай өткізу керек",
          paragraphs: [
            "Әңгімені шай үстінде, асықпай өткізіп, бір кездесуде екі-үш сұрақ қойған жөн. Бөлмеңіз, бөлшектерді нақтылаңыз («Ал содан кейін не болды?», «Ол қандай болды?») және адамның сөзін ол сөйлегенге мүмкіндігінше жақын жазыңыз: сонда кітап оның дауысымен естіледі.",
            "Жауап ұзақ шықса, оны бірден таза көшірмеңіз. Алдымен негізгі сөздерді жазып, үйде есте сақтаған бойынша немесе дауыс жазбасы бойынша толықтырыңыз.",
          ],
        },
        {
          heading: "Дайын жауаптарды не істеу керек",
          paragraphs: ["Жазылған әңгімелерді кітапқа жинауға болады: әр жауап бір бет болады, оларға ескі суреттер қосылады. Сонда әженің әңгімелері отбасында ұзақ қалады."],
        },
      ],
      faq: [
        ["Әжеден немесе атадан қандай сұрақтар сұрау керек?", "Балалықтан бастаңыз: қайда өсті, үй қандай болды, нені ойнады. Содан кейін — отбасы, жұмыс, дәстүрлер, ең жарқын оқиғалар туралы. «Әжемен, атамен» таңдап, сұрақтарды белгілеңіз."],
        ["Анкетаны басып шығаруға бола ма?", "Иә. Сұрақтарды белгілеп, «Анкетаны басып шығару» батырмасын басыңыз: әр сұраққа жауап орны бар A4 парақтары бар басып шығару терезесі ашылады."],
        ["Бір әңгімеге қанша сұрақ таңдау керек?", "Бір кездесуге 5–10 сұрақ жеткілікті: адам шаршамайды, ал жауаптар толық болады. Қалғанын келесі жолы қойыңыз."],
        ["Жазбаларды кітапқа қалай айналдыруға болады?", "Жауаптарды кітап редакторына көшіріңіз: ол сұрақтарды көрсетіп, суреттерді орналастырып, беттерді беттейді. Жазу тегін."],
      ],
      cta: { title: "Жазылған әңгімелерді кітапқа жинаңыз", text: "Жауаптар, ескі суреттер және туыстардың хаттары — қатты мұқабада. Жазу тегін және өз қарқыныңызбен." },
    },
    uz: {
      label: "Yaqinlar bilan suhbat uchun anketa",
      h1: "Suhbat uchun anketa:",
      accent: "buvi, ona, otaga savollar — chop etish uchun",
      metaTitle: "Buvi, ona, ota bilan suhbat uchun anketa: chop etiladigan savollar",
      metaDescription: "Kim bilan suhbatni tanlang, savollarni belgilang va javob uchun joyli anketani chop eting. Hikoyalarni qo‘lda yozib oling, keyin kitob yig‘ing.",
      teaser: "Savollarni tanlab, javob uchun joyi bor anketani chop eting — buvi, ona, ota bilan suhbat uchun.",
      lead: "Kattalarning hammasida ham smartfon va xotiralarini aytib yozdirish odati bo‘lavermaydi. Savollarni tanlang, anketani chop eting, choy ustida suhbatlashing va javoblarni qo‘lda yozib oling. Keyin ulardan kitob yig‘ish mumkin.",
      sections: [
        {
          heading: "Anketa qanday tuzilgan",
          paragraphs: [
            "Siz kim bilan suhbat bo‘lishini tanlab, mos savollarni belgilaysiz — o‘nta tasodifiy savol olish yoki o‘z ro‘yxatingizni tuzish mumkin. Anketa A4 varaqlarida chop etiladi: har bir savolga javob uchun uch qator, tepada sana va yozib oluvchining ismi uchun maydonlar bor.",
            "Buvi va bobolar uchun savollar hayot haqidagi kitobning savollar bankidan olingan: bolalik, oila, ish, an’analar haqida. Ona, ota, sevgan inson va do‘st uchun savollar jonli suhbatga mo‘ljallab yozilgan.",
          ],
        },
        {
          heading: "Suhbatni qanday o‘tkazish kerak",
          paragraphs: [
            "Suhbatni choy ustida, shoshilmay o‘tkazib, bir uchrashuvda ikki-uchta savol bergan ma’qul. So‘zini bo‘lmang, tafsilotlarni aniqlang («Keyin nima bo‘ldi?», «U qanday ko‘rinardi?») va odamning so‘zlarini u gapirganiga iloji boricha yaqin yozing: shunda kitob uning ovozi bilan yangraydi.",
            "Javob uzun chiqsa, uni darrov oqqa ko‘chirmang. Avval asosiy so‘zlarni yozib oling, uyda esa xotirangiz yoki diktofon yozuvi bo‘yicha to‘ldiring.",
          ],
        },
        {
          heading: "Tayyor javoblar bilan nima qilish kerak",
          paragraphs: ["Yozib olingan hikoyalarni kitobga jamlash mumkin: har bir javob bir sahifa bo‘ladi, ularga eski suratlar qo‘shiladi. Shunday qilib, buvining hikoyalari oilada uzoq saqlanadi."],
        },
      ],
      faq: [
        ["Buvi yoki bobodan qanday savollar so‘rash kerak?", "Bolalikdan boshlang: qayerda o‘sgan, uyi qanday bo‘lgan, nima o‘ynagan. Keyin — oila, ish, an’analar, eng yorqin voqealar haqida. «Buvi, bobo bilan»ni tanlab, savollarni belgilang."],
        ["Anketani chop etish mumkinmi?", "Ha. Savollarni belgilab, «Anketani chop etish» tugmasini bosing: har bir savolga javob uchun joyi bor A4 varaqlari bilan chop etish oynasi ochiladi."],
        ["Bir suhbat uchun nechta savol tanlash kerak?", "Bir uchrashuv uchun 5–10 ta savol yetarli: odam charchamaydi, javoblar esa batafsil bo‘ladi. Qolganini keyingi safar bering."],
        ["Yozuvlarni kitobga qanday aylantirish mumkin?", "Javoblarni kitob muharririga ko‘chiring: u savollarni taklif qiladi, suratlarni joylashtiradi va sahifalarni maketlaydi. Yozish bepul."],
      ],
      cta: { title: "Yozib olingan hikoyalarni kitobga jamlang", text: "Javoblar, eski suratlar va yaqinlarning xatlari — qattiq muqovada. Yozish bepul va o‘zingizga qulay sur’atda." },
    },
    en: {
      label: "Interview questionnaire for loved ones",
      h1: "Interview questionnaire:",
      accent: "questions for grandma, mum or dad, ready to print",
      metaTitle: "Interview questionnaire for grandma, mum or dad: printable questions",
      metaDescription: "Choose who to talk to, tick the questions and print a questionnaire with space for answers. Write loved ones’ stories by hand, then turn them into a book.",
      teaser: "Pick questions and print a questionnaire with room for answers, for a chat with grandma, mum or dad.",
      lead: "Not every older relative has a smartphone or the habit of dictating memories. Choose your questions, print the questionnaire, chat over tea and write the answers by hand. Later you can turn them into a book.",
      sections: [
        {
          heading: "How the questionnaire works",
          paragraphs: [
            "You choose who the conversation is with and tick the questions you like: take ten at random or build your own list. The questionnaire prints on A4 sheets: each question has three lines for the answer, and at the top there are fields for the date and the name of the person writing.",
            "For grandmas and grandfathers the questions come from the question bank of the book about a life: childhood, family, work, traditions. For mum, dad, a loved one and a friend, the questions are written for a real conversation.",
          ],
        },
        {
          heading: "How to hold the conversation",
          paragraphs: [
            "It is best to talk over tea, without hurry, and to ask two or three questions per visit. Do not interrupt, ask for details (“And what happened next?”, “What did it look like?”) and write down the person’s words as close as possible to how they say them: that way the book will sound in their voice.",
            "If an answer turns out long, do not copy it out neatly straight away. First note down the key words, then fill in the rest at home from memory or from a voice recording.",
          ],
        },
        {
          heading: "What to do with the finished answers",
          paragraphs: ["The stories you have written down can be turned into a book: each answer becomes a page, and old photos are added to them. That way grandma’s stories stay in the family for a long time."],
        },
      ],
      faq: [
        ["What questions should I ask grandma or grandpa?", "Start with childhood: where they grew up, what the house was like, what they played. Then move on to family, work, traditions and the most memorable events. Choose “With grandma or grandpa” and tick the questions."],
        ["Can I print the questionnaire?", "Yes. Tick the questions and press “Print questionnaire”: a print window opens with A4 sheets where every question has space for the answer."],
        ["How many questions should I choose for one conversation?", "5–10 questions are enough for one visit: the person will not get tired and the answers will be fuller. Ask the rest next time."],
        ["How do I turn the notes into a book?", "Copy the answers into the book editor: it suggests questions, places photos and lays out the pages. Writing is free."],
      ],
      cta: { title: "Turn the stories you wrote down into a book", text: "Answers, old photos and letters from relatives in a hardcover. Writing is free, at your own pace." },
    },
  },
};
