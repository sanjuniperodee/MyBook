import type { ToolDef } from "./types";

/** Инструменты, которые решают задачу автора книги: проверка фото, объём, план по датам, родословная. */
export const proverkaFoto: ToolDef = {
  slug: "proverka-foto-dlya-pechati",
  kind: "photo",
  theme: "mom",
  landing: "kniga-mame",
  content: {
    ru: {
      label: "Проверка фото для печати",
      h1: "Подойдёт ли фото для печати:",
      accent: "проверьте до заказа",
      metaTitle: "Проверка фото для печати книги: хватит ли разрешения (dpi)",
      metaDescription: "Загрузите фото и узнайте, чётко ли оно напечатается в книге: на всю страницу, в сетке, на обложке. Считаем dpi и максимальный размер печати. Снимки не покидают ваш браузер.",
      teaser: "Загрузите снимки — покажем, какие напечатаются чётко, а какие нужно заменить.",
      lead: "Фото из мессенджера или соцсети на экране выглядит хорошо, а на бумаге выходит размытым. Перетащите снимки — калькулятор покажет разрешение на каждом месте в книге и скажет, что стоит заменить до заказа. Файлы никуда не загружаются.",
      sections: [
        {
          heading: "Что такое dpi и сколько его нужно",
          paragraphs: [
            "Dpi — число точек на дюйм (2,54 см). Для типографской печати нужно около 300 dpi: тогда глаз не различает отдельных точек. Ниже 150 dpi изображение уже заметно мягче, а на крупном формате становятся видны пиксели.",
            "Разрешение зависит не от «качества фото», а от того, сколько пикселей приходится на печатный размер. Одно и то же фото чётко напечатается маленьким в сетке и размыто — на всю страницу.",
          ],
        },
        {
          heading: "Сколько пикселей нужно для страницы книги",
          paragraphs: [
            "Для страницы A5 (148×210 мм) при 300 dpi нужно примерно 1750×2480 пикселей, то есть около 4,3 мегапикселя. Любой современный телефон снимает в 8–50 Мп, так что оригиналы почти всегда подходят.",
            "Проблемы возникают с копиями: WhatsApp и Telegram сжимают фото до 1600 пикселей по длинной стороне, соцсети — ещё сильнее, а старые отсканированные снимки часто сохранены в маленьком размере.",
          ],
        },
        {
          heading: "Как получить фото получше",
          paragraphs: ["Просите отправить оригинал «файлом» или «документом», а не «фото». Бумажные снимки сканируйте на 600 dpi. Не увеличивайте фото в приложениях: пикселей от этого не прибавится."],
        },
      ],
      faq: [
        ["Сколько dpi нужно для печати книги?", "Около 300 dpi для чёткой печати. Снимок можно использовать от 150 dpi, но ниже печать заметно мягче. Калькулятор показывает разрешение на каждом месте в книге."],
        ["Почему фото из WhatsApp печатаются размыто?", "Мессенджеры сжимают снимки до примерно 1600 пикселей по длинной стороне. Этого хватает для экрана телефона, но мало для страницы книги. Просите отправить оригинал как файл или документ."],
        ["Загружаются ли мои фото на сервер?", "Нет. Проверка работает в вашем браузере: размеры считываются локально, снимки никуда не отправляются."],
        ["Что делать, если фото маленькое, а другого нет?", "Поставьте его на место поменьше: в сетку из четырёх или на половину страницы. Там пикселей нужно меньше, и снимок напечатается приемлемо. Большая обрезка на всю страницу ему противопоказана."],
      ],
      cta: { title: "Соберите книгу с лучшими фото", text: "В редакторе тоже есть подсказки о разрешении: он предупредит, если снимок нечётко напечатается. Писать книгу можно бесплатно." },
    },
    kk: {
      label: "Басып шығаруға суретті тексеру",
      h1: "Сурет басып шығаруға жарай ма:",
      accent: "тапсырыс бермес бұрын тексеріңіз",
      metaTitle: "Кітапқа басып шығаруға суретті тексеру: ажыратымдылық (dpi) жете ме",
      metaDescription: "Суретті жүктеп, оның кітапта анық басылатынын біліңіз: бүкіл бетке, торда, мұқабада. dpi мен ең үлкен басу өлшемін санаймыз. Суреттер браузеріңізден шықпайды.",
      teaser: "Суреттерді жүктеңіз — қайсысы анық басылатынын, қайсысын ауыстыру керегін көрсетеміз.",
      lead: "Мессенджерден немесе әлеуметтік желіден келген сурет экранда жақсы көрінеді, ал қағазда бұлыңғыр шығады. Суреттерді сүйреңіз — есептегіш кітаптағы әр орында ажыратымдылықты көрсетіп, тапсырыс бермес бұрын нені ауыстыру керегін айтады. Файлдар ешқайда жүктелмейді.",
      sections: [
        {
          heading: "dpi дегеніміз не және қанша керек",
          paragraphs: [
            "Dpi — дюймдегі (2,54 см) нүктелер саны. Баспаханалық басып шығаруға шамамен 300 dpi керек: сонда көз жеке нүктелерді айырмайды. 150 dpi-ден төмен сурет байқалатындай жұмсақ болады, ал үлкен пішімде пиксельдер көрінеді.",
            "Ажыратымдылық «сурет сапасына» емес, басылатын өлшемге қанша пиксель келетініне байланысты. Бір сурет торда кішкентай болып анық басылады, ал бүкіл бетке — бұлыңғыр.",
          ],
        },
        {
          heading: "Кітап бетіне қанша пиксель керек",
          paragraphs: [
            "A5 беті (148×210 мм) үшін 300 dpi кезінде шамамен 1750×2480 пиксель керек, яғни шамамен 4,3 мегапиксель. Қазіргі телефондардың бәрі 8–50 Мп түсіреді, сондықтан түпнұсқалар көбіне жарайды.",
            "Қиындық көшірмелерде: WhatsApp пен Telegram суретті ұзын жағы бойынша 1600 пикселге дейін сығады, әлеуметтік желілер одан да қатты, ал ескі сканерленген суреттер жиі кішкентай өлшемде сақталған.",
          ],
        },
        {
          heading: "Жақсырақ сурет қалай алуға болады",
          paragraphs: ["Түпнұсқаны «сурет» емес, «файл» немесе «құжат» ретінде жіберуін сұраңыз. Қағаз суреттерді 600 dpi-мен сканерлеңіз. Суретті қосымшаларда үлкейтпеңіз: бұдан пиксель көбеймейді."],
        },
      ],
      faq: [
        ["Кітап басуға қанша dpi керек?", "Анық басу үшін шамамен 300 dpi. Суретті 150 dpi-ден қолдануға болады, бірақ одан төмен басу байқалатындай жұмсақ. Есептегіш кітаптағы әр орында ажыратымдылықты көрсетеді."],
        ["WhatsApp-тағы суреттер неге бұлыңғыр басылады?", "Мессенджерлер суреттерді ұзын жағы бойынша шамамен 1600 пикселге дейін сығады. Бұл телефон экраны үшін жеткілікті, бірақ кітап беті үшін аз. Түпнұсқаны файл немесе құжат ретінде жіберуін сұраңыз."],
        ["Менің суреттерім серверге жүктеле ме?", "Жоқ. Тексеру браузеріңізде жұмыс істейді: өлшемдер жергілікті оқылады, суреттер ешқайда жіберілмейді."],
        ["Сурет кішкентай, ал басқасы жоқ болса не істеу керек?", "Оны кішірек орынға қойыңыз: төртеулік торға немесе беттің жартысына. Онда пиксель аз керек, сурет қолайлы басылады. Бүкіл бетке үлкен қию оған жараспайды."],
      ],
      cta: { title: "Кітапты ең жақсы суреттермен жинаңыз", text: "Редакторда да ажыратымдылық туралы кеңестер бар: сурет анық емес басылса, ескертеді. Кітап жазу тегін." },
    },
    uz: {
      label: "Suratni bosmaga tekshirish",
      h1: "Surat bosmaga mos keladimi:",
      accent: "buyurtmadan oldin tekshiring",
      metaTitle: "Kitob uchun suratni bosmaga tekshirish: ruxsat (dpi) yetadimi",
      metaDescription: "Suratni yuklang va kitobda aniq bosilishini bilib oling: butun sahifaga, setkada, muqovada. dpi va maksimal bosma o‘lchamini hisoblaymiz.",
      teaser: "Suratlarni yuklang — qaysilari aniq bosilishini, qaysilarini almashtirish kerakligini ko‘rsatamiz.",
      lead: "Messenjer yoki ijtimoiy tarmoqdagi surat ekranda yaxshi ko‘rinadi, qog‘ozda esa xira chiqadi. Suratlarni sudrab olib keling — kalkulyator kitobdagi har bir joy uchun ruxsatni ko‘rsatadi va buyurtmadan oldin nimani almashtirish kerakligini aytadi. Fayllar hech qayoqqa yuklanmaydi.",
      sections: [
        {
          heading: "dpi nima va uning qanchasi kerak",
          paragraphs: [
            "dpi — dyuymdagi (2,54 sm) nuqtalar soni. Tipografiya bosmasi uchun taxminan 300 dpi kerak: shunda ko‘z alohida nuqtalarni ajratmaydi. 150 dpi dan past bo‘lsa, tasvir sezilarli darajada yumshoq bo‘ladi, katta formatda esa piksellar ko‘rinib qoladi.",
            "Ruxsat «suratning sifati»ga emas, bosma o‘lchamiga qancha piksel to‘g‘ri kelishiga bog‘liq. Aynan bir xil surat setkada kichik bo‘lib aniq bosiladi, butun sahifaga esa xira chiqadi.",
          ],
        },
        {
          heading: "Kitob sahifasi uchun qancha piksel kerak",
          paragraphs: [
            "300 dpi da A5 sahifa (148×210 mm) uchun taxminan 1750×2480 piksel, ya’ni qariyb 4,3 megapiksel kerak. Har qanday zamonaviy telefon 8–50 Mp da suratga oladi, shuning uchun originallar deyarli har doim mos keladi.",
            "Muammolar nusxalar bilan chiqadi: WhatsApp va Telegram suratni uzun tomoni bo‘yicha 1600 pikselgacha siqadi, ijtimoiy tarmoqlar — undan ham kuchliroq, eski skanerlangan suratlar esa ko‘pincha kichik o‘lchamda saqlangan.",
          ],
        },
        {
          heading: "Yaxshiroq surat qanday olinadi",
          paragraphs: ["Originalni «surat» sifatida emas, «fayl» yoki «hujjat» sifatida yuborishni so‘rang. Qog‘oz suratlarni 600 dpi da skanerlang. Suratni ilovalarda kattalashtirmang: bundan piksellar ko‘paymaydi."],
        },
      ],
      faq: [
        ["Kitob bosmasi uchun necha dpi kerak?", "Aniq bosma uchun taxminan 300 dpi. Suratni 150 dpi dan boshlab ishlatish mumkin, lekin undan past bo‘lsa, bosma sezilarli yumshoq bo‘ladi. Kalkulyator kitobdagi har bir joy uchun ruxsatni ko‘rsatadi."],
        ["Nega WhatsApp’dagi suratlar xira bosiladi?", "Messenjerlar suratlarni uzun tomoni bo‘yicha taxminan 1600 pikselgacha siqadi. Bu telefon ekrani uchun yetadi, kitob sahifasi uchun esa kam. Originalni fayl yoki hujjat sifatida yuborishni so‘rang."],
        ["Suratlarim serverga yuklanadimi?", "Yo‘q. Tekshiruv brauzeringizda ishlaydi: o‘lchamlar mahalliy o‘qiladi, suratlar hech qayoqqa yuborilmaydi."],
        ["Surat kichik bo‘lsa-yu, boshqasi bo‘lmasa, nima qilish kerak?", "Uni kichikroq joyga qo‘ying: to‘rttalik setkaga yoki sahifaning yarmiga. U yerda piksel kamroq kerak va surat qoniqarli bosiladi. Butun sahifaga katta kesish unga to‘g‘ri kelmaydi."],
      ],
      cta: { title: "Kitobni eng yaxshi suratlar bilan yig‘ing", text: "Muharrirda ham ruxsat bo‘yicha maslahatlar bor: surat xira bosilsa, ogohlantiradi. Kitob yozish bepul." },
    },
    en: {
      label: "Photo check for printing",
      h1: "Will the photo print well:",
      accent: "check before you order",
      metaTitle: "Photo check for printing a book: is the resolution (dpi) enough",
      metaDescription: "Upload a photo and find out whether it will print sharply in the book: full page, in a grid, on the cover. We calculate dpi and the maximum print size. Photos never leave your browser.",
      teaser: "Upload your photos — we will show which will print sharply and which need replacing.",
      lead: "A photo from a messenger or social network looks fine on screen but comes out blurry on paper. Drag in your photos and the calculator shows the resolution for every place in the book and tells you what to replace before ordering. Files are not uploaded anywhere.",
      sections: [
        {
          heading: "What dpi is and how much you need",
          paragraphs: [
            "Dpi is dots per inch (2.54 cm). Professional printing needs about 300 dpi: then the eye cannot make out individual dots. Below 150 dpi the image is already noticeably softer, and at a large size the pixels become visible.",
            "Resolution depends not on the “quality of the photo” but on how many pixels fall on the printed size. The same photo prints sharply when small in a grid and blurry across a full page.",
          ],
        },
        {
          heading: "How many pixels a book page needs",
          paragraphs: [
            "For an A5 page (148×210 mm) at 300 dpi you need roughly 1750×2480 pixels, which is about 4.3 megapixels. Any modern phone shoots at 8–50 MP, so originals almost always work.",
            "Problems come with copies: WhatsApp and Telegram compress photos to 1600 pixels on the long side, social networks even more, and old scanned pictures are often saved at a small size.",
          ],
        },
        {
          heading: "How to get better photos",
          paragraphs: ["Ask people to send the original as a “file” or “document”, not as a “photo”. Scan paper photos at 600 dpi. Don’t enlarge photos in apps: it does not add pixels."],
        },
      ],
      faq: [
        ["How many dpi do I need to print a book?", "About 300 dpi for sharp printing. A photo can be used from 150 dpi, but below that the print is noticeably softer. The calculator shows the resolution for every place in the book."],
        ["Why do photos from WhatsApp print blurry?", "Messengers compress photos to roughly 1600 pixels on the long side. That is enough for a phone screen but too little for a book page. Ask for the original to be sent as a file or document."],
        ["Are my photos uploaded to a server?", "No. The check runs in your browser: sizes are read locally and photos are not sent anywhere."],
        ["What if the photo is small and I have no other?", "Put it in a smaller place: in a grid of four or on half a page. Fewer pixels are needed there, and the photo will print acceptably. A big full-page crop is not good for it."],
      ],
      cta: { title: "Build the book with your best photos", text: "The editor also gives resolution hints: it warns you if a photo will print unsharply. Writing the book is free." },
    },
  },
};

