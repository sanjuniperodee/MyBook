import type { Landing } from "./types";

/**
 * Подарок на свадьбу: дружеская книга для невесты — тема «друг» (вопросы про знакомство, смешные истории,
 * будущее и благодарность). Пожелания гостей приходят письмами по ссылке. Банк любви рассчитан на пару
 * от первого лица и для подарка молодожёнам от друзей не подходит.
 */
export const podarokNaSvadbu: Landing = {
  slug: "podarok-na-svadbu",
  theme: "friend",
  occasion: "wedding",
  coverTemplate: "sakura",
  authorGender: "f",
  recipientGender: "f",
  content: {
    ru: {
      label: "Подарок на свадьбу",
      h1: "Подарок на свадьбу —",
      accent: "книга с историями и пожеланиями друзей",
      metaTitle: "Что подарить на свадьбу — книга с историями и пожеланиями гостей",
      metaDescription: "Подарок на свадьбу подруге или другу: книга о вашей дружбе, смешные истории и письма-пожелания от гостей. Фото, печать в твёрдом переплёте и доставка по Казахстану.",
      lead: "Конверт на свадьбе подарят многие, а книгу, где друзья вспоминают смешное и желают счастья, — немногие. Расскажите, как вы познакомились с невестой или женихом, соберите пожелания гостей и вручите книгу на торжестве или после него.",
      why: [
        { title: "Истории, а не просто пожелания", text: "Как познакомились, самая смешная история, что вы обещаете на будущее. Вопросы помогут написать так, как вы сказали бы тост, только спокойнее и длиннее." },
        { title: "Пожелания от всех гостей", text: "Друзья, коллеги и родные пишут свои письма по ссылке с телефона, без регистрации. Их слова войдут в книгу отдельной главой, и вы проверите их до печати." },
        { title: "К свадьбе и после неё", text: "Электронную книгу вы получите сразу после оплаты, её можно показать на торжестве. Печатный экземпляр делаем несколько рабочих дней, а макет всей книги вы увидите до оплаты." },
      ],
      cover: { title: "В день твоей свадьбы", names: "От Мадины и подруг" },
      faq: [
        ["Книга о паре или об одном из молодожёнов?", "Вопросы рассчитаны на одного человека: при создании книги вы выбираете, о ком пишете, — о невесте или о женихе. Пожелания паре друзья и родные оставляют письмами по ссылке."],
        ["Как собрать пожелания от гостей?", "Отправьте им ссылку в чат или попросите написать на свадьбе. Письмо пишется с телефона без регистрации и попадает в книгу отдельной главой."],
        ["Что, если мы знакомы недавно?", "Это не помеха. Достаточно ответить на те вопросы, о которых вам есть что сказать, остальные можно пропустить."],
      ],
    },
    kk: {
      label: "Тойға сыйлық",
      h1: "Үйлену тойына сыйлық —",
      accent: "достардың әңгімелері мен тілектері жазылған кітап",
      metaTitle: "Үйлену тойына не сыйлау керек — қонақтардың тілектері бар кітап",
      metaDescription: "Үйлену тойына құрбыңызға немесе досыңызға сыйлық: достығыңыз туралы кітап, күлкілі оқиғалар және қонақтардың тілек хаттары. Суреттер, қатты мұқаба, Қазақстан бойынша жеткізу.",
      lead: "Тойға конверт сыйлайтындар көп, ал достардың күлкілі естеліктері мен ақ тілектері жазылған кітап сыйлайтындар аз. Қалыңдықпен немесе күйеу жігітпен қалай таныстыңыз — соны жазыңыз, қонақтардың тілектерін жинаңыз да, кітапты тойда немесе кейін табыс етіңіз.",
      why: [
        { title: "Тек тілек емес, оқиғалар", text: "Қалай таныстыңыздар, ең күлкілі оқиға, болашаққа не уәде етесіз. Сұрақтар тост айтқандай жазуға көмектеседі, тек асықпай әрі толығырақ." },
        { title: "Барлық қонақтан тілек", text: "Достар, әріптестер мен туыстар сілтеме арқылы телефоннан тіркелусіз хат жазады. Олардың сөздері кітапқа жеке тарау болып кіреді, басар алдында тексересіз." },
        { title: "Тойға және одан кейін", text: "Электрондық кітапты төлемнен кейін бірден аласыз, оны тойда көрсетуге болады. Басылған данасын бірнеше жұмыс күнінде жасаймыз, ал бүкіл кітаптың макетін төлемге дейін көресіз." },
      ],
      cover: { title: "Тойың құтты болсын", names: "Мәдина мен құрбылардан" },
      faq: [
        ["Кітап жұп туралы ма, әлде жас жұбайдың бірі туралы ма?", "Сұрақтар бір адамға арналған: кітап жасағанда қалыңдық туралы немесе күйеу жігіт туралы жазатыныңызды таңдайсыз. Жұбына тілекті достары мен туыстары сілтеме арқылы хат етіп қалдырады."],
        ["Қонақтардың тілегін қалай жинауға болады?", "Оларға сілтемені чатқа жіберіңіз немесе тойда жазуын өтініңіз. Хат телефоннан тіркелусіз жазылады және кітапқа жеке тарау болып түседі."],
        ["Жақында ғана танысқан болсақ ше?", "Бұл кедергі емес. Айтарыңыз бар сұрақтарға жауап берсеңіз жеткілікті, қалғанын өткізіп жіберуге болады."],
      ],
    },
    uz: {
      label: "To‘yga sovg‘a",
      h1: "To‘yga sovg‘a —",
      accent: "do‘stlar hikoyalari va tilaklari bilan kitob",
      metaTitle: "To‘yga nima sovg‘a qilish mumkin — mehmonlar tilaklari bilan kitob",
      metaDescription: "To‘yga do‘st yoki dugonaga sovg‘a: do‘stligingiz haqida kitob, kulgili voqealar, mehmonlar tilaklari. Suratlar, qattiq muqova, Qozog‘iston bo‘ylab yetkazish.",
      lead: "To‘yda konvertni ko‘pchilik sovg‘a qiladi, do‘stlar kulgili voqealarni eslab, baxt tilaydigan kitobni esa kam kishi. Kelin yoki kuyov bilan qanday tanishganingizni so‘zlab bering, mehmonlar tilaklarini to‘plang va kitobni marosimda yoki undan keyin topshiring.",
      why: [
        { title: "Shunchaki tilak emas, hikoyalar", text: "Qanday tanishganingiz, eng kulgili voqea, kelajak uchun nima va’da qilishingiz. Savollar tostni qanday aytsangiz, shunday — faqat xotirjamroq va uzunroq yozishga yordam beradi." },
        { title: "Barcha mehmonlardan tilaklar", text: "Do‘stlar, hamkasblar va qarindoshlar o‘z xatlarini havola orqali telefondan, ro‘yxatdan o‘tmasdan yozadi. Ularning so‘zlari kitobga alohida bob bo‘lib kiradi, siz esa bosishdan oldin ularni tekshirasiz." },
        { title: "To‘yga va undan keyin", text: "Elektron kitobni to‘lovdan keyin darhol olasiz, uni marosimda ko‘rsatish mumkin. Bosma nusxani bir necha ish kunida tayyorlaymiz, butun kitob maketini esa to‘lovdan oldin ko‘rasiz." },
      ],
      cover: { title: "To‘y kuningda", names: "Madina va dugonalardan" },
      faq: [
        ["Kitob juftlik haqidami yoki yosh oiladan biri haqida?", "Savollar bir kishi uchun mo‘ljallangan: kitob yaratishda kim haqida yozayotganingizni — kelin haqidami yoki kuyov haqida — tanlaysiz. Juftlikka tilaklarni do‘stlar va qarindoshlar havola orqali xat bilan qoldiradi."],
        ["Mehmonlardan tilaklarni qanday yig‘ish mumkin?", "Ularga havolani chatga yuboring yoki to‘yda yozishlarini so‘rang. Xat telefondan ro‘yxatdan o‘tmasdan yoziladi va kitobga alohida bob bo‘lib kiradi."],
        ["Yaqinda tanishgan bo‘lsak-chi?", "Bu to‘siq emas. O‘zingiz gapirib berishga narsa topadigan savollarga javob bersangiz yetarli, qolganlarini o‘tkazib yuborish mumkin."],
      ],
    },
  },
};
