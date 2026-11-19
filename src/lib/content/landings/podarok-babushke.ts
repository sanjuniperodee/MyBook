import type { Landing } from "./types";

/**
 * Подарок бабушке: автобиография, которую внуки записывают с её слов. Получателя в теме нет,
 * автор книги — сама бабушка (род рассказчика «f»).
 */
export const podarokBabushke: Landing = {
  slug: "podarok-babushke",
  theme: "autobiography",
  coverTemplate: "flax",
  authorGender: "f",
  content: {
    ru: {
      label: "Подарок бабушке",
      h1: "Подарок бабушке —",
      accent: "книга её жизни, записанная внуками",
      metaTitle: "Что подарить бабушке — книга с историей её жизни",
      metaDescription: "Подарок бабушке: внуки задают вопросы о детстве, молодости и семье и записывают её рассказы. Фото, вёрстка и печать в твёрдом переплёте, доставка по Казахстану.",
      lead: "Бабушкины истории знают все, но почти никто их не записал. Сядьте рядом с чаем, задавайте вопросы из нашего списка и превратите её рассказы в книгу, которую можно держать в руках и передавать детям.",
      why: [
        { title: "Вопросы, с которых бабушка начнёт сама", text: "Детство, школа, молодость, как она встретила дедушку, как растила детей. Достаточно спросить — дальше она рассказывает, а вы набираете ответ на телефоне." },
        { title: "Автор — бабушка, вы — рядом", text: "Книга пишется от её лица, а ваше имя как того, кто записывал, стоит на обороте титула. Отвечать можно в любом порядке и за несколько вечеров." },
        { title: "Семейные фото и письма внуков", text: "Сфотографируйте снимки из альбома, а дети и внуки пришлют письма по ссылке — они войдут в книгу отдельной главой." },
      ],
      cover: { title: "История моей жизни", names: "Роза Ахметова" },
      faq: [
        ["Бабушка не пользуется телефоном. Как быть?", "Ей и не нужно. Вопросы задаёте вы, ответы набираете сами — на телефоне или компьютере. Макет всей книги вы увидите до оплаты и сможете показать его бабушке."],
        ["А если книга не успеет к дню рождения?", "Подарите сертификат: бабушка сама выберет «Автобиографию», а книгу вы запишете вместе позже. Электронную версию готовой книги получите сразу после оплаты, печатную делаем несколько рабочих дней."],
        ["Что, если бабушка не хочет вспоминать трудное?", "Отвечать нужно только на те вопросы, на которые хочется. Остальные пропустите — книга будет такой, какой её хочет видеть сама бабушка."],
      ],
    },
    kk: {
      label: "Әжеге сыйлық",
      h1: "Әжеге сыйлық —",
      accent: "немерелері жазып алған өмір кітабы",
      metaTitle: "Әжеге не сыйлауға болады — өмір тарихы жазылған кітап",
      metaDescription: "Әжеге сыйлық: немерелері балалық шағы, жастығы мен отбасы туралы сұрап, әжесінің әңгімесін жазып алады. Суреттер, беттеу және қатты мұқабада басу, Қазақстан бойынша жеткізу.",
      lead: "Әженің әңгімелерін бәрі біледі, бірақ оны жазып алған адам аз. Қасына шай ішіп отырыңыз, біздің тізімдегі сұрақтарды қойыңыз — әженің әңгімесі қолға ұстап, ұрпаққа өткізетін кітапқа айналады.",
      why: [
        { title: "Әже өзі бастайтын сұрақтар", text: "Балалық шақ, мектеп, жастық шақ, атамен қалай кездескені, балаларын қалай өсіргені. Сұрасаңыз болды — әже айтады, ал сіз жауапты телефоннан тересіз." },
        { title: "Автор — әже, сіз — қасында", text: "Кітап әженің атынан жазылады, ал жазып отырған сіздің есіміңіз титул парағының арғы бетінде тұрады. Жауап беруді кез келген ретпен, бірнеше кешке бөлуге болады." },
        { title: "Отбасылық суреттер мен немерелердің хаттары", text: "Альбомдағы суреттерді телефонға түсіріңіз, ал балалары мен немерелері сілтеме арқылы хат жібереді — олар кітапқа жеке тарау болып кіреді." },
      ],
      cover: { title: "Өмірімнің тарихы", names: "Роза Ахметова" },
      faq: [
        ["Әжем телефонды пайдаланбайды. Қайтеміз?", "Оған қажет те емес. Сұрақты сіз қоясыз, жауапты өзіңіз телефоннан немесе компьютерден тересіз. Бүкіл кітаптың макетін төлемге дейін көресіз, оны әжеге көрсете аласыз."],
        ["Кітап туған күнге үлгермесе ше?", "Сертификат сыйлаңыз: әже «Өмірбаянды» өзі таңдайды, ал кітапты кейін бірге жазасыздар. Дайын кітаптың электрондық нұсқасын төлемнен кейін бірден аласыз, басылған данасын бірнеше жұмыс күнінде жасаймыз."],
        ["Әже ауыр кезеңдерді еске алғысы келмесе ше?", "Тек жауап бергіңіз келетін сұрақтарға ғана жауап беріңіз. Қалғанын өткізіп жіберіңіз — кітап әже көргісі келгендей болады."],
      ],
    },
    uz: {
      label: "Buviga sovg‘a",
      h1: "Buviga sovg‘a —",
      accent: "nevaralar yozib olgan hayot kitobi",
      metaTitle: "Buviga nima sovg‘a qilish mumkin — hayot tarixi bitilgan kitob",
      metaDescription: "Buviga sovg‘a: nevaralar bolaligi va oilasi haqida so‘rab, hikoyalarini yozib oladi. Suratlar, maket, qattiq muqovada bosma, Qozog‘istonga yetkazamiz.",
      lead: "Buvining hikoyalarini hamma biladi, lekin deyarli hech kim yozib olmagan. Yoniga choy bilan o‘tiring, ro‘yxatimizdagi savollarni bering va uning hikoyalarini qo‘lda ushlab, farzandlarga topshirsa bo‘ladigan kitobga aylantiring.",
      why: [
        { title: "Buvi o‘zi boshlaydigan savollar", text: "Bolalik, maktab, yoshlik, bobo bilan qanday uchrashgani, farzandlarini qanday voyaga yetkazgani. So‘rasangiz bas — keyin u aytadi, siz javobni telefonda terasiz." },
        { title: "Muallif — buvi, siz — yonida", text: "Kitob uning tilidan yoziladi, yozib borgan sifatida sizning ismingiz esa titul varag‘ining orqa tomonida turadi. Javob berishni xohlagan tartibda, bir necha kechaga bo‘lib berish mumkin." },
        { title: "Oilaviy suratlar va nevaralar xatlari", text: "Albomdagi suratlarni telefonda suratga oling, farzandlari va nevaralari esa havola orqali xat yuboradi — ular kitobga alohida bob bo‘lib kiradi." },
      ],
      cover: { title: "Hayotim tarixi", names: "Roza Axmetova" },
      faq: [
        ["Buvim telefondan foydalanmaydi. Nima qilamiz?", "Unga kerak ham emas. Savollarni siz berasiz, javoblarni o‘zingiz telefonda yoki kompyuterda terasiz. Butun kitob maketini to‘lovdan oldin ko‘rasiz va buviga ko‘rsata olasiz."],
        ["Kitob tug‘ilgan kunga ulgurmasa-chi?", "Sertifikat hadya qiling: buvi «Tarjimai hol»ni o‘zi tanlaydi, kitobni esa keyinroq birga yozasizlar. Tayyor kitobning elektron nusxasini to‘lovdan keyin darhol olasiz, bosma nusxasini bir necha ish kunida tayyorlaymiz."],
        ["Buvi og‘ir davrlarni eslagisi kelmasa-chi?", "Faqat javob bergingiz kelgan savollarga javob bering. Qolganini o‘tkazib yuboring — kitob buvi ko‘rishni istagandek bo‘ladi."],
      ],
    },
  },
};
