import type { ToolDef } from "./types";

/** Четыре теста «Как хорошо вы знаете…». Вопросы теста — в lib/tools/quiz.ts, здесь — страница вокруг них. */
export const testMama: ToolDef = {
  slug: "test-znaesh-li-ty-mamu",
  kind: "quiz",
  quiz: "mama",
  theme: "mom",
  landing: "kniga-mame",
  content: {
    ru: {
      label: "Тест: знаете ли вы маму",
      h1: "Насколько хорошо вы знаете",
      accent: "свою маму?",
      metaTitle: "Тест: как хорошо вы знаете свою маму — 10 вопросов",
      metaDescription: "Пройдите тест из 10 вопросов: знаете ли вы любимую песню мамы, её мечты, страхи и главные истории. В конце — список вопросов, которые стоит задать, пока есть возможность.",
      teaser: "10 вопросов о маме: что вы знаете точно, а что ещё предстоит узнать.",
      lead: "Десять простых утверждений о маме: её мечты, детство, страхи и гордость. Отметьте, что вы знаете точно, а что — только примерно. В конце получите результат и список вопросов, которые стоит задать.",
      sections: [
        {
          heading: "Зачем этот тест",
          paragraphs: [
            "Мы знаем маму как маму: что она приготовит, о чём волнуется, чем поделится. Но о том, кем она была до нас, о чём мечтала в шестнадцать лет и чего боялась, дети часто знают на удивление мало. Не потому что маме нечего рассказать, а потому что никто не спрашивал.",
            "Тест не оценивает вас: он показывает, о чём стоит спросить. Каждый вопрос, на который вы ответите «нет» или «примерно», — готовая тема для вечернего чаепития.",
          ],
        },
        {
          heading: "Что делать с результатом",
          paragraphs: [
            "Выберите два-три вопроса из списка и задайте их при ближайшей встрече или по телефону. Запишите ответы на диктофон — через несколько лет они будут бесценными. А если хочется сохранить всё сразу, можно собрать книгу: наши вопросы устроены так, чтобы подвести маму к лучшим историям.",
          ],
        },
      ],
      faq: [
        ["Сколько вопросов в тесте?", "Десять. За каждый ответ «знаю точно» начисляется 2 балла, «примерно» — 1, «нет» — 0. Итог переводится в проценты и в один из четырёх уровней близости."],
        ["Кто увидит мои ответы?", "Только вы. Тест работает в вашем браузере, ответы никуда не отправляются и не сохраняются."],
        ["Что делать, если я знаю мало?", "Это нормально и поправимо. Выберите несколько вопросов из итогового списка и задайте маме. Для большинства родителей такой разговор — приятный сюрприз."],
        ["Как сохранить мамины истории?", "Записывайте ответы или собирайте их в книгу: вы отвечаете на вопросы о маме, добавляете фото и получаете книгу в твёрдой обложке или в электронном виде."],
      ],
      cta: { title: "Узнайте о маме больше — и сохраните это", text: "В книге о маме вы ответите на вопросы о её детстве, мечтах и уроках, добавите фотографии и письма родных. Писать можно бесплатно." },
    },
    kk: {
      label: "Тест: анаңызды білесіз бе",
      h1: "Анаңызды қаншалықты",
      accent: "жақсы білесіз?",
      metaTitle: "Тест: анаңызды қаншалықты жақсы білесіз — 10 сұрақ",
      metaDescription: "10 сұрақтан тұратын тестті өтіңіз: анаңыздың сүйікті әнін, армандарын, қорқыныштарын және басты әңгімелерін білесіз бе. Соңында мүмкіндік барда қоюға тұратын сұрақтар тізімі беріледі.",
      teaser: "Ана туралы 10 сұрақ: нені нақты білесіз, нені әлі білу керек.",
      lead: "Ана туралы он қарапайым тұжырым: оның армандары, балалығы, қорқыныштары және мақтанышы. Нені нақты, нені шамамен білетініңізді белгілеңіз. Соңында нәтиже және қоюға тұратын сұрақтар тізімін аласыз.",
      sections: [
        {
          heading: "Бұл тест не үшін",
          paragraphs: [
            "Біз анамызды ана ретінде білеміз: не пісіретінін, нені уайымдайтынын, немен бөлісетінін. Бірақ ол бізден бұрын кім болғаны, он алты жасында нені армандағаны және неден қорыққаны туралы балалар таңқаларлықтай аз біледі. Анаға айтатын ештеңе жоқ болғандықтан емес, ешкім сұрамағандықтан.",
            "Тест сізді бағаламайды: ол нені сұрау керегін көрсетеді. «Жоқ» немесе «шамамен» деп жауап берген әр сұрақ — кешкі шай үстіндегі дайын тақырып.",
          ],
        },
        {
          heading: "Нәтижені не істеу керек",
          paragraphs: [
            "Тізімнен екі-үш сұрақты таңдап, келесі кездесуде немесе телефонмен қойыңыз. Жауаптарды дауыс жазғышқа жазып алыңыз — бірнеше жылдан кейін олар баға жетпес болады. Ал бәрін бірден сақтағыңыз келсе, кітап жинауға болады: біздің сұрақтар ананы ең жақсы әңгімелерге жетелейтіндей құрылған.",
          ],
        },
      ],
      faq: [
        ["Тестте неше сұрақ бар?", "Он. Әр «нақты білемін» жауабына 2 ұпай, «шамамен» — 1, «жоқ» — 0 беріледі. Нәтиже пайызға және жақындықтың төрт деңгейінің біріне айналады."],
        ["Менің жауаптарымды кім көреді?", "Тек сіз. Тест браузерде жұмыс істейді, жауаптар ешқайда жіберілмейді және сақталмайды."],
        ["Аз білсем не істеу керек?", "Бұл қалыпты және түзетуге болады. Қорытынды тізімнен бірнеше сұрақты таңдап, анаңыздан сұраңыз. Көптеген ата-аналар үшін мұндай әңгіме — жағымды тосын сый."],
        ["Ананың әңгімелерін қалай сақтауға болады?", "Жауаптарды жазып алыңыз немесе кітапқа жинаңыз: ана туралы сұрақтарға жауап беріп, сурет қосасыз да, қатты мұқабалы немесе электрондық кітап аласыз."],
      ],
      cta: { title: "Ана туралы көбірек біліп, оны сақтаңыз", text: "Ана туралы кітапта оның балалығы, армандары мен сабақтары туралы сұрақтарға жауап беріп, суреттер мен туыстардың хаттарын қосасыз. Жазу тегін." },
    },
    uz: {
      label: "Test: onangizni qanchalik bilasiz",
      h1: "Onangizni qanchalik",
      accent: "yaxshi bilasiz?",
      metaTitle: "Test: onangizni qanchalik yaxshi bilasiz — 10 ta savol",
      metaDescription: "10 ta savolli test: onangizning sevimli qo‘shig‘i, orzulari, qo‘rquvlari va asosiy hikoyalarini bilasizmi? Oxirida so‘rashga arziydigan savollar ro‘yxati bor.",
      teaser: "Ona haqida 10 ta savol: nimani aniq bilasiz, nimani hali bilish kerak.",
      lead: "Ona haqida o‘nta oddiy fikr: uning orzulari, bolaligi, qo‘rquvlari va g‘ururi. Nimani aniq, nimani taxminan bilishingizni belgilang. Oxirida natija va so‘rashga arziydigan savollar ro‘yxatini olasiz.",
      sections: [
        {
          heading: "Bu test nima uchun",
          paragraphs: [
            "Biz onamizni ona sifatida bilamiz: nima pishirishini, nimadan xavotir olishini, nima bilan bo‘lishishini. Ammo u bizdan oldin kim bo‘lgani, o‘n olti yoshida nimani orzu qilgani va nimadan qo‘rqqani haqida bolalar hayratlanarli darajada kam biladi. Onaga aytadigan gap yo‘qligidan emas, hech kim so‘ramaganidan.",
            "Test sizni baholamaydi: u nimani so‘rash kerakligini ko‘rsatadi. «Yo‘q» yoki «taxminan» deb javob bergan har bir savol — kechki choy ustidagi tayyor mavzu.",
          ],
        },
        {
          heading: "Natija bilan nima qilish kerak",
          paragraphs: [
            "Ro‘yxatdan ikki-uchta savol tanlab, yaqin uchrashuvda yoki telefonda bering. Javoblarni diktofonga yozib oling — bir necha yildan keyin ular bebaho bo‘ladi. Hammasini birdaniga saqlamoqchi bo‘lsangiz, kitob yig‘ish mumkin: bizning savollarimiz onani eng yaxshi hikoyalarga yetaklaydigan qilib tuzilgan.",
          ],
        },
      ],
      faq: [
        ["Testda nechta savol bor?", "O‘nta. Har bir «aniq bilaman» javobiga 2 ball, «taxminan» uchun 1, «yo‘q» uchun 0 beriladi. Yakun foizga va yaqinlikning to‘rt darajasidan biriga aylantiriladi."],
        ["Javoblarimni kim ko‘radi?", "Faqat siz. Test brauzeringizda ishlaydi, javoblar hech qayoqqa yuborilmaydi va saqlanmaydi."],
        ["Kam bilsam nima qilish kerak?", "Bu normal va tuzatsa bo‘ladi. Yakuniy ro‘yxatdan bir nechta savol tanlab, onangizdan so‘rang. Ko‘plab ota-onalar uchun bunday suhbat — yoqimli kutilmagan sovg‘a."],
        ["Onaning hikoyalarini qanday saqlash mumkin?", "Javoblarni yozib oling yoki kitobga jamlang: ona haqidagi savollarga javob berasiz, surat qo‘shasiz va qattiq muqovali yoki elektron kitob olasiz."],
      ],
      cta: { title: "Ona haqida ko‘proq bilib, buni saqlab qoling", text: "Ona haqidagi kitobda uning bolaligi, orzulari va saboqlari haqidagi savollarga javob berib, suratlar va yaqinlarning xatlarini qo‘shasiz. Yozish bepul." },
    },
    en: {
      label: "Quiz: how well do you know your mum",
      h1: "How well do you know",
      accent: "your mum?",
      metaTitle: "Quiz: how well do you know your mum? 10 questions",
      metaDescription: "Take a 10-question quiz: do you know your mum’s favourite song, dreams, fears and best stories? Then get a list of questions worth asking.",
      teaser: "10 questions about your mum: what you know for sure and what is still to discover.",
      lead: "Ten simple statements about your mum: her dreams, childhood, fears and pride. Mark what you know for sure and what only roughly. At the end you get a result and a list of questions worth asking.",
      sections: [
        {
          heading: "Why this quiz",
          paragraphs: [
            "We know our mum as our mum: what she will cook, what she worries about, what she will share. But about who she was before us, what she dreamed of at sixteen and what she feared, children often know surprisingly little. Not because mum has nothing to tell, but because nobody asked.",
            "The quiz does not grade you: it shows what to ask. Every question you answer “no” or “roughly” is a ready-made topic for an evening over tea.",
          ],
        },
        {
          heading: "What to do with the result",
          paragraphs: [
            "Pick two or three questions from the list and ask them at your next visit or on the phone. Record the answers on a voice recorder: in a few years they will be priceless. And if you want to keep everything at once, you can make a book: our questions are designed to lead your mum to her best stories.",
          ],
        },
      ],
      faq: [
        ["How many questions are in the quiz?", "Ten. Each “I know for sure” answer scores 2 points, “roughly” scores 1 and “no” scores 0. The total is converted into a percentage and one of four closeness levels."],
        ["Who will see my answers?", "Only you. The quiz runs in your browser; the answers are not sent or saved anywhere."],
        ["What if I know very little?", "That is normal and easy to fix. Choose a few questions from the final list and ask your mum. For most parents, such a conversation is a pleasant surprise."],
        ["How can I keep my mum’s stories?", "Write down the answers or collect them in a book: you answer questions about your mum, add photos and get a hardcover or digital book."],
      ],
      cta: { title: "Learn more about your mum and keep it", text: "In a book about your mum you answer questions about her childhood, dreams and lessons, and add photos and letters from relatives. Writing is free." },
    },
  },
};

