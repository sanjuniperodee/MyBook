import type { Article } from "./types";

export const voprosyPape: Article = {
  slug: "voprosy-pape",
  published: "2026-10-05",
  readMinutes: 7,
  theme: "dad",
  bank: { afterSection: 2, perChapter: 4, skip: ["intro"], author: "m", recipient: "m" },
  landings: ["kniga-pape", "podarok-na-yubilej-pape", "podarok-pape-na-23-fevralya"],
  content: {
    ru: {
      title: "Вопросы папе о жизни и детстве: о чём спросить отца",
      description: "Вопросы, которые стоит задать папе: о детстве, работе, молодости, семье и жизненных уроках. Советы, как разговорить отца, и как сохранить ответы в книге.",
      lead: "Папы редко рассказывают о себе сами — их нужно спросить. Эти вопросы помогут услышать истории, которые иначе так и останутся несказанными.",
      sections: [
        {
          heading: "Как разговорить папу",
          paragraphs: [
            "Многие отцы не привыкли говорить о чувствах, но охотно вспоминают дела: службу, первую работу, машину, рыбалку, друзей. Начните с конкретного — и разговор сам придёт к главному.",
            "Лучше всего получается рядом с делом: в дороге, в гараже, на даче. Прямой вопрос за столом иногда вызывает неловкость, а за делом разговор льётся сам.",
          ],
        },
        {
          heading: "Несколько советов",
          list: [
            "Спрашивайте о делах и событиях, а не о чувствах — чувства появятся в рассказе сами.",
            "Просите рассказывать «поподробнее»: кто был рядом, какая была погода, что вы тогда почувствовали.",
            "Не спорьте о датах и подробностях — это не экзамен.",
            "Записывайте на телефон или в блокнот — папины фразы потом станут эпиграфами в книге.",
            "Поблагодарите после разговора: для многих отцов это важнее, чем кажется.",
          ],
        },
        {
          heading: "Что делать дальше",
          paragraphs: [
            "Запишите ответы, пока воспоминания свежие. Из них легко сложить книгу: каждый ответ станет страницей, а семейные фотографии — иллюстрациями.",
            "Сделайте её подарком к юбилею или просто так: пригласите братьев, сестёр и внуков написать письма — они войдут в книгу отдельной главой.",
          ],
        },
      ],
      questions: { heading: "Вопросы папе по главам", intro: "Это вопросы из книги «Папе»: их можно задать вслух или ответить на них самому, если вы пишете книгу о папе." },
      faq: [
        ["Папа отвечает коротко. Как получить больше?", "Задавайте уточняющие вопросы: «А что было дальше?», «А кто был с тобой?». Попросите вспомнить конкретный день или случай, а не рассказывать «вообще»."],
        ["Можно ли ответить на эти вопросы самому, если папа не хочет говорить?", "Да. В книге «Папе» вы отвечаете на вопросы своими словами: что помните о нём, чему он вас научил. Пригласите родных дополнить её письмами."],
      ],
      cta: { title: "Превратите ответы в книгу", text: "Запишите историю папы и свои воспоминания о нём: вопросы по главам, фото и обложка — а мы напечатаем настоящую книгу." },
    },
    kk: {
      title: "Әкеге қоятын сұрақтар: өмірі мен балалық шағы туралы не сұрау керек",
      description: "Әкеге қоюға тұрарлық сұрақтар: балалық шақ, жұмыс, жастық шақ, отбасы және өмір сабақтары туралы. Әкені сөйлетудің кеңестері және жауаптарды кітапқа сақтау.",
      lead: "Әкелер өздері туралы сирек айтады — оларды сұрау керек. Бұл сұрақтар әйтпесе айтылмай қалатын әңгімелерді тыңдауға көмектеседі.",
      sections: [
        {
          heading: "Әкені қалай сөйлету керек",
          paragraphs: [
            "Көп әкелер сезім туралы айтуға әдеттенбеген, бірақ істерді қуана еске алады: әскер, алғашқы жұмыс, көлік, балық аулау, достар. Нақты нәрседен бастаңыз — әңгіме өзі ең бастысына келеді.",
            "Ең жақсысы іс үстінде сөйлесу: жолда, гаражда, саяжайда. Дастарқан басындағы тікелей сұрақ кейде ыңғайсыз болады, ал іс үстінде әңгіме өздігінен өрбиді.",
          ],
        },
        {
          heading: "Бірнеше кеңес",
          list: [
            "Сезім туралы емес, істер мен оқиғалар туралы сұраңыз — сезім әңгіме барысында өзі шығады.",
            "«Толығырақ айтып бер» деп сұраңыз: жанында кім болды, ауа райы қандай еді, сіз не сездіңіз.",
            "Күндер мен бөлшектер туралы таласпаңыз — бұл емтихан емес.",
            "Телефонға немесе дәптерге жазып алыңыз — әкенің сөздері кейін кітапта эпиграф болады.",
            "Әңгімеден кейін алғыс айтыңыз: көп әкелер үшін бұл көрінгеннен маңыздырақ.",
          ],
        },
        {
          heading: "Әрі қарай не істеу керек",
          paragraphs: [
            "Естеліктер әлі жаңа кезде жауаптарды жазып алыңыз. Одан кітап құрау оңай: әр жауап бір бет болады, ал отбасылық суреттер — суреттеме.",
            "Оны мерейтойға немесе жай сыйлық етіңіз: аға-іні, апа-қарындас, немерелерді хат жазуға шақырыңыз — олар кітапқа жеке тарау болып кіреді.",
          ],
        },
      ],
      questions: { heading: "Әкеге қоятын сұрақтар тараулар бойынша", intro: "Бұл «Әкеге» кітабындағы сұрақтар: оларды дауыстап қоюға немесе әке туралы кітап жазсаңыз, өзіңіз жауап беруге болады." },
      faq: [
        ["Әке қысқа жауап береді. Көбірек білу үшін не істеу керек?", "Нақтылаушы сұрақтар қойыңыз: «Одан әрі не болды?», «Сенімен кім болды?». Жалпылап айтуды емес, нақты бір күн немесе оқиғаны еске алуды сұраңыз."],
        ["Әке сөйлегісі келмесе, бұл сұрақтарға өзім жауап бере аламын ба?", "Иә. «Әкеге» кітабында сіз сұрақтарға өз сөзіңізбен жауап бересіз: оны не есіңізде, ол сізді неге үйретті. Туыстарыңызды хатпен толықтыруға шақырыңыз."],
      ],
      cta: { title: "Жауаптарды кітапқа айналдырыңыз", text: "Әке тарихы мен оған арналған естеліктеріңізді жазыңыз: тараулар бойынша сұрақтар, суреттер мен мұқаба — ал біз нағыз кітап басып шығарамыз." },
    },
    uz: {
      title: "Dadaga hayot va bolalik haqida savollar: otadan nima so‘rash kerak",
      description: "Dadadan so‘rashga arziydigan savollar: bolalik, ish, yoshlik, oila va hayot saboqlari haqida. Otani gapirtirish maslahatlari va javoblarni kitobda saqlash.",
      lead: "Otalar o‘zlari haqida kamdan-kam gapirib berishadi: ulardan so‘rash kerak. Bu savollar aks holda aytilmay qoladigan hikoyalarni eshitishga yordam beradi.",
      sections: [
        {
          heading: "Dadani qanday gapirtirish kerak",
          paragraphs: [
            "Ko‘p otalar his-tuyg‘ular haqida gapirishga o‘rganmagan, lekin ishlarni mamnuniyat bilan eslashadi: harbiy xizmat, birinchi ish, mashina, baliq ovi, do‘stlar. Aniq narsadan boshlang, suhbat o‘zi asosiy mavzuga keladi.",
            "Eng yaxshi suhbat biror ish bilan band bo‘lganda chiqadi: yo‘lda, garajda, dalada. Dasturxon atrofidagi to‘g‘ridan-to‘g‘ri savol ba’zan noqulaylik tug‘diradi, ish asnosida esa suhbat o‘zi ketadi.",
          ],
        },
        {
          heading: "Bir necha maslahat",
          list: [
            "Tuyg‘ular haqida emas, ishlar va voqealar haqida so‘rang: tuyg‘ular hikoya ichida o‘zi paydo bo‘ladi.",
            "«Batafsilroq» aytib berishni so‘rang: yonida kim bo‘lgan, ob-havo qanday edi, o‘shanda nima his qilgan.",
            "Sanalar va tafsilotlar ustida bahslashmang: bu imtihon emas.",
            "Telefonga yoki daftarga yozib oling: dadaning gaplari keyin kitobda epigraf bo‘ladi.",
            "Suhbatdan keyin rahmat ayting: ko‘p otalar uchun bu ko‘ringanidan muhimroq.",
          ],
        },
        {
          heading: "Keyin nima qilish kerak",
          paragraphs: [
            "Xotiralar yangiligida javoblarni yozib qo‘ying. Ulardan kitob tuzish oson: har bir javob bir sahifaga, oilaviy suratlar esa rasmlarga aylanadi.",
            "Uni yubileyga yoki shunchaki sovg‘a qiling: aka-ukalar, opa-singillar va nevaralarni xat yozishga taklif qiling, ularning xatlari kitobga alohida bob bo‘lib kiradi.",
          ],
        },
      ],
      questions: { heading: "Dadaga bob bo‘yicha savollar", intro: "Bu «Dadaga» kitobidagi savollar: ularni ovoz chiqarib so‘rash yoki dada haqida kitob yozayotgan bo‘lsangiz, o‘zingiz javob berish mumkin." },
      faq: [
        ["Dada qisqa javob beradi. Ko‘proq ma’lumotni qanday olish mumkin?", "Aniqlashtiruvchi savollar bering: «Keyin nima bo‘ldi?», «Yoningda kim bor edi?». Umuman gapirib berishni emas, aniq bir kunni yoki voqeani eslashni so‘rang."],
        ["Dada gapirishni xohlamasa, bu savollarga o‘zim javob bersam bo‘ladimi?", "Ha. «Dadaga» kitobida savollarga o‘z so‘zlaringiz bilan javob berasiz: u haqida nimani eslaysiz, sizga nimani o‘rgatgan. Yaqinlaringizni xatlar bilan to‘ldirishga taklif qiling."],
      ],
      cta: { title: "Javoblarni kitobga aylantiring", text: "Dadaning hikoyasini va u haqidagi xotiralaringizni yozing: bob bo‘yicha savollar, suratlar va muqova bor, haqiqiy kitobni esa biz chop etamiz." },
    },
    en: {
      title: "Questions for Dad about life and childhood: what to ask your father",
      description: "Questions worth asking Dad: childhood, work, youth, family and life lessons. Tips for getting your father talking and keeping the answers in a book.",
      lead: "Dads rarely tell their own stories — you have to ask. These questions will help you hear stories that would otherwise stay unspoken.",
      sections: [
        {
          heading: "How to get Dad talking",
          paragraphs: [
            "Many fathers aren’t used to talking about feelings, but they gladly remember what they did: military service, a first job, a car, fishing, friends. Start with something concrete — and the conversation will find its way to what matters.",
            "It works best alongside an activity: on the road, in the garage, at the dacha. A direct question at the table can feel awkward, while over a shared task the conversation flows on its own.",
          ],
        },
        {
          heading: "A few tips",
          list: [
            "Ask about things he did and events, not feelings — the feelings will appear in the story by themselves.",
            "Ask him to tell you “in more detail”: who was there, what the weather was like, how he felt.",
            "Don’t argue about dates and details — it isn’t an exam.",
            "Record on your phone or in a notebook — Dad’s phrases can later become epigraphs in the book.",
            "Thank him after the conversation: for many fathers it means more than it seems.",
          ],
        },
        {
          heading: "What to do next",
          paragraphs: [
            "Write down the answers while the memories are fresh. It is easy to turn them into a book: each answer becomes a page, and family photos become illustrations.",
            "Make it a gift for a milestone birthday or just because: invite brothers, sisters and grandchildren to write letters — they will go into the book as a separate chapter.",
          ],
        },
      ],
      questions: { heading: "Questions for Dad, chapter by chapter", intro: "These are the questions from the “For Dad” book: you can ask them out loud or answer them yourself if you are writing a book about your dad." },
      faq: [
        ["Dad gives short answers. How can I get more?", "Ask follow-up questions: “What happened next?”, “Who was with you?”. Ask him to recall a specific day or incident rather than talk “in general”."],
        ["Can I answer these questions myself if Dad doesn’t want to talk?", "Yes. In the “For Dad” book you answer the questions in your own words: what you remember about him, what he taught you. Invite relatives to add letters of their own."],
      ],
      cta: { title: "Turn the answers into a book", text: "Write Dad’s story and your memories of him: questions chapter by chapter, photos and a cover — and we will print a real book." },
    },
  },
};
