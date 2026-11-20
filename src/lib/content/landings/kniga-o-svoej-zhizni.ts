import type { Landing } from "./types";

/** Автобиография: книга о жизни рассказчика, получателя у неё нет — род адресата не задан. */
export const knigaOSvoejZhizni: Landing = {
  slug: "kniga-o-svoej-zhizni",
  theme: "autobiography",
  coverTemplate: "leather",
  authorGender: "f",
  content: {
    ru: {
      label: "Книга о своей жизни",
      h1: "Книга о вашей жизни —",
      accent: "для детей и внуков",
      metaTitle: "Как написать книгу о своей жизни — автобиография с вопросами",
      metaDescription: "Напишите автобиографию по готовым вопросам: корни, детство, любовь, работа, уроки жизни. Можно записать со слов близкого. Вёрстка, фото и печать в твёрдом переплёте.",
      lead: "Откуда ваш род, каким было детство, как вы встретили любимого человека и чему научила жизнь — вопросы подскажут, с чего начать, а мы сверстаем всё как настоящее издание.",
      why: [
        { title: "Вопросы вместо чистого листа", text: "Десятки вопросов с подсказками: от «где вы родились» до «что хочется сказать детям». Отвечайте в любом порядке." },
        { title: "Можно рассказывать вслух", text: "Если писать трудно, пусть близкий задаёт вопросы и записывает ваши ответы. Его имя появится на обороте титула." },
        { title: "Семье на память", text: "Фотографии из альбома, письма родных отдельной главой и твёрдый переплёт — книга, которую передают из рук в руки." },
      ],
      cover: { title: "История моей жизни", names: "Бакыт Ахметов" },
      faq: [
        ["Нужно ли уметь писать?", "Нет. Пишите так, как рассказали бы внукам вечером. Заголовки и вёрстку мы берём на себя, а вопросы подскажут, о чём вспомнить."],
        ["Можно ли записать книгу со слов родителей или бабушки?", "Да. Автором книги будет рассказчик, а тот, кто записывает, указывается на обороте титула. Ответы можно набирать на телефоне во время разговора."],
        ["Можно ли подарить такую книгу?", "Подарите родителям или бабушке сертификат — они сами выберут «Автобиографию» и расскажут историю своей жизни."],
      ],
    },
    kk: {
      label: "Өз өмірім туралы кітап",
      h1: "Өміріңіз туралы кітап —",
      accent: "балаларыңыз бен немерелеріңізге",
      metaTitle: "Өз өмірің туралы кітап жазу — сұрақтары бар өмірбаян",
      metaDescription: "Өмірбаянды дайын сұрақтар бойынша жазыңыз: тегіңіз, балалық шақ, махаббат, еңбек және өмір сабақтары. Жақын адамның айтуымен жазуға болады. Беттеу, суреттер және қатты мұқабада басу.",
      lead: "Тегіңіз қайдан, балалық шағыңыз қандай болды, сүйген адамыңызбен қалай кездестіңіз, өмір не үйретті — сұрақтар қайдан бастау керегін айтады, ал біз бәрін нағыз басылымдай беттеп береміз.",
      why: [
        { title: "Таза парақтың орнына сұрақтар", text: "Кеңестері бар ондаған сұрақ: «қайда туылдыңыз» дегеннен «балаларыңызға не айтқыңыз келеді» дегенге дейін. Кез келген ретпен жауап беріңіз." },
        { title: "Дауыстап айтуға болады", text: "Жазу қиын болса, жақын адамыңыз сұрақ қойып, жауаптарыңызды жазып алсын. Оның есімі титул парағының арғы бетінде көрсетіледі." },
        { title: "Отбасына естелік болсын", text: "Альбомдағы суреттер, туыстардың хаттары жеке тарау болып және қатты мұқаба: қолдан қолға өтетін кітап." },
      ],
      cover: { title: "Өмірімнің тарихы", names: "Бақыт Ахметов" },
      faq: [
        ["Жаза білу керек пе?", "Жоқ. Немерелеріңізге кешкілік айтып отырғандай жазыңыз. Тақырыптар мен беттеуді біз аламыз, ал сұрақтар нені еске алу керегін айтады."],
        ["Кітапты ата-анамның немесе әжемнің айтуымен жазуға бола ма?", "Иә. Кітаптың авторы — әңгімеші, ал жазып отырған адам титул парағының арғы бетінде көрсетіледі. Жауаптарды әңгіме кезінде телефоннан теруге болады."],
        ["Мұндай кітапты сыйға беруге бола ма?", "Иә. Ата-анаңызға немесе әжеңізге сертификат сыйлаңыз — олар «Өмірбаянды» өздері таңдап, өмір тарихын айтады."],
      ],
    },
    uz: {
      label: "O‘z hayotim haqida kitob",
      h1: "Hayotingiz haqida kitob —",
      accent: "farzandlaringiz va nevaralaringiz uchun",
      metaTitle: "O‘z hayotingiz haqida kitob yozish — savollar bilan tarjimai hol",
      metaDescription: "Tarjimai holni tayyor savollar bilan yozing: ildizlar, bolalik, sevgi, mehnat, hayot saboqlari. Yaqiningiz yozib olishi mumkin. Maket, suratlar, qattiq muqova.",
      lead: "Naslingiz qayerdan, bolaligingiz qanday o‘tdi, sevgan insoningiz bilan qanday uchrashdingiz va hayot sizga nimani o‘rgatdi — savollar nimadan boshlashni aytadi, qolganini biz haqiqiy nashrdek maketlab beramiz.",
      why: [
        { title: "Oq varaq o‘rniga savollar", text: "Maslahatli o‘nlab savollar: «qayerda tug‘ilgansiz»dan «farzandlaringizga nima demoqchisiz»gacha. Xohlagan tartibda javob bering." },
        { title: "Ovoz chiqarib aytsa ham bo‘ladi", text: "Yozish qiyin bo‘lsa, yaqiningiz savol bersin va javoblaringizni yozib borsin. Uning ismi titul varag‘ining orqa tomonida ko‘rsatiladi." },
        { title: "Oilaga yodgorlik", text: "Albomdagi suratlar, yaqinlarning xatlari alohida bob bo‘lib va qattiq muqova — qo‘ldan qo‘lga o‘tadigan kitob." },
      ],
      cover: { title: "Hayotim tarixi", names: "Baqit Axmetov" },
      faq: [
        ["Yozishni bilish kerakmi?", "Yo‘q. Nevaralaringizga kechqurun aytib berayotgandek yozing. Sarlavhalar va maketni biz o‘z zimmamizga olamiz, savollar esa nimani eslash kerakligini aytadi."],
        ["Kitobni ota-onam yoki buvimning aytganlari bo‘yicha yozsa bo‘ladimi?", "Ha. Kitob muallifi — hikoyachi, yozib borayotgan odam esa titul varag‘ining orqa tomonida ko‘rsatiladi. Javoblarni suhbat paytida telefonda terish mumkin."],
        ["Bunday kitobni sovg‘a qilsa bo‘ladimi?", "Ota-onangiz yoki buvingizga sertifikat hadya qiling — ular «Tarjimai hol»ni o‘zlari tanlab, hayot tarixini aytib beradi."],
      ],
    },
    en: {
      label: "A book about your life",
      h1: "A book about your life —",
      accent: "for your children and grandchildren",
      metaTitle: "How to Write a Book About Your Life — Guided Autobiography",
      metaDescription: "Write your autobiography with ready-made questions: roots, childhood, love, work, lessons. Can be told to a loved one. Layout, photos and hardcover printing.",
      lead: "Where your family comes from, what your childhood was like, how you met the person you love and what life has taught you — the questions show you where to begin, and we lay it all out like a real published book.",
      why: [
        { title: "Questions instead of a blank page", text: "Dozens of questions with prompts: from “where were you born” to “what do you want to say to your children”. Answer in any order." },
        { title: "You can tell it out loud", text: "If writing is hard, let a loved one ask the questions and write down your answers. Their name will appear on the reverse of the title page." },
        { title: "A keepsake for the family", text: "Photos from the album, letters from relatives as a separate chapter and a hardcover binding — a book that is passed from hand to hand." },
      ],
      cover: { title: "The Story of My Life", names: "Bakyt Akhmetov" },
      faq: [
        ["Do I need to be able to write?", "No. Write the way you would tell it to your grandchildren in the evening. We take care of headings and layout, and the questions remind you what to recall."],
        ["Can I write the book from my parents’ or grandmother’s words?", "Yes. The storyteller will be the author of the book, and the person writing it down is named on the reverse of the title page. You can type the answers on your phone during the conversation."],
        ["Can I give a book like this as a gift?", "Give your parents or grandmother a gift certificate — they will choose “Autobiography” themselves and tell the story of their life."],
      ],
    },
  },
};
