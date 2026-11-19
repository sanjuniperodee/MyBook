import type { ToolDef } from "./types";

export const generatorPozdravlenij: ToolDef = {
  slug: "generator-pozdravlenij",
  kind: "greeting",
  theme: "mom",
  landing: "kniga-mame",
  content: {
    ru: {
      label: "Генератор поздравлений",
      h1: "Генератор поздравлений:",
      accent: "тёплые слова для близких",
      metaTitle: "Генератор поздравлений — маме, папе, жене, мужу, подруге, учителю",
      metaDescription: "Выберите, кого и с чем поздравляете, — получите готовый текст: с днём рождения, юбилеем, 8 Марта, 23 февраля, Днём учителя. Тёплый или с юмором, можно скопировать и отправить.",
      teaser: "Готовый текст поздравления маме, папе, жене, мужу, подруге или учителю — тёплый или с юмором.",
      lead: "Выберите, кого и с каким праздником поздравляете, добавьте имя — и получите готовое поздравление. Не подошёл вариант? Нажмите «Другой вариант». Всё работает мгновенно и бесплатно.",
      sections: [
        {
          heading: "Как сделать поздравление личным",
          paragraphs: [
            "Готовый текст — хорошая основа, но запоминается то, что знаете только вы. Добавьте одну-две детали: общий случай, любимую шутку, имя собаки, фразу, которую человек говорит чаще всего. Достаточно одного предложения, чтобы поздравление зазвучало иначе.",
            "Для сообщения выбирайте короткий вариант: одно искреннее пожелание лучше трёх дежурных. Для открытки или тоста подойдёт полный текст.",
          ],
        },
        {
          heading: "Когда слов в открытке мало",
          paragraphs: [
            "Иногда хочется сказать больше, чем помещается в поздравление: вспомнить детство, поблагодарить за конкретные вещи, рассказать, чему научил человек. Для этого можно собрать целую книгу: вы отвечаете на вопросы о близком, добавляете фото — и получаете подарок, который будут перечитывать.",
          ],
        },
      ],
      faq: [
        ["Как поздравить маму с днём рождения своими словами?", "Начните с благодарности за что-то конкретное, добавьте пожелание здоровья и тепла и завершите признанием в любви. Выберите в генераторе «Маму» и «День рождения» — получите основу и дополните её своей историей."],
        ["Можно ли получить смешное поздравление?", "Да, выберите настроение «С юмором»: пожелания будут шутливыми, но по-доброму. Для учителей и старших родственников шутки остаются мягкими."],
        ["Чем отличается короткое поздравление от полного?", "Короткое — одно пожелание, подходит для сообщения в мессенджере. Полное состоит из обращения, поздравления, нескольких пожеланий и тёплой концовки: его можно написать в открытке или произнести как тост."],
        ["Нужно ли указывать имя?", "Необязательно. Если имя указано, оно подставится в обращение — для жены, мужа, подруги, друга и учителей это звучит теплее."],
      ],
      cta: { title: "Скажите больше, чем в открытке", text: "Книга о близком человеке — это десятки вопросов, фотографии и ваши воспоминания в одном подарке. Писать можно бесплатно." },
    },
    kk: {
      label: "Құттықтау генераторы",
      h1: "Құттықтау генераторы:",
      accent: "жақындарға арналған жылы сөздер",
      metaTitle: "Құттықтау генераторы — анаға, әкеге, жарға, құрбыға, ұстазға",
      metaDescription: "Кімді және немен құттықтайтыныңызды таңдаңыз — дайын мәтін аласыз: туған күн, мерейтой, 8 наурыз, 23 ақпан, Ұстаздар күні. Жылы немесе әзілмен, көшіріп жіберуге болады.",
      teaser: "Анаға, әкеге, жарға, құрбыға немесе ұстазға дайын құттықтау мәтіні — жылы немесе әзілмен.",
      lead: "Кімді және қандай мерекемен құттықтайтыныңызды таңдап, атын қосыңыз — дайын құттықтау аласыз. Нұсқа ұнамаса, «Басқа нұсқа» батырмасын басыңыз. Бәрі лезде және тегін жұмыс істейді.",
      sections: [
        {
          heading: "Құттықтауды қалай жеке етуге болады",
          paragraphs: [
            "Дайын мәтін — жақсы негіз, бірақ тек өзіңіз білетін нәрсе есте қалады. Бір-екі бөлшек қосыңыз: ортақ оқиға, сүйікті әзіл, итіңіздің аты, адамның жиі айтатын сөзі. Құттықтау басқаша естілуі үшін бір сөйлем жеткілікті.",
            "Хабарламаға қысқа нұсқаны таңдаңыз: бір шынайы тілек үш формальды тілектен артық. Ашықхатқа немесе тостқа толық мәтін келеді.",
          ],
        },
        {
          heading: "Ашықхатта сөз аз болғанда",
          paragraphs: [
            "Кейде құттықтауға сыйғаннан көбірек айтқыңыз келеді: балалықты еске алу, нақты нәрселер үшін алғыс айту, адамның не үйреткенін айту. Ол үшін тұтас кітап жасауға болады: жақының туралы сұрақтарға жауап беріп, сурет қосасыз — қайта оқылатын сыйлық шығады.",
          ],
        },
      ],
      faq: [
        ["Анаға туған күнімен өз сөзіммен қалай құттықтауға болады?", "Нақты бір нәрсе үшін алғыстан бастаңыз, денсаулық пен жылулық тілегін қосыңыз да, сүйіспеншілік білдіріп аяқтаңыз. Генераторда «Анаңызды» және «Туған күн» таңдаңыз — негіз аласыз, оны өз оқиғаңызбен толықтырыңыз."],
        ["Күлкілі құттықтау алуға бола ма?", "Иә, «Әзілмен» көңіл-күйін таңдаңыз: тілектер әзілдеу, бірақ мейіріммен айтылады. Ұстаздар мен үлкен туыстарға әзілдер жұмсақ болып қалады."],
        ["Қысқа құттықтау толықтан несімен ерекшеленеді?", "Қысқасы — бір тілек, мессенджердегі хабарламаға лайық. Толығы — үндеу, құттықтау, бірнеше тілек және жылы қорытындыдан тұрады: оны ашықхатқа жазуға немесе тост ретінде айтуға болады."],
        ["Атын көрсету керек пе?", "Міндетті емес. Аты көрсетілсе, ол үндеуге қойылады — жарға, құрбыға, досқа және ұстаздарға бұл жылырақ естіледі."],
      ],
      cta: { title: "Ашықхатқа сыйғаннан көбірек айтыңыз", text: "Жақын адам туралы кітап — ондаған сұрақ, суреттер және сіздің естеліктеріңіз бір сыйлықта. Жазу тегін." },
    },
    uz: {
      label: "Tabrik generatori",
      h1: "Tabrik generatori:",
      accent: "yaqinlar uchun iliq so‘zlar",
      metaTitle: "Tabrik generatori — onaga, otaga, turmush o‘rtog‘iga, do‘stga, ustozga",
      metaDescription: "Kimni va nima bilan tabriklayotganingizni tanlang — tayyor matn oling: tug‘ilgan kun, yubiley, 8 mart, 23 fevral, Ustozlar kuni. Iliq yoki hazil bilan.",
      teaser: "Onaga, otaga, turmush o‘rtog‘iga, do‘stga yoki ustozga tayyor tabrik matni — iliq yoki hazil bilan.",
      lead: "Kimni va qaysi bayram bilan tabriklayotganingizni tanlang, ismini qo‘shing — tayyor tabrik olasiz. Variant yoqmasa, «Boshqa variant» tugmasini bosing. Hammasi bir zumda va bepul ishlaydi.",
      sections: [
        {
          heading: "Tabrikni qanday shaxsiy qilish mumkin",
          paragraphs: [
            "Tayyor matn — yaxshi asos, lekin faqat o‘zingiz biladigan narsa yodda qoladi. Bir-ikki tafsilot qo‘shing: umumiy voqea, yoqtirgan hazil, itingizning ismi, odam tez-tez aytadigan gap. Tabrik boshqacha jaranglashi uchun bitta gap yetarli.",
            "Xabar uchun qisqa variantni tanlang: bitta samimiy tilak uchta rasmiy tilakdan yaxshi. Tabrik kartasi yoki tost uchun to‘liq matn mos keladi.",
          ],
        },
        {
          heading: "Tabrik kartasida so‘z kam bo‘lganda",
          paragraphs: [
            "Ba’zan tabrikka sig‘adigandan ko‘proq aytging keladi: bolalikni eslash, aniq narsalar uchun minnatdorchilik bildirish, odam sizga nima o‘rgatganini aytish. Buning uchun butun bir kitob yig‘ish mumkin: yaqiningiz haqidagi savollarga javob berasiz, surat qo‘shasiz — qayta-qayta o‘qiladigan sovg‘a tayyor bo‘ladi.",
          ],
        },
      ],
      faq: [
        ["Onani tug‘ilgan kuni bilan o‘z so‘zlarim bilan qanday tabriklayman?", "Aniq bir narsa uchun minnatdorchilikdan boshlang, sog‘lik va iliqlik tilagini qo‘shing, mehr izhori bilan yakunlang. Generatorda «Onaga» va «Tug‘ilgan kun»ni tanlang — asos tayyor bo‘ladi, uni o‘z hikoyangiz bilan to‘ldiring."],
        ["Kulgili tabrik olish mumkinmi?", "Ha, «Hazil bilan» kayfiyatini tanlang: tilaklar hazilomuz, lekin yaxshi niyatda bo‘ladi. Ustozlar va katta yoshdagi qarindoshlar uchun hazillar yumshoq bo‘lib qoladi."],
        ["Qisqa tabrik to‘liqidan nimasi bilan farq qiladi?", "Qisqasi — bitta tilak, messenjerdagi xabarga mos. To‘liqi murojaat, tabrik, bir nechta tilak va iliq yakundan iborat: uni tabrik kartasiga yozish yoki tost sifatida aytish mumkin."],
        ["Ismni ko‘rsatish shartmi?", "Shart emas. Ism ko‘rsatilsa, u murojaatga qo‘yiladi — turmush o‘rtog‘i, do‘st va ustozlar uchun bu iliqroq eshitiladi."],
      ],
      cta: { title: "Tabrik kartasidagidan ko‘proq ayting", text: "Yaqin odam haqidagi kitob — o‘nlab savollar, suratlar va xotiralaringiz bitta sovg‘ada. Yozish bepul." },
    },
  },
};