export const skolkoStranits: ToolDef = {
  slug: "skolko-stranits-v-knige",
  kind: "pages",
  theme: "love",
  content: {
    ru: {
      label: "Сколько страниц получится",
      h1: "Сколько страниц получится:",
      accent: "хватит ли материала на книгу",
      metaTitle: "Сколько страниц будет в книге: калькулятор объёма и толщины корешка",
      metaDescription: "Укажите, сколько ответов, фото и писем у вас будет, — калькулятор покажет число страниц книги, толщину корешка и подскажет, хватит ли материала. Тот же расчёт, что в нашем редакторе.",
      teaser: "Число страниц и толщина корешка по вашему материалу — и хватит ли его на полноценную книгу.",
      lead: "Сколько страниц выйдет из 20 ответов и десяти фото? Хватит ли материала, чтобы книга не получилась тонкой брошюрой? Укажите, сколько у вас будет ответов, фото и писем, — и узнайте объём. Расчёт тот же, что в редакторе книги.",
      sections: [
        {
          heading: "От чего зависит число страниц",
          paragraphs: [
            "Объём складывается из текста, фото и служебных страниц: титул, посвящение, оглавление, начало каждой главы. Больше всего влияют число и длина ответов: короткий ответ в несколько строк занимает треть страницы, развёрнутая история — полторы-две страницы.",
            "Фото в ответе или на отдельной странице добавляют полосы, письма близких собираются в отдельную главу. Квадратный формат вмещает чуть меньше текста на странице, чем A5.",
          ],
        },
        {
          heading: "Минимальный объём и корешок",
          paragraphs: [
            "Печатный блок не бывает тоньше 24 страниц, а число страниц всегда кратно четырём — так печатаются тетради. Если материала меньше, недостающие страницы остаются пустыми. Чтобы книга выглядела цельной, ориентируйтесь на 40 страниц и больше.",
            "Толщина корешка растёт вместе с объёмом: у книги в 100 страниц он около 10 мм. Цена книги от числа страниц не зависит.",
          ],
        },
        {
          heading: "Сколько ответов нужно для хорошей книги",
          paragraphs: ["Чаще всего хватает 30–40 содержательных ответов, нескольких писем близких и 10–20 фото. Это 2–3 вечера работы, если отвечать голосом: ответы можно надиктовывать, а не печатать."],
        },
      ],
      faq: [
        ["Сколько страниц в книге из 30 ответов?", "Зависит от длины ответов и числа фото. Для средних ответов (около 120 слов) и 10 фото получается примерно 40 страниц в формате A5. Точное число покажет калькулятор для ваших данных."],
        ["Какое минимальное число страниц в печатной книге?", "24 страницы. Если материала меньше, оставшиеся страницы печатаются пустыми. Число страниц всегда кратно четырём."],
        ["Влияет ли число страниц на цену?", "Нет. Цена книги зависит от формата (электронная или печатная) и числа экземпляров, но не от объёма."],
        ["Насколько точен расчёт?", "Это оценка тем же алгоритмом, что и в редакторе. Реальный объём зависит от текста и от того, как расставлены фото, но отличие обычно в пределах нескольких страниц."],
      ],
      cta: { title: "Проверьте на своей книге", text: "В редакторе число страниц обновляется, пока вы пишете. Писать книгу можно бесплатно." },
    },
    kk: {
      label: "Неше бет шығады",
      h1: "Неше бет шығады:",
      accent: "кітапқа материал жете ме",
      metaTitle: "Кітапта неше бет болады: көлем мен жон қалыңдығын есептегіш",
      metaDescription: "Қанша жауап, сурет және хат болатынын көрсетіңіз — есептегіш кітаптың бет санын, жон қалыңдығын көрсетіп, материал жететінін айтады. Біздің редактордағы сол есеп.",
      teaser: "Материалыңыз бойынша бет саны мен жон қалыңдығы — және толыққанды кітапқа жететіні.",
      lead: "20 жауап пен он суреттен неше бет шығады? Кітап жұқа брошюра болмауы үшін материал жете ме? Қанша жауап, сурет және хат болатынын көрсетіңіз — көлемді біліңіз. Есеп кітап редакторындағыдай.",
      sections: [
        {
          heading: "Бет саны неге байланысты",
          paragraphs: [
            "Көлем мәтіннен, суреттерден және қызметтік беттерден тұрады: титул, арнау, мазмұн, әр тараудың басы. Жауаптардың саны мен ұзындығы ең көп әсер етеді: бірнеше жолдық қысқа жауап беттің үштен бірін алады, толық әңгіме — бір жарым-екі бет.",
            "Жауаптағы немесе бөлек беттегі суреттер беттерді қосады, жақындардың хаттары жеке тарауға жиналады. Шаршы пішімге бір бетте A5-ке қарағанда сәл аз мәтін сыяды.",
          ],
        },
        {
          heading: "Ең аз көлем және жон",
          paragraphs: [
            "Басылған блок 24 беттен жұқа болмайды, ал бет саны әрқашан төртке еселі — дәптерлер солай басылады. Материал аз болса, жетпейтін беттер бос қалады. Кітап тұтас көріну үшін 40 бет және одан көп көлемге қараңыз.",
            "Жон қалыңдығы көлеммен бірге өседі: 100 беттік кітапта ол шамамен 10 мм. Кітап бағасы беттер санына байланысты емес.",
          ],
        },
        {
          heading: "Жақсы кітапқа қанша жауап керек",
          paragraphs: ["Көбіне 30–40 мазмұнды жауап, жақындардан бірнеше хат және 10–20 сурет жеткілікті. Бұл дауыспен жауап берсеңіз 2–3 кештік жұмыс: жауаптарды теріп емес, айтып жаздыруға болады."],
        },
      ],
      faq: [
        ["30 жауаптан тұратын кітапта неше бет болады?", "Жауаптардың ұзындығына және суреттер санына байланысты. Орташа жауаптар (шамамен 120 сөз) мен 10 сурет кезінде A5 пішімінде шамамен 40 бет шығады. Нақты санды есептегіш сіздің деректеріңіз үшін көрсетеді."],
        ["Басылған кітаптағы ең аз бет саны қанша?", "24 бет. Материал аз болса, қалған беттер бос басылады. Бет саны әрқашан төртке еселі."],
        ["Бет саны бағаға әсер ете ме?", "Жоқ. Кітап бағасы пішімге (электрондық немесе басылған) және даналар санына байланысты, көлемге емес."],
        ["Есеп қаншалықты дәл?", "Бұл редактордағы алгоритммен жасалған бағалау. Нақты көлем мәтінге және суреттердің орналасуына байланысты, бірақ айырмашылық көбіне бірнеше беттің ішінде."],
      ],
      cta: { title: "Өз кітабыңызда тексеріңіз", text: "Редакторда бет саны сіз жазған сайын жаңарады. Кітап жазу тегін." },
    },
    uz: {
      label: "Necha sahifa chiqadi",
      h1: "Necha sahifa chiqadi:",
      accent: "kitob uchun material yetadimi",
      metaTitle: "Kitobda necha sahifa bo‘ladi: hajm va yelka qalinligi kalkulyatori",
      metaDescription: "Javoblar, suratlar va xatlar sonini ko‘rsating — kalkulyator sahifalar sonini va yelka qalinligini ko‘rsatadi, material yetishini aytadi.",
      teaser: "Materialingizga ko‘ra sahifalar soni va yelka qalinligi — hamda u to‘laqonli kitobga yetadimi.",
      lead: "20 ta javob va o‘nta suratdan necha sahifa chiqadi? Kitob yupqa buklet bo‘lib qolmasligi uchun material yetadimi? Qancha javob, surat va xat bo‘lishini ko‘rsating — hajmni bilib oling. Hisob kitob muharriridagi bilan bir xil.",
      sections: [
        {
          heading: "Sahifalar soni nimaga bog‘liq",
          paragraphs: [
            "Hajm matn, suratlar va xizmat sahifalaridan iborat: titul, bag‘ishlov, mundarija, har bir bobning boshi. Eng ko‘p javoblar soni va uzunligi ta’sir qiladi: bir necha qatorli qisqa javob sahifaning uchdan birini egallaydi, batafsil hikoya — bir yarim-ikki sahifani.",
            "Javobdagi yoki alohida sahifadagi suratlar sahifalar qo‘shadi, yaqinlar xatlari esa alohida bobga yig‘iladi. Kvadrat format sahifaga A5 ga qaraganda biroz kamroq matn sig‘diradi.",
          ],
        },
        {
          heading: "Minimal hajm va kitob yelkasi",
          paragraphs: [
            "Bosma blok 24 sahifadan yupqa bo‘lmaydi, sahifalar soni esa har doim to‘rtga karrali — daftarlar shunday bosiladi. Material kamroq bo‘lsa, yetishmagan sahifalar bo‘sh qoladi. Kitob yaxlit ko‘rinishi uchun 40 va undan ko‘p sahifaga e’tibor bering.",
            "Yelka qalinligi hajm bilan birga o‘sadi: 100 sahifali kitobda u taxminan 10 mm. Kitob narxi sahifalar soniga bog‘liq emas.",
          ],
        },
        {
          heading: "Yaxshi kitob uchun nechta javob kerak",
          paragraphs: ["Ko‘pincha 30–40 ta mazmunli javob, yaqinlarning bir necha xati va 10–20 ta surat yetadi. Ovoz bilan javob bersangiz, bu 2–3 kechalik ish: javoblarni yozmasdan, aytib turish mumkin."],
        },
      ],
      faq: [
        ["30 ta javobdan iborat kitobda necha sahifa bo‘ladi?", "Javoblarning uzunligiga va suratlar soniga bog‘liq. O‘rtacha javoblar (taxminan 120 so‘z) va 10 ta surat bilan A5 formatida taxminan 40 sahifa chiqadi. Aniq sonni ma’lumotlaringiz uchun kalkulyator ko‘rsatadi."],
        ["Bosma kitobda minimal sahifalar soni qancha?", "24 sahifa. Material kamroq bo‘lsa, qolgan sahifalar bo‘sh bosiladi. Sahifalar soni har doim to‘rtga karrali."],
        ["Sahifalar soni narxga ta’sir qiladimi?", "Yo‘q. Kitob narxi formatga (elektron yoki bosma) va nusxalar soniga bog‘liq, hajmga emas."],
        ["Hisob qanchalik aniq?", "Bu muharrirdagi bilan bir xil algoritm bo‘yicha baho. Haqiqiy hajm matnga va suratlar qanday joylashtirilganiga bog‘liq, lekin farq odatda bir necha sahifa doirasida bo‘ladi."],
      ],
      cta: { title: "O‘z kitobingizda tekshirib ko‘ring", text: "Muharrirda siz yozayotganingizda sahifalar soni yangilanib turadi. Kitob yozish bepul." },
    },
    en: {
      label: "How many pages you’ll get",
      h1: "How many pages you’ll get:",
      accent: "is there enough material for a book",
      metaTitle: "How many pages a book will have: page count and spine thickness calculator",
      metaDescription: "Enter how many answers, photos and letters you will have — the calculator shows the book’s page count, the spine thickness and whether there is enough material. The same calculation as in our editor.",
      teaser: "The page count and spine thickness for your material — and whether it is enough for a full book.",
      lead: "How many pages will 20 answers and ten photos make? Is there enough material for the book not to end up a thin pamphlet? Enter how many answers, photos and letters you will have and find out the length. The calculation is the same as in the book editor.",
      sections: [
        {
          heading: "What the page count depends on",
          paragraphs: [
            "The length is made up of text, photos and service pages: the title page, the dedication, the contents, the start of each chapter. The number and length of the answers matter most: a short answer of a few lines takes a third of a page, a full story a page and a half to two.",
            "A photo in an answer or on its own page adds pages, and letters from loved ones are gathered into a separate chapter. The square format holds a little less text per page than A5.",
          ],
        },
        {
          heading: "Minimum length and spine",
          paragraphs: [
            "A printed block is never thinner than 24 pages, and the page count is always a multiple of four — that is how signatures are printed. If there is less material, the missing pages are left blank. For the book to look complete, aim for 40 pages or more.",
            "The spine grows thicker with the length: a book of 100 pages has a spine of about 10 mm. The price of the book does not depend on the page count.",
          ],
        },
        {
          heading: "How many answers a good book needs",
          paragraphs: ["Most often 30–40 meaningful answers, a few letters from loved ones and 10–20 photos are enough. That is 2–3 evenings of work if you answer by voice: answers can be dictated rather than typed."],
        },
      ],
      faq: [
        ["How many pages are in a book made of 30 answers?", "It depends on the length of the answers and the number of photos. For medium answers (about 120 words) and 10 photos you get roughly 40 pages in A5. The calculator will show the exact number for your data."],
        ["What is the minimum number of pages in a printed book?", "24 pages. If there is less material, the remaining pages are printed blank. The page count is always a multiple of four."],
        ["Does the page count affect the price?", "No. The price of the book depends on the format (digital or printed) and the number of copies, but not on the length."],
        ["How accurate is the calculation?", "It is an estimate made with the same algorithm as in the editor. The real length depends on the text and on how the photos are placed, but the difference is usually within a few pages."],
      ],
      cta: { title: "Check it on your own book", text: "In the editor the page count updates as you write. Writing the book is free." },
    },
  },
};

