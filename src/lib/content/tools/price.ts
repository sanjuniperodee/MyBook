import type { ToolDef } from "./types";

export const skolkoStoitKniga: ToolDef = {
  slug: "skolko-stoit-kniga",
  kind: "price",
  theme: "love",
  content: {
    ru: {
      label: "Сколько стоит книга",
      h1: "Сколько стоит книга:",
      accent: "калькулятор цены",
      metaTitle: "Сколько стоит персональная книга в подарок — калькулятор цены",
      metaDescription: "Рассчитайте стоимость книги в подарок: электронная версия, твёрдая обложка, дополнительные экземпляры, подарочная упаковка и экспресс-печать. Актуальные цены в тенге.",
      teaser: "Итоговая сумма за электронную или печатную книгу, экземпляры и дополнения.",
      lead: "Выберите формат, число экземпляров и дополнения — калькулятор сразу покажет итоговую сумму в тенге. Писать книгу бесплатно: платите, когда она готова.",
      sections: [
        {
          heading: "Из чего складывается цена",
          paragraphs: [
            "Цена зависит от формата. Электронная версия — это PDF в высоком разрешении, который приходит сразу после оплаты. Книга в твёрдой обложке — печатный экземпляр в твёрдом переплёте с шитым блоком, плюс PDF-версия в подарок.",
            "Если нужно несколько экземпляров — для брата, сестры, бабушки, — каждая следующая печатная книга стоит дешевле первой. К печатному заказу можно добавить подарочную упаковку и экспресс-печать.",
          ],
        },
        {
          heading: "Доставка и сроки",
          paragraphs: [
            "Самовывоз из студии в Алматы бесплатный. Курьер, доставка по Казахстану и в другие страны считаются индивидуально: цена зависит от города и перевозчика, поэтому менеджер называет её отдельно, и в итоговую сумму калькулятора она не входит.",
            "Печатная книга делается 5–7 рабочих дней, экспресс-печать — 3–4. Узнать, до какого дня оформить заказ к конкретному празднику, можно в калькуляторе «Успеть к празднику».",
          ],
        },
      ],
      faq: [
        ["Сколько стоит книга в подарок?", "Цена зависит от формата: электронная версия стоит меньше, печатная в твёрдой обложке — больше. Точные суммы для вашего заказа покажет калькулятор выше — цены в нём всегда актуальные."],
        ["Нужно ли платить, чтобы начать писать книгу?", "Нет. Писать книгу, добавлять фото и собирать письма можно бесплатно. Платить нужно, когда книга готова и вы оформляете заказ."],
        ["Сколько стоит дополнительный экземпляр?", "Каждый следующий печатный экземпляр дешевле первого: цену видно в калькуляторе при увеличении числа экземпляров."],
        ["Входит ли доставка в стоимость?", "Нет, доставку менеджер считает отдельно — по городу и перевозчику. Самовывоз из студии в Алматы бесплатный."],
      ],
      cta: { title: "Начните писать — это бесплатно", text: "Отвечайте на вопросы, добавляйте фото и смотрите макет книги. Платить нужно только когда решите заказать." },
    },
    kk: {
      label: "Кітап қанша тұрады",
      h1: "Кітап қанша тұрады:",
      accent: "баға есептегіші",
      metaTitle: "Сыйлыққа жеке кітап қанша тұрады — баға есептегіші",
      metaDescription: "Сыйлыққа кітаптың құнын есептеңіз: электрондық нұсқа, қатты мұқаба, қосымша даналар, сыйлық орамасы және жедел басып шығару. Теңгемен өзекті бағалар.",
      teaser: "Электрондық немесе басылған кітаптың, даналардың және қосымшалардың жиынтық сомасы.",
      lead: "Пішімді, даналар санын және қосымшаларды таңдаңыз — есептегіш жиынтық соманы теңгемен бірден көрсетеді. Кітап жазу тегін: ол дайын болғанда төлейсіз.",
      sections: [
        {
          heading: "Баға неден тұрады",
          paragraphs: [
            "Баға пішімге байланысты. Электрондық нұсқа — төлемнен кейін бірден келетін жоғары ажыратымдылықтағы PDF. Қатты мұқабалы кітап — тігілген блогы бар қатты түптемедегі басылған дана, сыйлыққа PDF-нұсқа қосылады.",
            "Бірнеше дана керек болса — аға-інілерге, апаға, әжеге — әрбір келесі басылған кітап біріншісінен арзан. Басылған тапсырысқа сыйлық орамасы мен жедел басып шығаруды қосуға болады.",
          ],
        },
        {
          heading: "Жеткізу және мерзімдер",
          paragraphs: [
            "Алматыдағы студиядан өзі алып кету тегін. Курьер, Қазақстан бойынша және басқа елдерге жеткізу жеке есептеледі: баға қалаға және тасымалдаушыға байланысты, сондықтан оны менеджер бөлек айтады және ол есептегіштің жиынтық сомасына кірмейді.",
            "Басылған кітап 5–7 жұмыс күнінде жасалады, жедел басып шығару — 3–4. Нақты мерекеге қай күнге дейін тапсырыс беру керегін «Мерекеге үлгеру» есептегішінен білуге болады.",
          ],
        },
      ],
      faq: [
        ["Сыйлыққа кітап қанша тұрады?", "Баға пішімге байланысты: электрондық нұсқа арзанырақ, қатты мұқабалы басылған кітап қымбатырақ. Тапсырысыңыздың нақты сомасын жоғарыдағы есептегіш көрсетеді — ондағы бағалар әрқашан өзекті."],
        ["Кітап жаза бастау үшін төлеу керек пе?", "Жоқ. Кітап жазу, сурет қосу және хат жинау тегін. Кітап дайын болып, тапсырыс бергенде төлейсіз."],
        ["Қосымша дана қанша тұрады?", "Әрбір келесі басылған дана біріншісінен арзан: даналар санын өсіргенде бағасы есептегіште көрінеді."],
        ["Жеткізу құнға кіре ме?", "Жоқ, жеткізуді менеджер қала мен тасымалдаушыға қарай бөлек есептейді. Алматыдағы студиядан өзі алып кету тегін."],
      ],
      cta: { title: "Жазуды бастаңыз — бұл тегін", text: "Сұрақтарға жауап беріңіз, сурет қосыңыз және кітап макетін қараңыз. Тапсырыс беруге шешім қабылдағанда ғана төлейсіз." },
    },
    uz: {
      label: "Kitob qancha turadi",
      h1: "Kitob qancha turadi:",
      accent: "narx kalkulyatori",
      metaTitle: "Sovg‘a uchun shaxsiy kitob qancha turadi — narx kalkulyatori",
      metaDescription: "Sovg‘a kitob narxini hisoblang: elektron nusxa, qattiq muqova, qo‘shimcha nusxalar, sovg‘a qadoqi va tezkor bosma. Tenge bilan dolzarb narxlar.",
      teaser: "Elektron yoki bosma kitobning, nusxalar va qo‘shimchalarning yakuniy summasi.",
      lead: "Formatni, nusxalar sonini va qo‘shimchalarni tanlang — kalkulyator yakuniy summani darhol tenge bilan ko‘rsatadi. Kitob yozish bepul: kitob tayyor bo‘lgandagina to‘laysiz.",
      sections: [
        {
          heading: "Narx nimalardan tashkil topadi",
          paragraphs: [
            "Narx formatga bog‘liq. Elektron nusxa — to‘lovdan keyin darhol keladigan yuqori sifatli PDF. Qattiq muqovali kitob — tikilgan bloki bor, qattiq muqovada bosilgan nusxa, sovg‘a sifatida PDF-nusxa ham qo‘shiladi.",
            "Bir necha nusxa kerak bo‘lsa — aka-ukangiz, opa-singlingiz, buvingiz uchun — har bir keyingi bosma kitob birinchisidan arzonroq turadi. Bosma buyurtmaga sovg‘a qadoqi va tezkor bosmani qo‘shish mumkin.",
          ],
        },
        {
          heading: "Yetkazib berish va muddatlar",
          paragraphs: [
            "Almatidagi studiyadan o‘zingiz olib ketsangiz, bepul. Kuryer, Qozog‘iston bo‘ylab va boshqa mamlakatlarga yetkazib berish alohida hisoblanadi: narx shaharga va tashuvchiga bog‘liq, shuning uchun uni menejer alohida aytadi va u kalkulyatorning yakuniy summasiga kirmaydi.",
            "Bosma kitob 5–7 ish kunida tayyorlanadi, tezkor bosma — 3–4 kunda. Muayyan bayramga qaysi kungacha buyurtma berish kerakligini «Bayramga ulgurish» kalkulyatorida bilib olishingiz mumkin.",
          ],
        },
      ],
      faq: [
        ["Sovg‘a uchun kitob qancha turadi?", "Narx formatga bog‘liq: elektron nusxa arzonroq, qattiq muqovali bosma kitob qimmatroq. Buyurtmangiz uchun aniq summani yuqoridagi kalkulyator ko‘rsatadi — undagi narxlar doim dolzarb."],
        ["Kitob yozishni boshlash uchun to‘lash kerakmi?", "Yo‘q. Kitob yozish, surat qo‘shish va yaqinlar xatlarini yig‘ish bepul. Kitob tayyor bo‘lib, buyurtma berayotganingizda to‘laysiz."],
        ["Qo‘shimcha nusxa qancha turadi?", "Har bir keyingi bosma nusxa birinchisidan arzon: nusxalar sonini oshirganingizda narxi kalkulyatorda ko‘rinadi."],
        ["Yetkazib berish narxga kiradimi?", "Yo‘q, yetkazib berishni menejer shahar va tashuvchiga qarab alohida hisoblaydi. Almatidagi studiyadan o‘zingiz olib ketsangiz, bepul."],
      ],
      cta: { title: "Yozishni boshlang — bu bepul", text: "Savollarga javob bering, surat qo‘shing va kitob maketini ko‘ring. Buyurtma berishga qaror qilgandagina to‘laysiz." },
    },
    en: {
      label: "How much a book costs",
      h1: "How much a book costs:",
      accent: "price calculator",
      metaTitle: "How much a personal gift book costs — price calculator",
      metaDescription: "Work out the price of a gift book: digital copy, hardcover, extra copies, gift wrapping and express printing. Current prices in tenge.",
      teaser: "The total for a digital or printed book, extra copies and add-ons.",
      lead: "Choose the format, the number of copies and any add-ons, and the calculator instantly shows the total in tenge. Writing the book is free: you pay when it is ready.",
      sections: [
        {
          heading: "What the price is made of",
          paragraphs: [
            "The price depends on the format. The digital copy is a high-resolution PDF that reaches you right after payment. The hardcover book is a printed copy with a sewn block, and the PDF version comes as a gift.",
            "If you need several copies — for a brother, a sister, a grandmother — each further printed book costs less than the first. You can add gift wrapping and express printing to a printed order.",
          ],
        },
        {
          heading: "Delivery and timing",
          paragraphs: [
            "Pick-up from our studio in Almaty is free. Courier delivery, delivery across Kazakhstan and to other countries are priced individually: the cost depends on the city and the carrier, so the manager quotes it separately and it is not included in the calculator’s total.",
            "A printed book takes 5–7 working days to make, express printing 3–4. To find out the last day to order for a particular holiday, use the “In time for the holiday” calculator.",
          ],
        },
      ],
      faq: [
        ["How much does a gift book cost?", "The price depends on the format: the digital copy costs less, the printed hardcover more. The calculator above shows the exact amounts for your order — its prices are always up to date."],
        ["Do I have to pay to start writing the book?", "No. Writing the book, adding photos and collecting letters is free. You pay when the book is ready and you place the order."],
        ["How much does an extra copy cost?", "Each further printed copy costs less than the first: you can see the price in the calculator as you increase the number of copies."],
        ["Is delivery included in the price?", "No, the manager calculates delivery separately, by city and carrier. Pick-up from our studio in Almaty is free."],
      ],
      cta: { title: "Start writing — it’s free", text: "Answer the questions, add photos and look at the book’s layout. You only pay when you decide to order." },
    },
  },
};