export const testPapa: ToolDef = {
  slug: "test-znaesh-li-ty-papu",
  kind: "quiz",
  quiz: "papa",
  theme: "dad",
  landing: "kniga-pape",
  content: {
    ru: {
      label: "Тест: знаете ли вы папу",
      h1: "Насколько хорошо вы знаете",
      accent: "своего папу?",
      metaTitle: "Тест: как хорошо вы знаете своего папу — 10 вопросов",
      metaDescription: "Пройдите тест из 10 вопросов: знаете ли вы, как папа выбирал профессию, о чём мечтал в юности, какой урок считает главным. В конце — вопросы, которые стоит задать папе.",
      teaser: "10 вопросов о папе: профессия, мечты, главные уроки и гордость.",
      lead: "Десять утверждений о папе: его первая работа, юношеские мечты, случаи из жизни и главные уроки. Отметьте, что знаете точно, а что — нет, и получите список вопросов для разговора.",
      sections: [
        {
          heading: "Почему о папах знают меньше",
          paragraphs: [
            "Многие папы привыкли говорить о делах и планах, а не о чувствах и прошлом. Поэтому дети нередко знают, что папа делает, но не знают, что он любит, о чём жалеет и чем гордится. Это не значит, что ему нечего сказать: просто нужен подходящий вопрос и подходящий момент.",
            "Лучше всего работают вопросы о конкретных вещах: первая зарплата, самый смешной случай, любимая песня. Они не требуют «больших слов», но открывают человека.",
          ],
        },
        {
          heading: "Как использовать результат",
          paragraphs: [
            "Выберите вопрос из итогового списка и задайте его за рыбалкой, в машине или за ужином. Пусть папа расскажет историю, а вы просто слушайте. Лучшие ответы запишите — тогда их можно будет собрать в книгу о папе с фотографиями и письмами близких.",
          ],
        },
      ],
      faq: [
        ["Как считается результат теста?", "За «знаю точно» начисляется 2 балла, за «примерно» — 1, за «нет» — 0. Сумма переводится в проценты и в один из четырёх уровней: от «время начать разговор» до «вы знаете как никто»."],
        ["Какие вопросы задать папе, чтобы он открылся?", "Начните с конкретного и нейтрального: первая работа, любимая песня, самый смешной случай. После них проще перейти к урокам жизни и мечтам."],
        ["Сохраняются ли мои ответы?", "Нет. Тест работает в браузере, ничего не отправляется и не сохраняется."],
        ["Что подарить папе на день рождения или 23 февраля?", "Подарок, в котором есть его история: книга о папе с ответами на ваши вопросы, фотографиями и письмами близких. Её не купить в магазине, и она не потеряет ценность."],
      ],
      cta: { title: "Книга о папе — подарок с его историей", text: "Ответьте на вопросы о папином детстве, работе и уроках, добавьте фото — мы сверстаем и напечатаем книгу. Писать можно бесплатно." },
    },
    kk: {
      label: "Тест: әкеңізді білесіз бе",
      h1: "Әкеңізді қаншалықты",
      accent: "жақсы білесіз?",
      metaTitle: "Тест: әкеңізді қаншалықты жақсы білесіз — 10 сұрақ",
      metaDescription: "10 сұрақтан тұратын тестті өтіңіз: әкеңіз мамандықты қалай таңдағанын, жастығында нені армандағанын, қандай сабақты басты деп санайтынын білесіз бе. Соңында әкеден сұрауға тұратын сұрақтар беріледі.",
      teaser: "Әке туралы 10 сұрақ: мамандық, армандар, басты сабақтар және мақтаныш.",
      lead: "Әке туралы он тұжырым: оның алғашқы жұмысы, жастық армандары, өмірдегі оқиғалары және басты сабақтары. Нені нақты білетініңізді, нені білмейтініңізді белгілеңіз де, әңгімеге арналған сұрақтар тізімін алыңыз.",
      sections: [
        {
          heading: "Әке туралы неге аз біледі",
          paragraphs: [
            "Көп әкелер сезім мен өткен күндер туралы емес, істер мен жоспарлар туралы айтуға дағдыланған. Сондықтан балалар әкесі не істейтінін біледі, бірақ оның нені жақсы көретінін, неге өкінетінін және немен мақтанатынын білмейді. Бұл оған айтарлық ештеңе жоқ дегенді білдірмейді: тек лайықты сұрақ пен лайықты сәт керек.",
            "Нақты нәрселер туралы сұрақтар ең жақсы жұмыс істейді: алғашқы жалақы, ең күлкілі оқиға, сүйікті ән. Оларға «үлкен сөздер» керек емес, бірақ адамды ашады.",
          ],
        },
        {
          heading: "Нәтижені қалай қолдану керек",
          paragraphs: [
            "Қорытынды тізімнен сұрақ таңдап, оны балық аулағанда, көлікте немесе кешкі астың үстінде қойыңыз. Әке әңгіме айтсын, ал сіз тек тыңдаңыз. Ең жақсы жауаптарды жазып алыңыз — сонда оларды әке туралы кітапқа суреттер мен жақындардың хаттарымен жинауға болады.",
          ],
        },
      ],
      faq: [
        ["Тест нәтижесі қалай есептеледі?", "«Нақты білемін» үшін 2 ұпай, «шамамен» үшін 1, «жоқ» үшін 0 беріледі. Сома пайызға және төрт деңгейдің біріне айналады: «әңгімені бастайтын кезден» «сіз бәрінен жақсы білесіз» дейін."],
        ["Әке ашылуы үшін қандай сұрақтар қою керек?", "Нақты және бейтараптан бастаңыз: алғашқы жұмыс, сүйікті ән, ең күлкілі оқиға. Содан кейін өмір сабақтары мен армандарға көшу оңай."],
        ["Менің жауаптарым сақтала ма?", "Жоқ. Тест браузерде жұмыс істейді, ештеңе жіберілмейді және сақталмайды."],
        ["Әкеге туған күніне немесе 23 ақпанға не сыйлау керек?", "Ішінде оның тарихы бар сыйлық: сіздің сұрақтарыңызға жауаптары, суреттері және жақындардың хаттары бар әке туралы кітап. Оны дүкеннен алуға болмайды және ол құнын жоғалтпайды."],
      ],
      cta: { title: "Әке туралы кітап — оның тарихы бар сыйлық", text: "Әкенің балалығы, жұмысы және сабақтары туралы сұрақтарға жауап беріп, сурет қосыңыз — біз кітапты беттеп, басып шығарамыз. Жазу тегін." },
    },
    uz: {
      label: "Test: otangizni qanchalik bilasiz",
      h1: "Otangizni qanchalik",
      accent: "yaxshi bilasiz?",
      metaTitle: "Test: otangizni qanchalik yaxshi bilasiz — 10 ta savol",
      metaDescription: "10 ta savolli test: otangiz kasbni qanday tanlagani, yoshligida nimani orzu qilgani, qaysi saboqni asosiy deb bilishini bilasizmi? Oxirida savollar bor.",
      teaser: "Ota haqida 10 ta savol: kasb, orzular, asosiy saboqlar va g‘urur.",
      lead: "Ota haqida o‘nta fikr: uning birinchi ishi, yoshlik orzulari, hayotdagi voqealari va asosiy saboqlari. Nimani aniq bilishingiz, nimani bilmasligingizni belgilang va suhbat uchun savollar ro‘yxatini oling.",
      sections: [
        {
          heading: "Ota haqida nega kamroq bilishadi",
          paragraphs: [
            "Ko‘p otalar his-tuyg‘u va o‘tmish haqida emas, ishlar va rejalar haqida gapirishga o‘rganib qolgan. Shuning uchun bolalar otasi nima qilishini biladi, lekin u nimani yaxshi ko‘rishini, nimaga afsuslanishini va nima bilan faxrlanishini bilmaydi. Bu uning aytadigan gapi yo‘q degani emas: shunchaki to‘g‘ri savol va to‘g‘ri payt kerak.",
            "Aniq narsalar haqidagi savollar eng yaxshi ishlaydi: birinchi maosh, eng kulgili voqea, sevimli qo‘shiq. Ular «katta so‘zlar»ni talab qilmaydi, lekin insonni ochadi.",
          ],
        },
        {
          heading: "Natijadan qanday foydalanish kerak",
          paragraphs: [
            "Yakuniy ro‘yxatdan savol tanlab, uni baliq ovlayotganda, mashinada yoki kechki ovqat paytida bering. Ota hikoya aytsin, siz esa shunchaki tinglang. Eng yaxshi javoblarni yozib oling — keyin ularni ota haqidagi kitobga suratlar va yaqinlarning xatlari bilan jamlash mumkin.",
          ],
        },
      ],
      faq: [
        ["Test natijasi qanday hisoblanadi?", "«Aniq bilaman» uchun 2 ball, «taxminan» uchun 1, «yo‘q» uchun 0 beriladi. Yig‘indi foizga va to‘rt darajadan biriga aylantiriladi: «suhbatni boshlash vaqti»dan «sizdan yaxshi hech kim bilmaydi»gacha."],
        ["Ota ochilishi uchun qanday savollar berish kerak?", "Aniq va betaraf savoldan boshlang: birinchi ish, sevimli qo‘shiq, eng kulgili voqea. Shundan keyin hayot saboqlari va orzulariga o‘tish osonroq."],
        ["Javoblarim saqlanadimi?", "Yo‘q. Test brauzerda ishlaydi, hech narsa yuborilmaydi va saqlanmaydi."],
        ["Otaga tug‘ilgan kuniga yoki 23-fevralga nima sovg‘a qilish kerak?", "Ichida uning tarixi bor sovg‘a: savollaringizga javoblari, suratlari va yaqinlarning xatlari bor ota haqidagi kitob. Uni do‘kondan sotib bo‘lmaydi va u qadrini yo‘qotmaydi."],
      ],
      cta: { title: "Ota haqidagi kitob — uning tarixi bor sovg‘a", text: "Otaning bolaligi, ishi va saboqlari haqidagi savollarga javob berib, surat qo‘shing — kitobni biz maketlab, bosib beramiz. Yozish bepul." },
    },
    en: {
      label: "Quiz: how well do you know your dad",
      h1: "How well do you know",
      accent: "your dad?",
      metaTitle: "Quiz: how well do you know your dad? 10 questions",
      metaDescription: "Take a 10-question quiz: do you know how your dad chose his career, what he dreamed of and which lesson matters most? Get questions to ask him.",
      teaser: "10 questions about your dad: career, dreams, main lessons and pride.",
      lead: "Ten statements about your dad: his first job, youthful dreams, stories from his life and main lessons. Mark what you know for sure and what you do not, and get a list of questions for a conversation.",
      sections: [
        {
          heading: "Why we know less about dads",
          paragraphs: [
            "Many dads are used to talking about work and plans rather than feelings and the past. So children often know what their dad does, but not what he loves, what he regrets and what he is proud of. That does not mean he has nothing to say: he just needs the right question at the right moment.",
            "Questions about concrete things work best: a first salary, the funniest incident, a favourite song. They do not call for “big words”, yet they open a person up.",
          ],
        },
        {
          heading: "How to use the result",
          paragraphs: [
            "Pick a question from the final list and ask it while fishing, in the car or over dinner. Let your dad tell the story, and just listen. Write down the best answers: later they can be collected into a book about your dad with photos and letters from loved ones.",
          ],
        },
      ],
      faq: [
        ["How is the quiz result calculated?", "“I know for sure” scores 2 points, “roughly” scores 1 and “no” scores 0. The sum is converted into a percentage and one of four levels, from “time to start talking” to “you know him like no one else”."],
        ["What questions should I ask my dad to get him to open up?", "Start with something concrete and neutral: a first job, a favourite song, the funniest incident. After those, it is easier to move on to life lessons and dreams."],
        ["Are my answers saved?", "No. The quiz runs in the browser; nothing is sent or saved."],
        ["What should I give my dad for his birthday or Father’s Day?", "A gift with his story in it: a book about your dad with answers to your questions, photos and letters from loved ones. You cannot buy it in a shop, and it will never lose its value."],
      ],
      cta: { title: "A book about your dad: a gift with his story", text: "Answer questions about your dad’s childhood, work and lessons, add photos, and we will lay out and print the book. Writing is free." },
    },
  },
};