export const planKnigi: ToolDef = {
  slug: "plan-knigi-k-date",
  kind: "planner",
  theme: "love",
  landing: "podarok-na-godovshchinu",
  content: {
    ru: {
      label: "План книги к дате",
      h1: "План книги к дате:",
      accent: "что и когда сделать, чтобы успеть",
      metaTitle: "План книги-подарка к дате: что и когда сделать, календарь .ics",
      metaDescription: "Укажите день вручения — составим план: когда разослать просьбы о письмах, собрать фото, дописать ответы и заказать печать. Скачайте план в календарь телефона одним файлом.",
      teaser: "План по датам от сегодняшнего дня до вручения, с напоминаниями в календарь.",
      lead: "Книга-подарок — это не только печать, но и работа: ответы, фото, письма близких. Укажите день вручения и объём книги, и мы разложим дела по датам, посчитаем, сколько ответов писать в день, и скажем, успеете ли. План можно скачать в календарь.",
      sections: [
        {
          heading: "Как составляется план",
          paragraphs: [
            "Мы считаем от последнего дня заказа назад. Он зависит от срока производства печатной книги, доставки и дня на проверку макета. За ним идёт время на ответы, фото и письма близких.",
            "Если печатная книга к дате не успевает, калькулятор предложит экспресс-печать или электронную версию — её можно подарить в тот же день.",
          ],
        },
        {
          heading: "Сколько ответов писать в день",
          paragraphs: [
            "Короткая книга — около 15 ответов, обычная — около 30, большая — около 50. Расчёт показывает, сколько ответов в день нужно, чтобы уложиться в срок. До двух в день — спокойный темп, до пяти — рабочий, больше — стоит выбрать книгу поменьше или попросить родных ответить на часть вопросов.",
            "Письма близких собираются параллельно: отправьте ссылку в первый же день, чтобы у людей было время написать.",
          ],
        },
        {
          heading: "Календарь с напоминаниями",
          paragraphs: ["Кнопка «Скачать в календарь» создаёт файл .ics. Откройте его на телефоне или компьютере — события с напоминаниями в 9 утра появятся в Google Календаре, Apple Календаре или Outlook."],
        },
      ],
      faq: [
        ["За сколько дней нужно начинать книгу-подарок?", "Лучше за 3–4 недели до праздника: тогда хватит времени на ответы, письма близких и проверку макета. Если времени меньше, калькулятор подскажет, что делать."],
        ["Что делать, если до даты осталась неделя?", "Выберите короткую книгу и электронную версию: она приходит сразу после оплаты. Печатный экземпляр можно вручить позже. Калькулятор покажет подходящий вариант."],
        ["Как добавить план в календарь телефона?", "Нажмите «Скачать в календарь (.ics)» и откройте файл. На iPhone события добавятся в приложение «Календарь», на Android — в Google Календарь."],
        ["Зачем собирать письма близких?", "Они превращают книгу из личного подарка в подарок от всей семьи. Письмо пишется по ссылке с телефона, регистрация не нужна, а вы проверяете текст до печати."],
      ],
      cta: { title: "Начните прямо сейчас", text: "Первый шаг плана — начать книгу. Писать можно бесплатно и в своём темпе, а заказывать нужно только когда всё готово." },
    },
    kk: {
      label: "Күнге кітап жоспары",
      h1: "Күнге кітап жоспары:",
      accent: "үлгеру үшін не және қашан істеу керек",
      metaTitle: "Күнге сыйлық кітап жоспары: не және қашан істеу керек, .ics күнтізбесі",
      metaDescription: "Табыстау күнін көрсетіңіз — жоспар құрамыз: хат жазуға өтінішті қашан жіберу, суреттерді жинау, жауаптарды аяқтау және басып шығаруға тапсырыс беру. Жоспарды телефон күнтізбесіне бір файлмен жүктеңіз.",
      teaser: "Бүгіннен табыстау күніне дейінгі күндер бойынша жоспар, күнтізбеге ескертулермен.",
      lead: "Сыйлық кітап — тек басу емес, жұмыс та: жауаптар, суреттер, жақындардың хаттары. Табыстау күнін және кітап көлемін көрсетіңіз, біз істерді күндерге бөліп, күніне қанша жауап жазу керегін санап, үлгеретініңізді айтамыз. Жоспарды күнтізбеге жүктеуге болады.",
      sections: [
        {
          heading: "Жоспар қалай құрылады",
          paragraphs: [
            "Біз тапсырыс берудің соңғы күнінен кері санаймыз. Ол басылған кітаптың өндіріс мерзіміне, жеткізуге және макетті тексеруге бір күнге байланысты. Одан бұрын жауаптарға, суреттерге және жақындардың хаттарына уақыт келеді.",
            "Басылған кітап күнге үлгермесе, есептегіш жедел басып шығаруды немесе электрондық нұсқаны ұсынады — оны сол күні сыйлауға болады.",
          ],
        },
        {
          heading: "Күніне қанша жауап жазу керек",
          paragraphs: [
            "Қысқа кітап — шамамен 15 жауап, әдеттегі — шамамен 30, үлкен — шамамен 50. Есеп мерзімге сыю үшін күніне қанша жауап керегін көрсетеді. Күніне екіге дейін — тыныш қарқын, беске дейін — жұмыс қарқыны, одан көп болса кішірек кітап таңдаған немесе туыстардан кейбір сұрақтарға жауап беруін сұраған жөн.",
            "Жақындардың хаттары қатар жиналады: адамдарға жазуға уақыт болуы үшін сілтемені бірінші күні жіберіңіз.",
          ],
        },
        {
          heading: "Ескертулері бар күнтізбе",
          paragraphs: ["«Күнтізбеге жүктеу» батырмасы .ics файлын жасайды. Оны телефонда немесе компьютерде ашыңыз — таңғы 9-дағы ескертулері бар оқиғалар Google Күнтізбесінде, Apple Күнтізбесінде немесе Outlook-та пайда болады."],
        },
      ],
      faq: [
        ["Сыйлық кітапты неше күн бұрын бастау керек?", "Мерекеге 3–4 апта қалғанда жақсы: сонда жауаптарға, жақындардың хаттарына және макетті тексеруге уақыт жетеді. Уақыт аз болса, есептегіш не істеу керегін айтады."],
        ["Күнге бір апта қалса не істеу керек?", "Қысқа кітапты және электрондық нұсқаны таңдаңыз: ол төлемнен кейін бірден келеді. Басылған данасын кейін табыстауға болады. Есептегіш қолайлы нұсқаны көрсетеді."],
        ["Жоспарды телефон күнтізбесіне қалай қосуға болады?", "«Күнтізбеге жүктеу (.ics)» батырмасын басып, файлды ашыңыз. iPhone-да оқиғалар «Күнтізбе» қосымшасына, Android-та Google Күнтізбесіне қосылады."],
        ["Жақындардың хаттарын неге жинау керек?", "Олар кітапты жеке сыйлықтан бүкіл отбасынан сыйлыққа айналдырады. Хат сілтеме арқылы телефоннан жазылады, тіркелу керек емес, ал сіз мәтінді басар алдында тексересіз."],
      ],
      cta: { title: "Дәл қазір бастаңыз", text: "Жоспардың бірінші қадамы — кітапты бастау. Жазу тегін және өз қарқыныңызбен, ал тапсырыс бәрі дайын болғанда ғана беріледі." },
    },
    uz: {
      label: "Sanaga kitob rejasi",
      h1: "Sanaga kitob rejasi:",
      accent: "ulgurish uchun nima va qachon qilish kerak",
      metaTitle: "Sanaga sovg‘a kitob rejasi: nima va qachon qilish kerak, .ics kalendar",
      metaDescription: "Topshirish kunini ko‘rsating — reja tuzamiz: xatlar so‘rovi, suratlar, javoblar va bosmaga buyurtma qachon. Rejani kalendarga yuklab oling.",
      teaser: "Bugundan topshirishgacha sanalar bo‘yicha reja, kalendarga eslatmalar bilan.",
      lead: "Sovg‘a kitob — bu faqat bosma emas, ish ham: javoblar, suratlar, yaqinlar xatlari. Topshirish kunini va kitob hajmini ko‘rsating, biz ishlarni sanalar bo‘yicha taqsimlaymiz, kuniga nechta javob yozish kerakligini hisoblaymiz va ulgurishingizni aytamiz. Rejani kalendarga yuklab olish mumkin.",
      sections: [
        {
          heading: "Reja qanday tuziladi",
          paragraphs: [
            "Biz buyurtmaning oxirgi kunidan orqaga qarab hisoblaymiz. U bosma kitobni tayyorlash muddatiga, yetkazib berishga va maketni tekshirish uchun bir kunga bog‘liq. Undan oldin javoblar, suratlar va yaqinlar xatlari uchun vaqt turadi.",
            "Bosma kitob sanaga ulgurmasa, kalkulyator tezkor bosmani yoki elektron nusxani taklif qiladi — uni o‘sha kuni sovg‘a qilish mumkin.",
          ],
        },
        {
          heading: "Kuniga nechta javob yozish kerak",
          paragraphs: [
            "Qisqa kitob — taxminan 15 ta javob, odatiy — taxminan 30, katta — taxminan 50. Hisob muddatga ulgurish uchun kuniga nechta javob kerakligini ko‘rsatadi. Kuniga ikkitagacha — xotirjam sur’at, beshtagacha — ish tartibi, undan ko‘p bo‘lsa — kichikroq kitobni tanlash yoki savollarning bir qismiga yaqinlaringizdan javob berishni so‘rash maqsadga muvofiq.",
            "Yaqinlar xatlari parallel yig‘iladi: havolani birinchi kunning o‘zidayoq yuboring, odamlarda yozishga vaqt bo‘lsin.",
          ],
        },
        {
          heading: "Eslatmali kalendar",
          paragraphs: ["«Kalendarga yuklab olish» tugmasi .ics faylini yaratadi. Uni telefonda yoki kompyuterda oching — ertalab soat 9 dagi eslatmali tadbirlar Google Kalendar, Apple Kalendar yoki Outlook’da paydo bo‘ladi."],
        },
      ],
      faq: [
        ["Sovg‘a kitobni necha kun oldin boshlash kerak?", "Bayramdan 3–4 hafta oldin yaxshiroq: shunda javoblar, yaqinlar xatlari va maketni tekshirish uchun vaqt yetadi. Vaqt kamroq bo‘lsa, kalkulyator nima qilishni aytadi."],
        ["Sanaga bir hafta qolgan bo‘lsa, nima qilish kerak?", "Qisqa kitobni va elektron nusxani tanlang: u to‘lovdan keyin darhol keladi. Bosma nusxani keyinroq topshirish mumkin. Mos variantni kalkulyator ko‘rsatadi."],
        ["Rejani telefon kalendariga qanday qo‘shaman?", "«Kalendarga yuklab olish (.ics)» tugmasini bosing va faylni oching. iPhone’da tadbirlar «Kalendar» ilovasiga, Android’da Google Kalendar’ga qo‘shiladi."],
        ["Yaqinlar xatlarini nima uchun yig‘ish kerak?", "Ular kitobni shaxsiy sovg‘adan butun oiladan sovg‘aga aylantiradi. Xat telefondan havola orqali yoziladi, ro‘yxatdan o‘tish shart emas, matnni esa bosmadan oldin siz tekshirasiz."],
      ],
      cta: { title: "Hoziroq boshlang", text: "Rejaning birinchi qadami — kitobni boshlash. Yozish bepul va o‘z tezligingizda, buyurtma esa hammasi tayyor bo‘lgandagina kerak." },
    },
    en: {
      label: "Book plan for a date",
      h1: "Book plan for a date:",
      accent: "what to do and when, to be in time",
      metaTitle: "Gift book plan for a date: what to do and when, .ics calendar",
      metaDescription: "Enter the day you will give the book and we will make a plan: when to ask for letters, collect photos, finish the answers and order printing. Download it to your phone calendar.",
      teaser: "A plan by dates from today to the day you give the book, with calendar reminders.",
      lead: "A gift book is not only printing but also work: answers, photos, letters from loved ones. Enter the day you will give it and the size of the book, and we will spread the tasks across dates, work out how many answers to write a day and tell you whether you will make it. You can download the plan to your calendar.",
      sections: [
        {
          heading: "How the plan is made",
          paragraphs: [
            "We count backwards from the last day to order. It depends on the production time of the printed book, delivery and a day for checking the layout. Before that comes the time for the answers, photos and letters from loved ones.",
            "If the printed book won’t make it by the date, the calculator suggests express printing or the digital copy — you can give that on the same day.",
          ],
        },
        {
          heading: "How many answers to write a day",
          paragraphs: [
            "A short book is about 15 answers, a regular one about 30, a big one about 50. The calculation shows how many answers a day you need to meet the deadline. Up to two a day is a relaxed pace, up to five is workable, more than that — consider a smaller book or ask relatives to answer some of the questions.",
            "Letters from loved ones are gathered in parallel: send the link on the very first day so that people have time to write.",
          ],
        },
        {
          heading: "A calendar with reminders",
          paragraphs: ["The “Download to calendar” button creates an .ics file. Open it on your phone or computer — events with reminders at 9 a.m. appear in Google Calendar, Apple Calendar or Outlook."],
        },
      ],
      faq: [
        ["How many days ahead should I start a gift book?", "It is best 3–4 weeks before the holiday: then there is enough time for the answers, letters from loved ones and checking the layout. If you have less time, the calculator will tell you what to do."],
        ["What if there is only a week left until the date?", "Choose a short book and the digital copy: it arrives right after payment. You can hand over the printed copy later. The calculator will show a suitable option."],
        ["How do I add the plan to my phone calendar?", "Press “Download to calendar (.ics)” and open the file. On an iPhone the events are added to the Calendar app, on Android to Google Calendar."],
        ["Why collect letters from loved ones?", "They turn the book from a personal gift into a gift from the whole family. A letter is written from a phone via a link, no sign-up is needed, and you check the text before printing."],
      ],
      cta: { title: "Start right now", text: "The first step of the plan is to start the book. Writing is free and at your own pace, and you only order when everything is ready." },
    },
  },
};

