import type { Article } from "./types";

export const voprosyMame: Article = {
  slug: "voprosy-mame",
  published: "2026-10-05",
  readMinutes: 7,
  theme: "mom",
  bank: { afterSection: 2, perChapter: 4, skip: ["intro"], author: "f", recipient: "f" },
  landings: ["kniga-mame", "podarok-na-yubilej-mame", "podarok-na-8-marta"],
  content: {
    ru: {
      title: "Вопросы маме о жизни, детстве и семье: что спросить, пока есть возможность",
      description: "Подборка вопросов, которые стоит задать маме: о детстве, молодости, семье и жизненных уроках. Как провести разговор и сохранить ответы в книге.",
      lead: "Мы редко задумываемся, как мало знаем о жизни мамы до нашего рождения. Эти вопросы помогут начать разговор, а ответы — сохранить для себя и будущих поколений.",
      sections: [
        {
          heading: "Зачем спрашивать маму о её жизни",
          paragraphs: [
            "Истории мам часто остаются в памяти только одного человека. Пока мы заняты работой и делами, подробности — как мама выбирала профессию, о чём мечтала, чего боялась — незаметно уходят вместе с поколением.",
            "Разговор по вопросам не похож на допрос. Он сближает: мама чувствует, что её жизнь интересна, а вы узнаёте человека, которого, казалось, знали всегда.",
          ],
        },
        {
          heading: "Как провести разговор",
          list: [
            "Выберите спокойное время — за чаем, а не между делами.",
            "Начинайте с лёгких тем: детство, школа, любимые блюда и песни.",
            "Не перебивайте и не поправляйте — важно не то, как было «на самом деле», а как мама это помнит.",
            "Включите диктофон на телефоне: потом вы сможете записать ответы дословно.",
            "Не пытайтесь пройти все вопросы за раз — достаточно одного-двух вечеров в неделю.",
          ],
        },
        {
          heading: "Что делать с ответами",
          paragraphs: [
            "Устные рассказы легко потерять, а записанные — сохранить. Выберите вопросы, на которые вы получили самые тёплые ответы, и оформите их в книгу: с главами, фотографиями и обложкой.",
            "Вы отвечаете на такие же вопросы по главам, добавляете фото и выбираете оформление. Макет можно посмотреть до заказа, а готовую книгу мы напечатаем в твёрдом переплёте и доставим по Казахстану.",
          ],
        },
      ],
      questions: { heading: "Вопросы маме по главам", intro: "Это вопросы из книги «Маме»: их можно задать вслух или ответить на них самому, если вы пишете книгу о маме." },
      faq: [
        ["С чего начать разговор, если мама не любит рассказывать о себе?", "Начните с фотографий: попросите рассказать, где и когда сделан снимок. Истории вокруг снимков обычно идут легче, чем прямые вопросы."],
        ["Что делать, если мама не хочет вспоминать некоторые периоды?", "Пропускайте такие темы. Из банка вопросов можно выбрать только те, на которые ей приятно отвечать, — в книгу попадают только заполненные ответы."],
      ],
      cta: { title: "Превратите ответы в книгу", text: "Записывайте ответы на вопросы по главам, добавляйте фото и выбирайте обложку — мы напечатаем настоящую книгу. Писать можно бесплатно." },
    },
    kk: {
      title: "Анаға қоятын сұрақтар: өмірі, балалық шағы және отбасы туралы не сұрау керек",
      description: "Анаға қоюға тұрарлық сұрақтар жинағы: балалық шақ, жастық шақ, отбасы және өмір сабақтары туралы. Әңгімені қалай өткізу және жауаптарды кітапқа қалай сақтау керек.",
      lead: "Біз анамыздың біз туылмай тұрғандағы өмірін қаншалықты аз білетінімізді сирек ойлаймыз. Бұл сұрақтар әңгіме бастауға көмектеседі, ал жауаптарды өзіңіз үшін және болашақ ұрпақ үшін сақтауға болады.",
      sections: [
        {
          heading: "Анадан өмірі туралы не үшін сұрау керек",
          paragraphs: [
            "Аналардың әңгімелері көбіне бір адамның жадында ғана қалады. Біз жұмыспен, шаруамен жүргенде бөлшектер — ана мамандықты қалай таңдады, нені армандады, неден қорықты — бір буынмен бірге байқалмай кетеді.",
            "Сұрақ арқылы сөйлесу жауап алуға ұқсамайды. Ол жақындатады: ана өз өмірінің қызықты екенін сезеді, ал сіз әрқашан біліп жүргендей көрінген адамды жаңадан танисыз.",
          ],
        },
        {
          heading: "Әңгімені қалай өткізу керек",
          list: [
            "Тыныш уақытты таңдаңыз — шаруаның арасында емес, шай үстінде.",
            "Жеңіл тақырыптардан бастаңыз: балалық шақ, мектеп, сүйікті тағамдар мен әндер.",
            "Сөзін бөлмеңіз және түзетпеңіз: маңыздысы «шын мәнінде» қалай болғаны емес, ананың оны қалай есте сақтағаны.",
            "Телефонда диктофонды қосыңыз: кейін жауаптарды сөзбе-сөз жаза аласыз.",
            "Барлық сұрақты бірден өтуге тырыспаңыз — аптасына бір-екі кеш жеткілікті.",
          ],
        },
        {
          heading: "Жауаптармен не істеу керек",
          paragraphs: [
            "Ауызша әңгімені жоғалту оңай, ал жазылғанды сақтауға болады. Ең жылы жауап алған сұрақтарды таңдап, оларды кітапқа айналдырыңыз: тарауларымен, суреттерімен және мұқабасымен.",
            "Сіз осындай сұрақтарға тарау бойынша жауап беріп, сурет қосып, безендіруді таңдайсыз. Макетті тапсырыс алдында көруге болады, ал дайын кітапты қатты мұқабада басып, Қазақстан бойынша жеткіземіз.",
          ],
        },
      ],
      questions: { heading: "Анаға қоятын сұрақтар тараулар бойынша", intro: "Бұл «Анаға» кітабындағы сұрақтар: оларды дауыстап қоюға немесе ана туралы кітап жазсаңыз, өзіңіз жауап беруге болады." },
      faq: [
        ["Ана өзі туралы айтқанды ұнатпаса, әңгімені неден бастау керек?", "Суреттерден бастаңыз: суреттің қашан, қайда түсірілгенін айтып беруін сұраңыз. Суреттер төңірегіндегі әңгіме әдетте тікелей сұраққа қарағанда жеңілірек жүреді."],
        ["Ана өмірінің кейбір кезеңдерін еске алғысы келмесе ше?", "Ондай тақырыптарды өткізіп жіберіңіз. Сұрақ банкінен оған жағымды сұрақтарды ғана таңдауға болады — кітапқа тек толтырылған жауаптар кіреді."],
      ],
      cta: { title: "Жауаптарды кітапқа айналдырыңыз", text: "Тараулар бойынша сұрақтарға жауап жазып, сурет қосып, мұқаба таңдаңыз — біз нағыз кітап басып шығарамыз. Жазу тегін." },
    },
    uz: {
      title: "Onaga hayot, bolalik va oila haqida savollar: imkon bor ekan, nima so‘rash kerak",
      description: "Onadan so‘rashga arziydigan savollar to‘plami: bolalik, yoshlik, oila va hayot saboqlari haqida. Suhbatni qanday o‘tkazish va javoblarni kitobda saqlash.",
      lead: "Biz tug‘ilishimizdan oldingi onamizning hayoti haqida qanchalik oz bilishimiz haqida kamdan-kam o‘ylaymiz. Bu savollar suhbatni boshlashga, javoblar esa o‘zingiz va kelajak avlodlar uchun saqlab qolishga yordam beradi.",
      sections: [
        {
          heading: "Onadan hayoti haqida nega so‘rash kerak",
          paragraphs: [
            "Onalarning hikoyalari ko‘pincha bitta odamning xotirasida qoladi. Biz ish va tashvishlar bilan band ekanmiz, onamiz kasbni qanday tanlagani, nimani orzu qilgani, nimadan qo‘rqqani kabi tafsilotlar avlod bilan birga sezdirmay ketib boradi.",
            "Savollar asosidagi suhbat so‘roqqa o‘xshamaydi. U yaqinlashtiradi: ona hayoti qiziq ekanini his qiladi, siz esa hamisha taniyman deb o‘ylagan insonni yangidan bilib olasiz.",
          ],
        },
        {
          heading: "Suhbatni qanday o‘tkazish kerak",
          list: [
            "Tinch vaqtni tanlang: ishlar orasida emas, choy ustida.",
            "Yengil mavzulardan boshlang: bolalik, maktab, sevimli taomlar va qo‘shiqlar.",
            "Gapini bo‘lmang va to‘g‘rilamang: «aslida qanday bo‘lgani» emas, ona buni qanday eslashi muhim.",
            "Telefondagi diktofonni yoqing: keyin javoblarni so‘zma-so‘z yozib olasiz.",
            "Hamma savollarni bir martada o‘tishga urinmang: haftada bir-ikki kech yetarli.",
          ],
        },
        {
          heading: "Javoblar bilan nima qilish kerak",
          paragraphs: [
            "Og‘zaki hikoyalarni yo‘qotish oson, yozilganlarini esa saqlab qolish mumkin. Eng iliq javob olgan savollaringizni tanlab, ularni kitob qilib bezang: boblar, suratlar va muqova bilan.",
            "Siz ham shunday savollarga bob bo‘yicha javob berasiz, suratlar qo‘shasiz va dizayn tanlaysiz. Maketni buyurtmadan oldin ko‘rish mumkin, tayyor kitobni esa qattiq muqovada chop etib, Qozog‘iston bo‘ylab yetkazib beramiz.",
          ],
        },
      ],
      questions: { heading: "Onaga bob bo‘yicha savollar", intro: "Bu «Onaga» kitobidagi savollar: ularni ovoz chiqarib so‘rash yoki ona haqida kitob yozayotgan bo‘lsangiz, o‘zingiz javob berish mumkin." },
      faq: [
        ["Ona o‘zi haqida gapirishni yoqtirmasa, suhbatni nimadan boshlash kerak?", "Suratlardan boshlang: suratning qayerda va qachon olinganini aytib berishini so‘rang. Surat atrofidagi hikoyalar odatda to‘g‘ridan-to‘g‘ri savollarga qaraganda osonroq keladi."],
        ["Ona ba’zi davrlarni eslashni xohlamasa, nima qilish kerak?", "Bunday mavzularni o‘tkazib yuboring. Savollar bankidan faqat javob berish unga yoqadiganlarini tanlash mumkin: kitobga faqat to‘ldirilgan javoblar kiradi."],
      ],
      cta: { title: "Javoblarni kitobga aylantiring", text: "Bob bo‘yicha savollarga javoblarni yozing, suratlar qo‘shing va muqovani tanlang: biz haqiqiy kitob chop etamiz. Yozish bepul." },
    },
    en: {
      title: "Questions for Mum about life, childhood and family: what to ask while you can",
      description: "A collection of questions to ask Mum: childhood, youth, family and life lessons. How to hold the conversation and keep the answers in a book.",
      lead: "We rarely think about how little we know of Mum’s life before we were born. These questions will help you start a conversation, and the answers can be kept for yourself and for future generations.",
      sections: [
        {
          heading: "Why ask Mum about her life",
          paragraphs: [
            "Mums’ stories often live in the memory of just one person. While we are busy with work and errands, details — how Mum chose her profession, what she dreamed of, what she feared — quietly leave with her generation.",
            "A conversation built on questions is nothing like an interrogation. It brings you closer: Mum feels that her life is interesting, and you get to know a person you thought you had always known.",
          ],
        },
        {
          heading: "How to have the conversation",
          list: [
            "Choose a calm moment — over tea, not between chores.",
            "Start with light topics: childhood, school, favourite dishes and songs.",
            "Don’t interrupt or correct her — what matters is not how it “really” was, but how Mum remembers it.",
            "Turn on the voice recorder on your phone: later you can write the answers down word for word.",
            "Don’t try to get through all the questions at once — an evening or two a week is enough.",
          ],
        },
        {
          heading: "What to do with the answers",
          paragraphs: [
            "Spoken stories are easy to lose, while written ones can be kept. Choose the questions that got the warmest answers and turn them into a book: with chapters, photos and a cover.",
            "You answer the same questions chapter by chapter, add photos and choose the design. You can see the proof before you order, and we will print the finished book in hardcover and deliver it across Kazakhstan.",
          ],
        },
      ],
      questions: { heading: "Questions for Mum, chapter by chapter", intro: "These are the questions from the “For Mum” book: you can ask them out loud or answer them yourself if you are writing a book about your mum." },
      faq: [
        ["How do I start if Mum doesn’t like talking about herself?", "Start with photos: ask her to tell you where and when a picture was taken. Stories around photos usually come more easily than direct questions."],
        ["What if Mum doesn’t want to remember certain periods?", "Skip those topics. From the question bank you can choose only the ones she enjoys answering — only completed answers go into the book."],
      ],
      cta: { title: "Turn the answers into a book", text: "Write answers to the questions chapter by chapter, add photos and choose a cover — we will print a real book. Writing is free." },
    },
  },
};