export const testBabushka: ToolDef = {
  slug: "test-znaesh-li-ty-babushku",
  kind: "quiz",
  quiz: "babushka",
  theme: "autobiography",
  landing: "podarok-babushke",
  content: {
    ru: {
      label: "Тест: знаете ли вы бабушку",
      h1: "Насколько хорошо вы знаете",
      accent: "свою бабушку?",
      metaTitle: "Тест: как хорошо вы знаете свою бабушку — 10 вопросов",
      metaDescription: "Пройдите тест из 10 вопросов: знаете ли вы, где выросла бабушка, как она встретила дедушку, какие праздники помнит из детства. В конце — вопросы, которые стоит задать, пока есть возможность.",
      teaser: "10 вопросов о бабушке: детство, семья, традиции и рецепты, которые нигде не записаны.",
      lead: "Десять утверждений о бабушке: где она выросла, как познакомилась с дедушкой, какие традиции хранит. Отметьте, что вы знаете точно, а что — нет, и получите вопросы для первой беседы.",
      sections: [
        {
          heading: "Истории, которые нигде не записаны",
          paragraphs: [
            "У старшего поколения за плечами целая эпоха: детство в другом мире, традиции, которых уже нет, рецепты без граммов, песни без нот. Всё это хранится только в памяти бабушек и дедушек. Когда их не станет, эти знания исчезнут вместе с ними — поэтому записывать нужно сейчас.",
            "Бабушки часто говорят: «Да что там рассказывать». Но стоит задать конкретный вопрос — о платье на свадьбе, о первой работе, о детской песне, — как рассказ идёт сам.",
          ],
        },
        {
          heading: "Как записать рассказы бабушки",
          paragraphs: [
            "Начните с двух-трёх вопросов из итогового списка и задайте их за чаем. Включите диктофон, не перебивайте и просите вспомнить детали: «Что тогда было на столе?», «Как это пахло?». Из записей получится семейная книга, которую будут читать и правнуки.",
          ],
        },
      ],
      faq: [
        ["Как узнать больше о жизни бабушки?", "Задавайте конкретные вопросы о детстве, свадьбе, первой работе, праздниках. Лучше по одному за раз и без спешки. Тест подскажет, с чего начать."],
        ["Что делать, если бабушка живёт далеко?", "Звоните по видеосвязи и записывайте разговор. Вопросы из итогового списка подходят и для звонка."],
        ["Сохраняются ли мои ответы?", "Нет. Тест работает в вашем браузере, ответы никуда не отправляются."],
        ["Как оформить рассказы бабушки в книгу?", "Выберите книгу о жизни: вы вместе с бабушкой отвечаете на вопросы, добавляете старые фотографии и получаете книгу, которую можно подарить всей семье."],
      ],
      cta: { title: "Сохраните истории бабушки в книге", text: "Вопросы о детстве, семье и традициях, старые фотографии и письма внуков — всё в одной книге. Писать можно бесплатно." },
    },
    kk: {
      label: "Тест: әжеңізді білесіз бе",
      h1: "Әжеңізді қаншалықты",
      accent: "жақсы білесіз?",
      metaTitle: "Тест: әжеңізді қаншалықты жақсы білесіз — 10 сұрақ",
      metaDescription: "10 сұрақтан тұратын тестті өтіңіз: әжеңіздің қайда өскенін, атамен қалай кездескенін, балалығынан қандай мерекелерді еске алатынын білесіз бе. Соңында мүмкіндік барда қоюға тұратын сұрақтар беріледі.",
      teaser: "Әже туралы 10 сұрақ: балалық, отбасы, дәстүрлер және еш жерде жазылмаған рецепттер.",
      lead: "Әже туралы он тұжырым: қайда өскені, атамен қалай танысқаны, қандай дәстүрлерді сақтайтыны. Нені нақты білетініңізді, нені білмейтініңізді белгілеңіз де, алғашқы әңгімеге арналған сұрақтарды алыңыз.",
      sections: [
        {
          heading: "Еш жерде жазылмаған әңгімелер",
          paragraphs: [
            "Үлкен буынның артында тұтас дәуір бар: басқа әлемдегі балалық, енді жоқ дәстүрлер, граммсыз рецепттер, нотасыз әндер. Мұның бәрі тек әже мен атаның жадында сақталған. Олар болмаған кезде бұл білім олармен бірге кетеді — сондықтан қазір жазып алған жөн.",
            "Әжелер жиі «не айтуға болады дейсің» дейді. Бірақ нақты сұрақ қойсаңыз — тойдағы көйлек туралы, алғашқы жұмыс туралы, балалық ән туралы — әңгіме өздігінен басталады.",
          ],
        },
        {
          heading: "Әжеңіздің әңгімелерін қалай жазып алуға болады",
          paragraphs: [
            "Қорытынды тізімнен екі-үш сұрақпен бастап, шай үстінде қойыңыз. Дауыс жазғышты қосып, бөлмей, бөлшектерді еске түсіруді сұраңыз: «Сонда дастарханда не болды?», «Ол қандай иіс шығарды?». Жазбалардан шөберелері де оқитын отбасылық кітап шығады.",
          ],
        },
      ],
      faq: [
        ["Әжемнің өмірі туралы көбірек қалай білуге болады?", "Балалығы, тойы, алғашқы жұмысы, мерекелері туралы нақты сұрақтар қойыңыз. Бір-бірден және асықпай. Тест қайдан бастау керегін айтады."],
        ["Әжем алыс тұрса не істеу керек?", "Бейнебайланыспен қоңырау шалып, әңгімені жазып алыңыз. Қорытынды тізімдегі сұрақтар қоңырауға да жарайды."],
        ["Менің жауаптарым сақтала ма?", "Жоқ. Тест браузерде жұмыс істейді, жауаптар ешқайда жіберілмейді."],
        ["Әженің әңгімелерін кітапқа қалай рәсімдеуге болады?", "Өмір туралы кітапты таңдаңыз: әжеңізбен бірге сұрақтарға жауап беріп, ескі суреттерді қосасыз да, бүкіл отбасына сыйлауға болатын кітап аласыз."],
      ],
      cta: { title: "Әженің әңгімелерін кітапта сақтаңыз", text: "Балалық, отбасы және дәстүрлер туралы сұрақтар, ескі суреттер мен немерелердің хаттары — бәрі бір кітапта. Жазу тегін." },
    },
    uz: {
      label: "Test: buvingizni qanchalik bilasiz",
      h1: "Buvingizni qanchalik",
      accent: "yaxshi bilasiz?",
      metaTitle: "Test: buvingizni qanchalik yaxshi bilasiz — 10 ta savol",
      metaDescription: "10 ta savolli test: buvingiz qayerda o‘sgani, bobongiz bilan qanday uchrashgani, bolaligidan qaysi bayramlarni eslashini bilasizmi? Oxirida savollar bor.",
      teaser: "Buvi haqida 10 ta savol: bolalik, oila, an’analar va hech qayerda yozilmagan retseptlar.",
      lead: "Buvi haqida o‘nta fikr: qayerda o‘sgani, bobo bilan qanday tanishgani, qaysi an’analarni saqlashi. Nimani aniq bilishingiz, nimani bilmasligingizni belgilang va birinchi suhbat uchun savollarni oling.",
      sections: [
        {
          heading: "Hech qayerda yozilmagan hikoyalar",
          paragraphs: [
            "Katta avlodning ortida butun bir davr turibdi: boshqa dunyodagi bolalik, endi yo‘q an’analar, grammsiz retseptlar, notasiz qo‘shiqlar. Bularning hammasi faqat buvi va bobolarning xotirasida saqlanadi. Ular bo‘lmaganda bu bilimlar ular bilan birga ketadi — shuning uchun hozir yozib olish kerak.",
            "Buvilar ko‘pincha «nima ham deyman» deydi. Lekin aniq savol bersangiz — to‘ydagi ko‘ylak haqida, birinchi ish haqida, bolalikdagi qo‘shiq haqida — hikoya o‘zi boshlanadi.",
          ],
        },
        {
          heading: "Buvingiz hikoyalarini qanday yozib olish mumkin",
          paragraphs: [
            "Yakuniy ro‘yxatdan ikki-uchta savol bilan boshlab, choy ustida bering. Diktofonni yoqing, gapini bo‘lmang va tafsilotlarni eslashni so‘rang: «U paytda dasturxonda nima bor edi?», «U qanday hid taratardi?». Yozuvlardan chevaralar ham o‘qiydigan oilaviy kitob chiqadi.",
          ],
        },
      ],
      faq: [
        ["Buvimning hayoti haqida ko‘proq qanday bilsam bo‘ladi?", "Bolalik, to‘y, birinchi ish, bayramlar haqida aniq savollar bering. Birma-bir va shoshilmay. Test qayerdan boshlashni aytadi."],
        ["Buvim uzoqda yashasa nima qilish kerak?", "Video aloqada qo‘ng‘iroq qilib, suhbatni yozib oling. Yakuniy ro‘yxatdagi savollar qo‘ng‘iroq uchun ham mos."],
        ["Javoblarim saqlanadimi?", "Yo‘q. Test brauzeringizda ishlaydi, javoblar hech qayoqqa yuborilmaydi."],
        ["Buvining hikoyalarini kitobga qanday aylantirish mumkin?", "Hayot haqidagi kitobni tanlang: buvingiz bilan birga savollarga javob berib, eski suratlarni qo‘shasiz va butun oilaga sovg‘a qilish mumkin bo‘lgan kitob olasiz."],
      ],
      cta: { title: "Buvining hikoyalarini kitobda saqlang", text: "Bolalik, oila va an’analar haqidagi savollar, eski suratlar va nevaralarning xatlari — hammasi bitta kitobda. Yozish bepul." },
    },
    en: {
      label: "Quiz: how well do you know your grandma",
      h1: "How well do you know",
      accent: "your grandma?",
      metaTitle: "Quiz: how well do you know your grandma? 10 questions",
      metaDescription: "Take a 10-question quiz: do you know where your grandma grew up, how she met your grandfather, which holidays she recalls? Get questions to ask.",
      teaser: "10 questions about your grandma: childhood, family, traditions and recipes written down nowhere.",
      lead: "Ten statements about your grandma: where she grew up, how she met your grandfather and which traditions she keeps. Mark what you know for sure and what you do not, and get questions for a first conversation.",
      sections: [
        {
          heading: "Stories written down nowhere",
          paragraphs: [
            "The older generation carries a whole era: a childhood in another world, traditions that no longer exist, recipes without grams, songs without notes. All of it lives only in the memory of grandmothers and grandfathers. When they are gone, this knowledge goes with them, so it needs to be written down now.",
            "Grandmas often say: “Oh, what is there to tell.” But ask a concrete question, such as about a wedding dress, a first job or a children’s song, and the story comes by itself.",
          ],
        },
        {
          heading: "How to record your grandma’s stories",
          paragraphs: [
            "Start with two or three questions from the final list and ask them over tea. Switch on a voice recorder, do not interrupt, and ask her to recall details: “What was on the table then?”, “What did it smell like?”. The recordings can become a family book that even great-grandchildren will read.",
          ],
        },
      ],
      faq: [
        ["How can I learn more about my grandma’s life?", "Ask concrete questions about her childhood, wedding, first job and holidays. One at a time and without hurry works best. The quiz will suggest where to start."],
        ["What if my grandma lives far away?", "Call her on video and record the conversation. The questions from the final list work well for a call too."],
        ["Are my answers saved?", "No. The quiz runs in your browser, and the answers are not sent anywhere."],
        ["How do I turn my grandma’s stories into a book?", "Choose the book about a life: together with your grandma you answer the questions, add old photos and get a book you can give to the whole family."],
      ],
      cta: { title: "Keep your grandma’s stories in a book", text: "Questions about childhood, family and traditions, old photos and letters from grandchildren, all in one book. Writing is free." },
    },
  },
};

