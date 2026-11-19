import type { ToolDef } from "./types";

export const uspetKDate: ToolDef = {
  slug: "uspet-k-date",
  kind: "deadline",
  theme: "love",
  landing: "podarok-na-godovshchinu",
  content: {
    ru: {
      label: "Успеть к празднику",
      h1: "Успеть к празднику:",
      accent: "до какого дня заказать книгу",
      metaTitle: "Когда заказать книгу в подарок, чтобы успеть к празднику — калькулятор",
      metaDescription: "Укажите дату праздника и способ доставки — подскажем, до какого дня заказать печатную книгу в подарок. Календарь заказов к 14 февраля, 8 Марта, Дню учителя и Новому году.",
      teaser: "Последний день заказа печатной книги к любой дате и календарь главных праздников.",
      lead: "Печатная книга делается несколько рабочих дней и ещё едет к вам. Укажите дату вручения — калькулятор покажет последний день заказа и подскажет, что делать, если времени мало.",
      sections: [
        {
          heading: "Из чего складывается срок",
          paragraphs: [
            "Срок складывается из трёх частей: время, которое нужно вам, чтобы ответить на вопросы и выбрать фото, производство печатной книги (5–7 рабочих дней, с экспресс-печатью — 3–4) и доставка. Калькулятор считает производство, доставку и день запаса на проверку макета перед печатью.",
            "Время на сам текст в расчёт не входит: чем раньше вы начнёте, тем спокойнее получится. Для хорошей книги достаточно 30–40 содержательных ответов, их легко набрать за несколько вечеров, а письма близких собираются по ссылке параллельно.",
          ],
        },
        {
          heading: "Что делать, если времени мало",
          paragraphs: [
            "Если печатная книга к дате не успевает, остаётся электронная версия: PDF в высоком разрешении вы получите сразу после оплаты и подарите в нужный день — например, показав на экране или отправив в мессенджере. Печатный экземпляр можно вручить чуть позже, это тоже приятный повод.",
            "Если нужна печать, но обычный срок уже не подходит, подключите экспресс-печать: книгу напечатают вне очереди за 3–4 рабочих дня.",
          ],
        },
      ],
      faq: [
        ["За сколько дней нужно заказывать книгу в подарок?", "Лучше за 2–3 недели до даты: время на ответы и фото, затем 5–7 рабочих дней на производство и доставка. С экспресс-печатью можно успеть быстрее, но запас всегда надёжнее."],
        ["Что делать, если до праздника меньше недели?", "Оформите электронную версию — она приходит сразу после оплаты. Печатную книгу можно заказать параллельно и вручить уже после праздника."],
        ["Сколько стоит доставка и сколько она занимает?", "Самовывоз из студии в Алматы бесплатный. Курьер по городу занимает 1–2 дня после печати, по Казахстану через СДЭК или Казпочту — 3–7 дней. Стоимость доставки менеджер называет индивидуально."],
        ["Можно ли подарить книгу в день праздника, если печатная не успевает?", "Да. Электронная версия готова сразу после оплаты, её можно подарить в нужный день, а печатную вручить позже."],
      ],
      cta: { title: "Начните книгу сегодня", text: "Писать можно бесплатно и в своём темпе: отвечайте на вопросы с телефона или голосом. Заказывайте, когда книга готова." },
    },
    kk: {
      label: "Мерекеге үлгеру",
      h1: "Мерекеге үлгеру:",
      accent: "кітапқа қай күнге дейін тапсырыс беру керек",
      metaTitle: "Мерекеге үлгеру үшін кітапқа қашан тапсырыс беру керек — есептегіш",
      metaDescription: "Мереке күнін және жеткізу тәсілін көрсетіңіз — сыйлыққа басылған кітапқа қай күнге дейін тапсырыс беру керегін айтамыз. 14 ақпан, 8 наурыз, Ұстаздар күні және Жаңа жылға арналған күнтізбе.",
      teaser: "Кез келген күнге басылған кітапқа тапсырыс берудің соңғы күні және негізгі мерекелер күнтізбесі.",
      lead: "Басылған кітап бірнеше жұмыс күнінде жасалады және сізге жеткізіледі. Сыйлық табыстайтын күнді көрсетіңіз — есептегіш тапсырыс берудің соңғы күнін көрсетіп, уақыт аз болса не істеу керегін айтады.",
      sections: [
        {
          heading: "Мерзім неден тұрады",
          paragraphs: [
            "Мерзім үш бөліктен тұрады: сұрақтарға жауап беріп, сурет таңдауға сізге қажет уақыт, басылған кітаптың өндірісі (5–7 жұмыс күні, жедел басып шығарумен — 3–4) және жеткізу. Есептегіш өндірісті, жеткізуді және басып шығару алдында макетті тексеруге бір күн қорды ескереді.",
            "Мәтінге кететін уақыт есепке кірмейді: ертерек бастасаңыз, соғұрлым тыныш болады. Жақсы кітапқа 30–40 мазмұнды жауап жеткілікті, оларды бірнеше кеште жинап алуға болады, ал жақындардың хаттары сілтеме арқылы қатар жиналады.",
          ],
        },
        {
          heading: "Уақыт аз болса не істеу керек",
          paragraphs: [
            "Басылған кітап күнге үлгермесе, электрондық нұсқа қалады: жоғары ажыратымдылықтағы PDF-ті төлемнен кейін бірден аласыз да, қажет күні сыйлайсыз — мысалы, экраннан көрсетіп немесе мессенджермен жіберіп. Басылған данасын сәл кейін табыстауға болады, бұл да жағымды себеп.",
            "Басып шығару қажет, бірақ әдеттегі мерзім келмесе, жедел басып шығаруды қосыңыз: кітап кезексіз, 3–4 жұмыс күнінде басылады.",
          ],
        },
      ],
      faq: [
        ["Сыйлыққа кітапқа неше күн бұрын тапсырыс беру керек?", "Күнге 2–3 апта қалғанда жақсы: жауап беріп, сурет таңдауға уақыт, содан кейін өндіріске 5–7 жұмыс күні және жеткізу. Жедел басып шығарумен тезірек үлгеруге болады, бірақ қор әрқашан сенімдірек."],
        ["Мерекеге бір аптадан аз қалса не істеу керек?", "Электрондық нұсқаны рәсімдеңіз — ол төлемнен кейін бірден келеді. Басылған кітапқа қатар тапсырыс беріп, мерекеден кейін табыстауға болады."],
        ["Жеткізу қанша тұрады және қанша уақыт алады?", "Алматыдағы студиядан өзі алып кету тегін. Қала ішінде курьер басып шыққаннан кейін 1–2 күн, Қазақстан бойынша СДЭК немесе Қазпочта арқылы 3–7 күн алады. Жеткізу құнын менеджер жеке айтады."],
        ["Басылған кітап үлгермесе, мереке күні сыйлауға бола ма?", "Иә. Электрондық нұсқа төлемнен кейін бірден дайын, оны қажет күні сыйлап, басылғанын кейін табыстауға болады."],
      ],
      cta: { title: "Кітапты бүгін бастаңыз", text: "Жазу тегін және өз қарқыныңызбен: сұрақтарға телефоннан немесе дауыспен жауап беріңіз. Кітап дайын болғанда тапсырыс беріңіз." },
    },
    uz: {
      label: "Bayramga ulgurish",
      h1: "Bayramga ulgurish:",
      accent: "kitobga qaysi kungacha buyurtma berish kerak",
      metaTitle: "Bayramga ulgurish uchun sovg‘a kitobga qachon buyurtma berish kerak",
      metaDescription: "Bayram sanasi va yetkazib berish usulini ko‘rsating — bosma sovg‘a kitobga qaysi kungacha buyurtma berishni aytamiz. 14 fevral, 8 mart va Yangi yil kalendari.",
      teaser: "Istalgan sanaga bosma kitob buyurtmasining oxirgi kuni va asosiy bayramlar kalendari.",
      lead: "Bosma kitob bir necha ish kunida tayyorlanadi va yana sizga yetib keladi. Topshirish sanasini ko‘rsating — kalkulyator buyurtmaning oxirgi kunini ko‘rsatadi va vaqt kam bo‘lsa, nima qilishni aytadi.",
      sections: [
        {
          heading: "Muddat nimalardan tashkil topadi",
          paragraphs: [
            "Muddat uch qismdan iborat: savollarga javob berib, suratlarni tanlash uchun sizga kerak bo‘ladigan vaqt, bosma kitobni tayyorlash (5–7 ish kuni, tezkor bosma bilan — 3–4 kun) va yetkazib berish. Kalkulyator tayyorlash, yetkazib berish va bosishdan oldin maketni tekshirish uchun bir kun zaxirani hisoblaydi.",
            "Matnning o‘ziga ketadigan vaqt hisobga kirmaydi: qanchalik erta boshlasangiz, shunchalik xotirjam bo‘ladi. Yaxshi kitob uchun 30–40 ta mazmunli javob yetarli, ularni bir necha kechada to‘plash oson, yaqinlar xatlari esa havola orqali parallel yig‘iladi.",
          ],
        },
        {
          heading: "Vaqt kam bo‘lsa, nima qilish kerak",
          paragraphs: [
            "Bosma kitob sanaga ulgurmasa, elektron nusxa qoladi: yuqori sifatli PDF-ni to‘lovdan keyin darhol olasiz va kerakli kuni sovg‘a qilasiz — masalan, ekranda ko‘rsatib yoki messenjerda yuborib. Bosma nusxani biroz keyinroq topshirish mumkin, bu ham yoqimli bahona.",
            "Bosma kerak, lekin odatiy muddat endi to‘g‘ri kelmasa, tezkor bosmani yoqing: kitob navbatsiz 3–4 ish kunida bosiladi.",
          ],
        },
      ],
      faq: [
        ["Sovg‘a kitobga necha kun oldin buyurtma berish kerak?", "Sanadan 2–3 hafta oldin yaxshiroq: javoblar va suratlar uchun vaqt, so‘ng tayyorlash uchun 5–7 ish kuni va yetkazib berish. Tezkor bosma bilan tezroq ulgurish mumkin, lekin zaxira doim ishonchliroq."],
        ["Bayramgacha bir haftadan kam qolgan bo‘lsa, nima qilish kerak?", "Elektron nusxani rasmiylashtiring — u to‘lovdan keyin darhol keladi. Bosma kitobga parallel buyurtma berib, bayramdan keyin topshirish mumkin."],
        ["Yetkazib berish qancha turadi va qancha vaqt oladi?", "Studiyadan o‘zingiz olib ketsangiz, bepul. Shahar bo‘ylab kuryer bosmadan keyin 1–2 kun oladi, Qozog‘iston bo‘ylab CDEK yoki Kazpochta orqali — 3–7 kun. Yetkazib berish narxini menejer alohida aytadi."],
        ["Bosma kitob ulgurmasa, kitobni bayram kuni sovg‘a qilish mumkinmi?", "Ha. Elektron nusxa to‘lovdan keyin darhol tayyor bo‘ladi, uni kerakli kuni sovg‘a qilib, bosmasini keyinroq topshirish mumkin."],
      ],
      cta: { title: "Kitobni bugun boshlang", text: "Yozish bepul va o‘z tezligingizda: savollarga telefondan yoki ovoz bilan javob bering. Kitob tayyor bo‘lganda buyurtma bering." },
    },
  },
};
