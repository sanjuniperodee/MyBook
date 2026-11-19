import type { Landing } from "./types";

/**
 * Подарок дедушке: автобиография, которую внуки записывают с его слов. Получателя в теме нет,
 * автор книги — сам дедушка (род рассказчика «m»).
 */
export const podarokDedushke: Landing = {
  slug: "podarok-dedushke",
  theme: "autobiography",
  coverTemplate: "steppe",
  authorGender: "m",
  content: {
    ru: {
      label: "Подарок дедушке",
      h1: "Подарок дедушке —",
      accent: "книга его судьбы для внуков и правнуков",
      metaTitle: "Что подарить дедушке — книга о его жизни и роде",
      metaDescription: "Подарок дедушке, у которого есть что рассказать: его детство, работа, семья и род до седьмого колена. Внуки записывают рассказы, мы верстаем и печатаем книгу.",
      lead: "У дедушки за плечами работа, дорога, семья и целая эпоха, которую внуки знают только по его рассказам. Расспросите его, запишите ответы — и эти истории останутся в доме не на память, а на бумаге.",
      why: [
        { title: "О деле и о роде", text: "Вопросы про детство, службу, работу, семью и предков — родословную можно собрать до седьмого колена. Дедушке не нужно «писать»: достаточно рассказывать." },
        { title: "Его слова, ваше участие", text: "Автором книги будет дедушка, а ваше имя как того, кто записывал, указывается на обороте титула. Сохраняйте его словечки — книга зазвучит его голосом." },
        { title: "Фото, документы, письма семьи", text: "Снимите на телефон старые фотографии и документы, а дети и внуки напишут ему письма по ссылке — их мы соберём отдельной главой." },
      ],
      cover: { title: "Моя жизнь и мой род", names: "Ержан Нурланов" },
      faq: [
        ["Дедушка говорит, что ему нечего рассказывать. С чего начать?", "Начните с простого: где родился, как называли дома, кем хотел стать в детстве. Вопросы идут по главам, и обычно после первых ответов дедушка вспоминает всё остальное сам."],
        ["Можно ли собрать родословную?", "В книге есть глава «Мои корни»: вопросы про род, предков и семейные предания, в том числе про семь поколений. Отвечайте тем, что знает дедушка и старшие родственники."],
        ["Как подарить, если до праздника далеко или рассказ ещё не записан?", "Подарите сертификат: дедушка сам выберет «Автобиографию». Электронную версию готовой книги вы получите сразу после оплаты, печатную делаем несколько рабочих дней."],
      ],
    },
    kk: {
      label: "Атаға сыйлық",
      h1: "Атаға сыйлық —",
      accent: "немере мен шөберелерге арналған тағдыр кітабы",
      metaTitle: "Атаға не сыйлауға болады — өмірі мен шежіресі туралы кітап",
      metaDescription: "Атаға сыйлық: балалық шағы, еңбегі, отбасы және жеті атаға дейінгі шежіресі. Немерелері әңгімесін жазып алады, ал біз кітапты беттеп, басып шығарамыз.",
      lead: "Атаның артында еңбек, жол, отбасы және немерелері тек оның әңгімесінен ғана білетін бір дәуір тұр. Атаңызды сөйлетіп, жауаптарын жазып алыңыз — бұл әңгімелер енді жадта емес, қағазда сақталады.",
      why: [
        { title: "Еңбегі мен шежіресі туралы", text: "Балалық шақ, әскер, жұмыс, отбасы және ата-баба туралы сұрақтар — шежірені жеті атаға дейін жинауға болады. Атаға «жазу» керек емес, айтса болды." },
        { title: "Сөзі атаның, қатысы сіздің", text: "Кітаптың авторы — ата, ал жазып отырған сіздің есіміңіз титул парағының арғы бетінде көрсетіледі. Атаның өз сөздерін сақтаңыз — кітап оның даусымен сөйлейді." },
        { title: "Суреттер, құжаттар, отбасының хаттары", text: "Ескі суреттер мен құжаттарды телефонға түсіріңіз, ал балалары мен немерелері сілтеме арқылы оған хат жазады — оларды жеке тарауға жинаймыз." },
      ],
      cover: { title: "Өмірім және руым", names: "Ержан Нұрланов" },
      faq: [
        ["Ата айтатын ештеңе жоқ дейді. Неден бастаймыз?", "Қарапайым нәрседен бастаңыз: қайда туылды, үйде қалай атады, балалықта кім болғысы келді. Сұрақтар тараулар бойынша жүреді, алғашқы жауаптардан кейін ата қалғанын өзі еске алады."],
        ["Шежіре жинауға бола ма?", "Кітапта «Түп-тамырым» тарауы бар: ру, ата-баба және отбасылық аңыздар туралы сұрақтар, соның ішінде жеті ата туралы. Атаның және үлкен туыстардың білгенін жазыңыз."],
        ["Мереке әлі алыс болса немесе әңгіме жазылмаған болса, қалай сыйлауға болады?", "Сертификат сыйлаңыз: ата «Өмірбаянды» өзі таңдайды. Дайын кітаптың электрондық нұсқасын төлемнен кейін бірден аласыз, басылған данасын бірнеше жұмыс күнінде жасаймыз."],
      ],
    },
    uz: {
      label: "Boboga sovg‘a",
      h1: "Boboga sovg‘a —",
      accent: "nevara va chevaralar uchun taqdir kitobi",
      metaTitle: "Boboga nima sovg‘a qilish mumkin — hayoti va nasl-nasabi haqida kitob",
      metaDescription: "Aytadigan gapi ko‘p boboga sovg‘a: bolaligi, mehnati, oilasi va yetti avlodgacha shajarasi. Nevaralar hikoyalarni yozib oladi, biz maketlab bosamiz.",
      lead: "Bobo ortida mehnat, yo‘l, oila va nevaralar faqat uning hikoyalaridan biladigan butun bir davr turibdi. Uni so‘roqqa tuting, javoblarini yozib oling — bu hikoyalar uyda xotirada emas, qog‘ozda qoladi.",
      why: [
        { title: "Ish va nasl-nasab haqida", text: "Bolalik, xizmat, ish, oila va ajdodlar haqida savollar — shajarani yetti avlodgacha yig‘ish mumkin. Boboga «yozish» shart emas: aytsa bas." },
        { title: "Gaplari uniki, ishtirok sizniki", text: "Kitob muallifi bobo bo‘ladi, yozib borgan sifatida sizning ismingiz esa titul varag‘ining orqa tomonida ko‘rsatiladi. Uning o‘ziga xos so‘zlarini saqlang — kitob uning ovozida jaranglaydi." },
        { title: "Suratlar, hujjatlar, oila xatlari", text: "Eski suratlar va hujjatlarni telefonda suratga oling, farzandlari va nevaralari esa unga havola orqali xat yozadi — ularni alohida bobga jamlaymiz." },
      ],
      cover: { title: "Hayotim va naslim", names: "Yerjan Nurlanov" },
      faq: [
        ["Bobo aytadigan gapim yo‘q deydi. Nimadan boshlash kerak?", "Oddiyidan boshlang: qayerda tug‘ilgan, uyda qanday atashgan, bolaligida kim bo‘lishni istagan. Savollar boblar bo‘yicha boradi, odatda dastlabki javoblardan keyin bobo qolganini o‘zi eslaydi."],
        ["Shajara yig‘sa bo‘ladimi?", "Kitobda «Ildizlarim» bobi bor: nasl, ajdodlar va oilaviy rivoyatlar haqida savollar, shu jumladan yetti avlod haqida. Bobo va keksa qarindoshlar bilganini yozing."],
        ["Bayram hali uzoq bo‘lsa yoki hikoya yozilmagan bo‘lsa, qanday sovg‘a qilsa bo‘ladi?", "Sertifikat hadya qiling: bobo «Tarjimai hol»ni o‘zi tanlaydi. Tayyor kitobning elektron nusxasini to‘lovdan keyin darhol olasiz, bosma nusxasini bir necha ish kunida tayyorlaymiz."],
      ],
    },
  },
};