export const testLyubimyj: ToolDef = {
  slug: "test-znaesh-li-ty-lyubimogo",
  kind: "quiz",
  quiz: "lyubimyj",
  theme: "love",
  landing: "podarok-lyubimomu",
  content: {
    ru: {
      label: "Тест: знаете ли вы любимого человека",
      h1: "Насколько хорошо вы знаете",
      accent: "любимого человека?",
      metaTitle: "Тест на знание любимого человека: 10 вопросов о вашей паре",
      metaDescription: "Пройдите тест из 10 вопросов: знаете ли вы мечты, страхи и любимые мелочи вашего партнёра. В конце — вопросы для вечера вдвоём, которые сближают сильнее подарков.",
      teaser: "10 вопросов о партнёре: мечты, страхи, любимые мелочи — и вопросы для вечера вдвоём.",
      lead: "Десять утверждений о любимом человеке: что ему понравилось в вас сразу, о чём он мечтает, чего боится. Отметьте, что знаете точно, а что — нет, и получите вопросы для разговора вдвоём.",
      sections: [
        {
          heading: "Почему стоит проверять",
          paragraphs: [
            "С годами мы привыкаем к ощущению, что знаем партнёра насквозь. А потом выясняется, что мечты за это время изменились, а некоторые истории из детства так и не прозвучали. Узнавать друг друга заново — один из простых способов сохранить близость.",
            "Тест не нужно проходить вдвоём «на оценку». Достаточно честно отметить, что вы знаете, и использовать вопросы как повод для вечернего разговора.",
          ],
        },
        {
          heading: "Вечер вопросов вдвоём",
          paragraphs: [
            "Выберите три вопроса из итогового списка, отложите телефоны и задайте их друг другу. Отвечайте подробно, с историями, и записывайте то, что хочется запомнить. Это лучшая основа для подарка на годовщину или день рождения: книга о вашей истории, собранная из таких ответов.",
          ],
        },
      ],
      faq: [
        ["Как считается результат?", "«Знаю точно» — 2 балла, «примерно» — 1, «нет» — 0. Сумма переводится в проценты и в один из четырёх уровней близости."],
        ["Можно ли пройти тест вдвоём?", "Да, каждый может пройти его отдельно и сравнить результаты. Это не соревнование: главное — вопросы, которые вы зададите друг другу после теста."],
        ["Сохраняются ли мои ответы?", "Нет, тест работает в браузере, ничего не отправляется и не сохраняется."],
        ["Что подарить любимому человеку, когда уже всё подарено?", "Историю: книга о вашей паре с воспоминаниями, фотографиями и словами, которые давно хотелось сказать. Такой подарок нельзя повторить, он единственный."],
      ],
      cta: { title: "Подарите книгу о вашей истории", text: "Знакомство, первые свидания, мечты и слова, которые давно хотелось сказать, — в одной книге. Писать можно бесплатно." },
    },
    kk: {
      label: "Тест: сүйікті адамыңызды білесіз бе",
      h1: "Сүйікті адамыңызды қаншалықты",
      accent: "жақсы білесіз?",
      metaTitle: "Сүйікті адамды білу тесті: жұбыңыз туралы 10 сұрақ",
      metaDescription: "10 сұрақтан тұратын тестті өтіңіз: серіктесіңіздің армандарын, қорқыныштарын және сүйікті ұсақ-түйектерін білесіз бе. Соңында екеуара кешке арналған сұрақтар беріледі.",
      teaser: "Серіктес туралы 10 сұрақ: армандар, қорқыныштар, сүйікті ұсақ-түйектер — және екеуара кешке сұрақтар.",
      lead: "Сүйікті адам туралы он тұжырым: сізде оған бірден не ұнады, нені армандайды, неден қорқады. Нені нақты білетініңізді, нені білмейтініңізді белгілеңіз де, екеуара әңгімеге арналған сұрақтарды алыңыз.",
      sections: [
        {
          heading: "Неге тексерген жөн",
          paragraphs: [
            "Жылдар өте серіктесімізді түгел білеміз деген сезімге үйренеміз. Содан кейін армандар өзгергені, ал балалықтан кейбір әңгімелердің ешқашан айтылмағаны белгілі болады. Бір-бірін қайта тану — жақындықты сақтаудың қарапайым жолдарының бірі.",
            "Тестті екеуіңіз «баға үшін» өтудің қажеті жоқ. Нені білетініңізді адал белгілеп, сұрақтарды кешкі әңгімеге себеп ретінде қолдану жеткілікті.",
          ],
        },
        {
          heading: "Екеуара сұрақтар кеші",
          paragraphs: [
            "Қорытынды тізімнен үш сұрақ таңдап, телефондарды қойып, бір-біріңізге қойыңыз. Толық, әңгімелермен жауап беріп, есте қалдырғыңыз келгенді жазып алыңыз. Бұл — мерейлі жылдыққа немесе туған күнге сыйлықтың ең жақсы негізі: осындай жауаптардан жиналған сіздердің тарихыңыз туралы кітап.",
          ],
        },
      ],
      faq: [
        ["Нәтиже қалай есептеледі?", "«Нақты білемін» — 2 ұпай, «шамамен» — 1, «жоқ» — 0. Сома пайызға және жақындықтың төрт деңгейінің біріне айналады."],
        ["Тестті екеуміз өте аламыз ба?", "Иә, әрқайсысы жеке өтіп, нәтижелерді салыстыра алады. Бұл жарыс емес: басты нәрсе — тесттен кейін бір-біріңізге қоятын сұрақтар."],
        ["Менің жауаптарым сақтала ма?", "Жоқ, тест браузерде жұмыс істейді, ештеңе жіберілмейді және сақталмайды."],
        ["Бәрі сыйланған болса, сүйікті адамға не сыйлау керек?", "Тарихты: естеліктер, суреттер және көптен айтқыңыз келген сөздер бар сіздердің жұбыңыз туралы кітап. Мұндай сыйлықты қайталау мүмкін емес, ол жалғыз."],
      ],
      cta: { title: "Сіздердің тарихыңыз туралы кітап сыйлаңыз", text: "Танысу, алғашқы кездесулер, армандар және көптен айтқыңыз келген сөздер — бір кітапта. Жазу тегін." },
    },
    uz: {
      label: "Test: sevimli insoningizni qanchalik bilasiz",
      h1: "Sevimli insoningizni qanchalik",
      accent: "yaxshi bilasiz?",
      metaTitle: "Sevimli insonni bilish testi: juftingiz haqida 10 ta savol",
      metaDescription: "10 ta savolli test: sherigingizning orzulari, qo‘rquvlari va sevimli mayda-chuydalarini bilasizmi? Oxirida ikkovlon kechqurun uchun savollar bor.",
      teaser: "Sherik haqida 10 ta savol: orzular, qo‘rquvlar, sevimli mayda-chuydalar — va ikkovlon kechqurun uchun savollar.",
      lead: "Sevimli inson haqida o‘nta fikr: unga sizdan nima darrov yoqqani, nimani orzu qilishi, nimadan qo‘rqishi. Nimani aniq bilishingiz, nimani bilmasligingizni belgilang va ikkovlon suhbat uchun savollarni oling.",
      sections: [
        {
          heading: "Nega tekshirib ko‘rish kerak",
          paragraphs: [
            "Yillar o‘tishi bilan sherigimizni boshdan-oyoq bilamiz degan tuyg‘uga o‘rganib qolamiz. Keyin esa orzular o‘zgargani, bolalikdagi ba’zi hikoyalar hech aytilmagani ma’lum bo‘ladi. Bir-birini qaytadan tanish — yaqinlikni saqlashning oddiy yo‘llaridan biri.",
            "Testni ikkovingiz «baho uchun» topshirishingiz shart emas. Nimani bilishingizni halol belgilab, savollarni kechki suhbatga sabab sifatida ishlatish yetarli.",
          ],
        },
        {
          heading: "Ikkovlon savollar kechasi",
          paragraphs: [
            "Yakuniy ro‘yxatdan uchta savol tanlab, telefonlarni chetga qo‘ying va bir-biringizga bering. Batafsil, hikoyalar bilan javob bering va esda qoldirmoqchi bo‘lganingizni yozib oling. Bu — yilligingiz yoki tug‘ilgan kuningizga sovg‘aning eng yaxshi asosi: shunday javoblardan yig‘ilgan sizlarning tarixingiz haqidagi kitob.",
          ],
        },
      ],
      faq: [
        ["Natija qanday hisoblanadi?", "«Aniq bilaman» — 2 ball, «taxminan» — 1, «yo‘q» — 0. Yig‘indi foizga va yaqinlikning to‘rt darajasidan biriga aylantiriladi."],
        ["Testni ikkovimiz topshirsak bo‘ladimi?", "Ha, har kim alohida topshirib, natijalarni solishtirishi mumkin. Bu musobaqa emas: asosiysi — testdan keyin bir-biringizga beradigan savollar."],
        ["Javoblarim saqlanadimi?", "Yo‘q, test brauzerda ishlaydi, hech narsa yuborilmaydi va saqlanmaydi."],
        ["Hammasi sovg‘a qilingan bo‘lsa, sevimli insonga nima sovg‘a qilish kerak?", "Tarixni: xotiralar, suratlar va uzoq vaqtdan beri aytmoqchi bo‘lgan so‘zlar bor juftligingiz haqidagi kitob. Bunday sovg‘ani takrorlab bo‘lmaydi, u yagona."],
      ],
      cta: { title: "Tarixingiz haqida kitob sovg‘a qiling", text: "Tanishuv, dastlabki uchrashuvlar, orzular va uzoq vaqtdan beri aytmoqchi bo‘lgan so‘zlar — bitta kitobda. Yozish bepul." },
    },
    en: {
      label: "Quiz: how well do you know your loved one",
      h1: "How well do you know",
      accent: "your loved one?",
      metaTitle: "Quiz: how well do you know your partner? 10 questions for couples",
      metaDescription: "Take a 10-question quiz: do you know your partner’s dreams, fears and favourite little things? Get questions for an evening together.",
      teaser: "10 questions about your partner: dreams, fears, favourite little things, plus questions for an evening together.",
      lead: "Ten statements about your loved one: what they liked about you straight away, what they dream of, what they fear. Mark what you know for sure and what you do not, and get questions for a talk together.",
      sections: [
        {
          heading: "Why it is worth checking",
          paragraphs: [
            "Over the years we get used to feeling that we know our partner inside out. Then it turns out that their dreams have changed in the meantime, and some stories from their childhood were never told. Getting to know each other again is one of the simple ways to stay close.",
            "You do not need to take the quiz together “for a grade”. It is enough to mark honestly what you know and to use the questions as a reason for an evening conversation.",
          ],
        },
        {
          heading: "An evening of questions together",
          paragraphs: [
            "Pick three questions from the final list, put your phones away and ask them to each other. Answer in detail, with stories, and write down what you want to remember. It is the best basis for an anniversary or birthday gift: a book about your story, built from such answers.",
          ],
        },
      ],
      faq: [
        ["How is the result calculated?", "“I know for sure” scores 2 points, “roughly” scores 1 and “no” scores 0. The sum is converted into a percentage and one of four closeness levels."],
        ["Can we take the quiz together?", "Yes, each of you can take it separately and compare results. It is not a competition: what matters is the questions you ask each other afterwards."],
        ["Are my answers saved?", "No, the quiz runs in the browser; nothing is sent or saved."],
        ["What should I give my loved one when they already have everything?", "A story: a book about the two of you, with memories, photos and words you have long wanted to say. Such a gift cannot be repeated; it is one of a kind."],
      ],
      cta: { title: "Give a book about your story", text: "How you met, your first dates, your dreams and the words you have long wanted to say, all in one book. Writing is free." },
    },
  },
};