export const shezhire: ToolDef = {
  slug: "shezhire-zheti-ata",
  kind: "shezhire",
  theme: "autobiography",
  landing: "kniga-o-svoej-zhizni",
  content: {
    ru: {
      label: "Шежіре: родословная до 7 колена",
      h1: "Шежіре и жеті ата:",
      accent: "родословная до седьмого колена",
      metaTitle: "Шежіре онлайн: родословная до 7 колена (жеті ата) — составить и распечатать",
      metaDescription: "Составьте шежіре: впишите предков по линии отца и матери до седьмого колена, увидите родословное древо и распечатаете лист. Данные хранятся только в вашем браузере. Бесплатно.",
      teaser: "Впишите предков до седьмого колена, получите родословное древо и лист для печати.",
      lead: "Знать семь поколений предков — старая казахская традиция. Впишите имена отца, деда, прадеда и дальше по линии отца и по линии матери. Мы построим родословную, подскажем, у кого спросить недостающее, и вы сможете распечатать лист. Данные остаются в вашем браузере.",
      sections: [
        {
          heading: "Что такое жеті ата",
          paragraphs: [
            "Жеті ата, «семь отцов», — традиция помнить своих предков по мужской линии до седьмого колена: отца, деда, прадеда и дальше. По старому обычаю казахи не вступали в брак с теми, кто связан родством до седьмого колена, и потому знание родословной было практической необходимостью.",
            "Родословную, записанную в роды и колена, называют шежіре. Она включает не только отцовскую линию: многие семьи помнят и предков по матери, нағашы жұрты.",
          ],
        },
        {
          heading: "Как собрать родословную",
          paragraphs: [
            "Начните с того, что известно вам: отец, дед. Затем расспросите старших родственников — братьев и сестёр деда, аксакалов рода. Записывайте имена, годы жизни и место, откуда был человек: это поможет не перепутать тёзок.",
            "Для глубоких колен ищите шежіре рода, семейные документы, районные архивы. Если седьмое колено остаётся неизвестным, это нормально: многие семьи знают три-четыре поколения.",
          ],
        },
        {
          heading: "Что делать с родословной дальше",
          paragraphs: ["Лист для печати можно повесить в рамке или раздать родным. А если хочется сохранить не только имена, но и истории предков, соберите их в книгу: в главе «Мои корни» вы расскажете о роде, о том, откуда пришла семья, и о тех, кого помнят старшие."],
        },
      ],
      faq: [
        ["Что такое жеті ата?", "Это традиция знать семь поколений предков по отцовской линии: отца, деда, прадеда и далее до седьмого колена. Она сохранилась в казахских семьях как память о роде."],
        ["Что такое шежіре?", "Шежіре — родословная, записанная по родам и коленям. Бывает устной и письменной. Составить свою семейную можно самостоятельно: достаточно имён, годов жизни и места."],
        ["Как узнать предков до седьмого колена?", "Начните с расспросов старших родственников и семейных документов, затем обратитесь к аксакалам рода и в районные архивы. Для далёких колен часто нужны шежіре рода."],
        ["Сохраняются ли мои данные?", "Только в вашем браузере, на этом устройстве. Мы ничего не отправляем на сервер. Чтобы не потерять родословную, распечатайте лист или скопируйте текстом."],
      ],
      cta: { title: "Сохраните истории своего рода в книге", text: "Книга о жизни — это вопросы о роде, детстве и семье и ваши старые фотографии. Писать можно бесплатно." },
    },
    kk: {
      label: "Шежіре: жеті атаға дейін",
      h1: "Шежіре және жеті ата:",
      accent: "жетінші буынға дейінгі ата-тек",
      metaTitle: "Шежіре онлайн: жеті атаға дейінгі ата-тек — құру және басып шығару",
      metaDescription: "Шежіре құрыңыз: әке және ана желісі бойынша жеті атаға дейін бабаларды жазыңыз, шежіре ағашын көресіз және парақты басып шығарасыз. Деректер тек браузеріңізде сақталады. Тегін.",
      teaser: "Жеті атаға дейін бабаларды жазыңыз, шежіре ағашын және басып шығаруға парақ алыңыз.",
      lead: "Жеті ата тарихын білу — көне қазақ дәстүрі. Әке, ата, баба және одан әрі әке желісі мен ана желісі бойынша аттарды жазыңыз. Біз шежіре құрып, жетпейтінін кімнен сұрау керегін айтамыз, ал сіз парақты басып шығара аласыз. Деректер браузеріңізде қалады.",
      sections: [
        {
          heading: "Жеті ата дегеніміз не",
          paragraphs: [
            "Жеті ата — ер адам желісі бойынша жетінші буынға дейінгі бабаларды: әке, ата, баба және одан әрі есте сақтау дәстүрі. Көне әдет бойынша қазақтар жетінші буынға дейін туыс адамдармен некеге тұрмаған, сондықтан шежірені білу практикалық қажеттілік болған.",
            "Ру мен буынға жазылған ата-тек шежіре деп аталады. Ол тек әке желісін қамтымайды: көп отбасылар ана жағындағы бабаларды, нағашы жұртын да есте сақтайды.",
          ],
        },
        {
          heading: "Шежіре қалай жинауға болады",
          paragraphs: [
            "Өзіңіз білетіннен бастаңыз: әке, ата. Одан кейін үлкен туыстардан — атаның аға-інілері мен апа-қарындастарынан, ру ақсақалдарынан сұраңыз. Аттарды, өмір сүрген жылдарын және адам қайдан екенін жазыңыз: бұл аттастарды шатастырмауға көмектеседі.",
            "Терең буындар үшін рудың шежіресін, отбасылық құжаттарды, аудандық мұрағаттарды іздеңіз. Жетінші буын белгісіз қалса, бұл қалыпты жағдай: көп отбасылар үш-төрт ұрпақты біледі.",
          ],
        },
        {
          heading: "Шежіреден кейін не істеу керек",
          paragraphs: ["Басып шығаруға арналған парақты жақтауға салып іліп қоюға немесе туыстарға таратуға болады. Ал тек аттарды емес, бабалардың әңгімелерін де сақтағыңыз келсе, оларды кітапқа жинаңыз: «Менің тамырларым» тарауында руыңыз, отбасының қайдан келгені және үлкендер еске алатындар туралы айтасыз."],
        },
      ],
      faq: [
        ["Жеті ата дегеніміз не?", "Бұл әке желісі бойынша жеті ұрпаққа дейінгі бабаларды: әке, ата, баба және одан әрі жетінші буынға дейін білу дәстүрі. Ол қазақ отбасыларында рудың есі ретінде сақталған."],
        ["Шежіре дегеніміз не?", "Шежіре — ру мен буын бойынша жазылған ата-тек. Ауызша да, жазбаша да болады. Өз отбасыңызды өзіңіз құра аласыз: аттар, өмір сүрген жылдар және жер жеткілікті."],
        ["Жетінші буынға дейін бабаларды қалай білуге болады?", "Үлкен туыстарынан сұраудан және отбасылық құжаттардан бастаңыз, содан кейін ру ақсақалдарына және аудандық мұрағаттарға жүгініңіз. Алыс буындар үшін көбіне рудың шежіресі керек."],
        ["Менің деректерім сақтала ма?", "Тек браузеріңізде, осы құрылғыда. Біз серверге ештеңе жібермейміз. Шежіреңізді жоғалтпау үшін парақты басып шығарыңыз немесе мәтін ретінде көшіріңіз."],
      ],
      cta: { title: "Руыңыздың әңгімелерін кітапта сақтаңыз", text: "Өмір туралы кітап — ру, балалық және отбасы туралы сұрақтар мен ескі суреттеріңіз. Жазу тегін." },
    },
    uz: {
      label: "Shajara: yetti avlodgacha nasab",
      h1: "Shajara va yetti ota:",
      accent: "yettinchi avlodgacha nasabnoma",
      metaTitle: "Shajara onlayn: yetti avlodgacha nasab — tuzish va chop etish",
      metaDescription: "Shajara tuzing: ota va ona tomondan ajdodlarni yettinchi avlodgacha kiriting, nasab daraxtini ko‘ring va varaqni chop eting. Ma’lumotlar faqat brauzerda. Bepul.",
      teaser: "Ajdodlarni yettinchi avlodgacha kiriting, nasab daraxti va chop etish uchun varaq oling.",
      lead: "Yetti avlod ajdodni bilish — qadimiy qozoq an’anasi. Otangiz, bobongiz, buvangiz va undan keyingilarning ismlarini ota va ona tomondan kiriting. Biz nasabnomani tuzamiz, yetishmayotganini kimdan so‘rashni aytamiz va varaqni chop etishingiz mumkin. Ma’lumotlar brauzeringizda qoladi.",
      sections: [
        {
          heading: "Yetti ota nima",
          paragraphs: [
            "Yetti ota — erkaklar chizig‘i bo‘yicha ajdodlarni yettinchi avlodgacha: ota, bobo, katta bobo va undan keyingilarni eslab qolish an’anasi. Qadimiy odatga ko‘ra, qozoqlar yettinchi avlodgacha qarindosh bo‘lganlar bilan nikohlanmagan, shuning uchun nasabni bilish amaliy zarurat edi.",
            "Urug‘lar va avlodlar bo‘yicha yozilgan nasabnoma shajara deb ataladi. U faqat ota chizig‘ini emas, ko‘plab oilalar ona tomondagi ajdodlarni — nog‘ashi urug‘ini ham eslab qoladi.",
          ],
        },
        {
          heading: "Nasabnomani qanday yig‘ish mumkin",
          paragraphs: [
            "O‘zingiz biladigan narsadan boshlang: ota, bobo. Keyin katta qarindoshlardan so‘rang — bobongizning aka-ukalari va opa-singillaridan, urug‘ oqsoqollaridan. Ismlarni, hayot yillarini va odam qayerlik ekanini yozib boring: bu ismdoshlarni adashtirmaslikka yordam beradi.",
            "Chuqur avlodlar uchun urug‘ shajarasini, oilaviy hujjatlarni, tuman arxivlarini qidiring. Yettinchi avlod noma’lum qolsa, bu tabiiy: ko‘pchilik oilalar uch-to‘rt avlodni biladi.",
          ],
        },
        {
          heading: "Nasabnoma bilan keyin nima qilish kerak",
          paragraphs: ["Chop etish uchun varaqni ramkaga solib osib qo‘yish yoki yaqinlarga tarqatish mumkin. Faqat ismlarni emas, ajdodlar hikoyalarini ham saqlagingiz kelsa, ularni kitobga yig‘ing: «Mening ildizlarim» bobida urug‘ haqida, oila qayerdan kelgani va kattalar eslaydigan insonlar haqida hikoya qilasiz."],
        },
      ],
      faq: [
        ["Yetti ota nima?", "Bu otalik chizig‘i bo‘yicha yetti avlod ajdodni bilish an’anasi: ota, bobo, katta bobo va undan keyin yettinchi avlodgacha. U qozoq oilalarida urug‘ xotirasi sifatida saqlanib qolgan."],
        ["Shajara nima?", "Shajara — urug‘lar va avlodlar bo‘yicha yozilgan nasabnoma. Og‘zaki va yozma bo‘ladi. O‘z oilaviy shajarangizni mustaqil tuzish mumkin: ismlar, hayot yillari va joy yetarli."],
        ["Yettinchi avlodgacha ajdodlarni qanday bilsa bo‘ladi?", "Katta qarindoshlardan so‘rash va oilaviy hujjatlardan boshlang, so‘ng urug‘ oqsoqollariga va tuman arxivlariga murojaat qiling. Uzoq avlodlar uchun ko‘pincha urug‘ shajaralari kerak bo‘ladi."],
        ["Ma’lumotlarim saqlanadimi?", "Faqat brauzeringizda, shu qurilmada. Biz hech narsani serverga yubormaymiz. Nasabnomani yo‘qotmaslik uchun varaqni chop eting yoki matn qilib nusxalab oling."],
      ],
      cta: { title: "Urug‘ingiz hikoyalarini kitobda saqlang", text: "Hayot haqidagi kitob — urug‘, bolalik va oila haqidagi savollar hamda eski suratlaringiz. Yozish bepul." },
    },
    en: {
      label: "Shezhire: family tree to the 7th generation",
      h1: "Shezhire and zheti ata:",
      accent: "a family tree to the seventh generation",
      metaTitle: "Shezhire online: a family tree to 7 generations (zheti ata) — make and print",
      metaDescription: "Make your shezhire: enter your ancestors on your father’s and mother’s sides up to the seventh generation, see the family tree and print the sheet. Data is kept only in your browser. Free.",
      teaser: "Enter your ancestors up to the seventh generation, get a family tree and a sheet to print.",
      lead: "Knowing seven generations of ancestors is an old Kazakh tradition. Enter the names of your father, grandfather, great-grandfather and on, along your father’s line and your mother’s line. We will build the family tree, suggest whom to ask for what is missing, and you can print the sheet. Your data stays in your browser.",
      sections: [
        {
          heading: "What zheti ata is",
          paragraphs: [
            "Zheti ata, “seven fathers”, is the tradition of remembering your ancestors on the male line up to the seventh generation: father, grandfather, great-grandfather and on. By old custom Kazakhs did not marry anyone related to them up to the seventh generation, so knowing one’s lineage was a practical necessity.",
            "A lineage written down by clans and generations is called a shezhire. It includes not only the father’s line: many families also remember their ancestors on the mother’s side, the nagashy zhurty.",
          ],
        },
        {
          heading: "How to put your family tree together",
          paragraphs: [
            "Start with what you know: your father, your grandfather. Then ask older relatives — your grandfather’s brothers and sisters, the elders of the clan. Write down names, years of life and the place the person came from: it helps you avoid mixing up namesakes.",
            "For the deeper generations, look for the clan’s shezhire, family documents and district archives. If the seventh generation stays unknown, that is normal: many families know three or four generations.",
          ],
        },
        {
          heading: "What to do with the family tree next",
          paragraphs: ["The printable sheet can be hung in a frame or handed out to relatives. And if you want to keep not only the names but the stories of your ancestors, gather them in a book: in the “My roots” chapter you will tell about your clan, where the family came from, and those the elders remember."],
        },
      ],
      faq: [
        ["What is zheti ata?", "It is the tradition of knowing seven generations of ancestors on the father’s line: father, grandfather, great-grandfather and on to the seventh generation. It has been kept in Kazakh families as a memory of the clan."],
        ["What is a shezhire?", "A shezhire is a lineage written down by clans and generations. It can be oral or written. You can make your own family one: names, years of life and place are enough."],
        ["How do I find out my ancestors to the seventh generation?", "Start by asking older relatives and looking at family documents, then turn to the elders of the clan and district archives. For distant generations you often need the clan’s shezhire."],
        ["Is my data saved?", "Only in your browser, on this device. We send nothing to a server. To keep your family tree safe, print the sheet or copy it as text."],
      ],
      cta: { title: "Keep your family’s stories in a book", text: "A book about your life is questions about your clan, childhood and family, plus your old photographs. Writing is free." },
    },
  },
};
