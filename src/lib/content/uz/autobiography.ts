import type { ChapterDef } from "../types";

// Автобиография на узбекском (латиница): вопрос — к рассказчику на «siz», заголовок в книге — от первого лица.
// Рода в узбекском нет: маркеры {..|..} убраны. [..|..] не используются: получателя у автобиографии нет.
// Ключи глав, число вопросов, места эпиграфов и подсказок — как в русском банке (tests/content.test.ts).
// Эпиграфы — народные пословицы (как в русском банке) или собственные строки.

export const autobiographyChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "So‘z boshi o‘rnida",
    epigraph: "Har bir hayot — bir kitob. Bu — meniki.",
    questions: [
      [
        "O‘zingizni evaralaringizga tanishtirgandek tanishtiring: ismingiz nima, qayerlik ekansiz, bugun siz kimsiz?",
        "Men kimman",
        "Agar yaqin odamingiz — onangiz yoki bobongiz uchun yozayotgan bo‘lsangiz, uning o‘z so‘zlari bilan, birinchi shaxsdan yozing: «Men tug‘ilganman…», «Otam…». Hikoyachining suyukli so‘zlarini saqlang — shunda kitob uning ovozida jaranglaydi.",
      ],
      ["Nega hayotingiz hikoyasini aytib berishga qaror qildingiz va uni kimga qoldirmoqchisiz?", "Bu kitob kim uchun"],
      ["O‘zingizni uchta so‘z bilan ta’riflang. Yaqinlaringiz sizni qaysi uchta so‘z bilan ta’riflashardi?", "Men uch so‘zda"],
      [
        "Ismingizni kim qo‘ygan va u nimani anglatadi? Uyda sizni qanday chaqirishardi, do‘stlaringiz-chi?",
        "Mening ismim",
        "Sizga kimning nomi berilgan, kattalardan kim ism tanlagan, keyinchalik qanday erkalash laqablari paydo bo‘lgan.",
      ],
      [
        "Hayotingizni besh daqiqada aytib berish kerak bo‘lsa, avvalo qaysi voqealarni aytgan bo‘lardingiz?",
        "Eng muhimi — qisqacha",
      ],
    ],
  },
  {
    key: "roots",
    title: "Ildizlarim",
    epigraph: "Yetti ota-bobosini bilmagan odam — ildizsiz.",
    questions: [
      [
        "Urug‘-avlodingiz haqida nimalarni bilasiz? Qaysi ajdodlaringizni ismi bilan ayta olasiz — ehtimol, shajaradagidek yettinchi bo‘g‘ingacha?",
        "Mening urug‘im",
        "O‘zingizdan boshlab orqaga yuring: ota, bobo, katta bobo. Ular qayerda yashagan, nima ish qilgan, qaysi urug‘dan. Bo‘sh joylar qo‘rqinchli emas — ularni yaqinlaringiz to‘ldirishi mumkin.",
      ],
      [
        "Bobo va buvilaringiz haqida gapirib bering: ismlari nima edi, qayerda yashashgan, ularni qanday eslaysiz?",
        "Bobo va buvilarim",
        "Qozoq oilalarida to‘ng‘ich farzandni ko‘pincha bobo va buvi katta qilgan. Sizni ham ular tarbiyalagan bo‘lsa, ularning uyida hayot qanday kechganini aytib bering.",
      ],
      [
        "Oilangiz siz tug‘ilgan o‘lkalarga qanday kelib qolgan? Ajdodlaringiz qayerdan kelgan?",
        "Biz qayerdanmiz",
        "Ko‘chmanchilik, ko‘chib borishlar, ochilgan yerlar, urush paytidagi evakuatsiya, o‘qishdan keyingi yo‘llanma — har bir oilaning o‘z yo‘li bor.",
      ],
      ["Otangiz haqida gapirib bering: u qanday inson edi, nima ish qilardi, sizga eng ko‘p nimasi bilan esda qolgan?", "Otam"],
      ["Onangiz haqida gapirib bering: u qanday edi, nimalarga qodir edi, uning qaysi so‘zlarini hanuz eslaysiz?", "Onam"],
      ["Oilangizda ajdodlar haqida og‘izdan og‘izga qanday hikoyalar o‘tib kelgan?", "Oilaviy rivoyatlar"],
    ],
  },
  {
    key: "childhood",
    title: "Bolalik",
    epigraph: "Uyada nimani ko‘rsang, uchganda shuni tutasan.",
    questions: [
      [
        "Qayerda va qachon tug‘ilgansiz? Dunyoga kelgan kuningiz haqida oilada nima deyishardi?",
        "Men qayerda tug‘ilganman",
        "Shahar yoki qishloq, yil, fasl, sizni birinchi bo‘lib kim qo‘lga olgani — oilaviy xotira saqlab qolgan hamma narsa.",
      ],
      [
        "Bolaligingiz o‘tgan uyni tasvirlab bering: hidlari, tovushlari, deraza oldidan ko‘rinishi.",
        "Bolaligim uyi",
        "Uni xayolan aylanib chiqing: hovli, o‘choq, oshxona, burchakdagi sandiq, dasturxon yoziladigan joy.",
      ],
      ["Eng ilk xotirangiz qanday? O‘shanda necha yoshda edingiz va yoningizda kim bor edi?", "Mening birinchi xotiram"],
      [
        "Bolaligingizda nima o‘ynardingiz va kim bilan? Hovlida yoki ko‘chada qaysi o‘yin eng suyukli edi?",
        "Bolalik o‘yinlarim",
        "Oshiq o‘yini, lapta, «klassik», berkinmachoq, «kazak-qaroqchi» — va o‘zingiz o‘ylab topgan o‘yinlar.",
      ],
      [
        "Bolaligingizda uyda qanday vazifalaringiz bor edi? Sizni yoshligingizdan nimaga o‘rgatishgan?",
        "Bolalikdagi vazifalarim",
        "Qo‘zilarni boqish, suv tashish, kichiklarga qarash, poliz o‘tash, non uchun navbatda turish.",
      ],
      ["Bolalikdagi qaysi taomning ta’mini bugun ham eslaysiz? Uni kim pishirgan va qanday munosabat bilan?", "Bolalik ta’mi"],
      [
        "Siz qanday bola edingiz — tinchmi, shodmi, xayolparastmi? Bolaligingiz haqida oilada hozirgacha qanday voqea aytib yurishadi?",
        "Bolaligimda qanday edim",
      ],
    ],
  },
  {
    key: "school",
    title: "Maktab yillari",
    questions: [
      ["Maktabdagi birinchi kuningizni eslaysizmi? Sizni kim olib borgan, nima kiygan edingiz, qo‘lingizda nima bor edi?", "Maktabdagi birinchi kunim"],
      [
        "Siz qanday o‘quvchi edingiz? Qaysi fanlar oson berilardi, qaysilari qiyin?",
        "Men qanday o‘quvchi edim",
      ],
      ["O‘qituvchilardan qaysi biri sizga eng ko‘p ta’sir qilgan? U nimasi bilan esingizda qolgan?", "Esimda qolgan o‘qituvchi"],
      ["Maktabda kimlar bilan do‘st edingiz? Darsdan keyin birga nima qilardingiz?", "Maktab do‘stlarim"],
      [
        "Qaysi maktab voqeasini hozirgacha tabassum bilan eslaysiz?",
        "Maktab voqeasi",
        "Dars paytidagi sho‘xlik, sayohat, metall yig‘ish, saflanish, bitiruv kechasi — birinchi bo‘lib nima esga tushadi.",
      ],
      [
        "Yozgi ta’tilni qayerda va qanday o‘tkazardingiz?",
        "Yozgi ta’til",
        "Qishloqdagi buvingizning uyida, pioner lagerida, yaylovda, do‘stlar bilan daryo bo‘yida — yozingiz qanday o‘tardi?",
      ],
    ],
  },
  {
    key: "youth",
    title: "Yoshlik",
    questions: [
      ["Yoshligingizda nimani orzu qilardingiz? Kim bo‘lishni xohlardingiz — va bu amalga oshdimi?", "Men nimani orzu qilardim"],
      [
        "Maktabdan keyin nima qilishga qaror qildingiz va bu tanlovga qanday keldingiz? Kim yordam berdi, kim qaytardi?",
        "Maktabdan keyingi tanlovim",
        "Institut, texnikum, bilim yurti, harbiy xizmat, maktabdan so‘ng darrov ish — hammasi qanday hal bo‘lganini aytib bering.",
      ],
      ["O‘zingizni birinchi marta katta odamdek qachon his qildingiz? O‘shanda nima bo‘ldi?", "Men qachon katta bo‘ldim"],
      [
        "Yoshligingizda bo‘sh vaqtingizni qanday o‘tkazardingiz? Qayerlarga borardingiz, nima tinglardingiz, qanday kiyinardingiz?",
        "Biz qanday dam olardik",
        "Raqslar, kino, gitara jo‘rligidagi qo‘shiqlar, topish qiyin bo‘lgan modali buyum — o‘sha davr ruhini beradigan hamma narsa.",
      ],
      ["Yoshlik do‘stlaringiz kimlar edi? Birga boshdan kechirgan bir voqeani gapirib bering.", "Yoshlik do‘stlarim"],
      ["Yoshligingizda qilgan eng jasur yoki o‘ylamay qilingan ishingiz qanday?", "Mening eng jasur qilgan ishim"],
    ],
  },
  {
    key: "work",
    title: "Hayotim ishi",
    epigraph: "Mehnat qilsang — to‘q bo‘lasan.",
    questions: [
      [
        "Qayerda va kim bo‘lib ishlay boshlagansiz? Birinchi ish kuningiz va birinchi maoshingizni eslaysizmi?",
        "Mening birinchi ishim",
        "Birinchi pulga nima oldingiz, kimga sovg‘a qildingiz, qanday nishonladingiz.",
      ],
      ["Hayotingizning ko‘p qismida nima bilan shug‘ullandingiz? Ishingiz haqida nevarangiz tushunadigan qilib gapirib bering.", "Mening ishim"],
      ["Sizni haqiqiy ishlashga kim o‘rgatgan? Bu odamdan nimani o‘rgandingiz?", "Mening ustozim"],
      ["Ishdagi qaysi ishingiz yoki yutug‘ingiz bilan eng ko‘p faxrlanasiz?", "Nimadan faxrlanaman"],
      [
        "Birga ishlash eng yoqimli bo‘lgan odamlar haqida gapirib bering. Ish hayotidan qaysi voqeani ko‘proq eslaysiz?",
        "Birga ishlagan odamlarim",
      ],
      ["Hamma narsani boshidan boshlashga to‘g‘ri kelganmi — kasb, joy, ishni almashtirishga? Bu qanday bo‘ldi?", "Qaytadan boshlash"],
    ],
  },
  {
    key: "love",
    title: "Muhabbat",
    questions: [
      ["Birinchi muhabbatingiz haqida gapirib bering. Bu tuyg‘u qanday edi va hammasi nima bilan tugadi?", "Birinchi muhabbat"],
      [
        "Turmush o‘rtog‘ingiz bilan qanday tanishgansiz? O‘sha kunni tasvirlab bering.",
        "Biz qanday tanishdik",
        "Bu qayerda bo‘lgan, sizni kim tanishtirgan, ikkovingiz nima kiygan edingiz, birinchi daqiqada nima deb o‘yladingiz.",
      ],
      ["Munosabatlaringiz qanday rivojlandi? Birinchi uchrashuv, birinchi xat, birinchi sovg‘ani eslaysizmi?", "Hammasi qanday boshlangan"],
      [
        "To‘yingiz qanday o‘tdi? Qaysi udumlar, qo‘shiqlar va mehmonlar eng ko‘p esda qoldi?",
        "Bizning to‘yimiz",
        "Sovchilik, qiz uzatish, betashar — yoki FHDYo idorasida kamtarona nikoh. Yoningizda kim bor edi, dasturxonda nima bor edi, nima kuylashdi.",
      ],
      [
        "Oilaviy hayot sizga nimani o‘rgatdi? Sizningcha, ikki kishi uzoq yillar birga yashashiga nima yordam beradi?",
        "Muhabbat menga nimani o‘rgatdi",
      ],
      ["Shuncha yillardan keyin turmush o‘rtog‘ingizga nima demoqchi bo‘lardingiz?", "Sizga, aziz insonim"],
    ],
  },
  {
    key: "children",
    title: "Farzandlar va nevaralar",
    questions: [
      [
        "Birinchi farzandingiz tug‘ilishi haqida gapirib bering. Uni birinchi marta qo‘lingizga olganingizda nimani his qildingiz?",
        "Ota-ona bo‘lganimda",
      ],
      [
        "Oilangizda chaqaloqlarni qanday kutib olishgan? Qanday udumlar o‘tkazishgan — shildehana, beshikka solish, tusov kesish?",
        "Farzandlar sharafiga bayramlar",
        "Shildehana — yangi tug‘ilgan chaqaloq sharafiga bayram, beshikka solish — birinchi marta beshikka yotqizish, tusov kesish — bola ilk qadamlarini qo‘yganda oyoq bog‘ini kesish.",
      ],
      ["Farzandlaringiz bolaligida qanday edi? Ularning har biri haqida qaysi voqeani eslashni yaxshi ko‘rasiz?", "Farzandlarim"],
      ["Farzandlaringizni qanday tarbiyaladingiz? Ularga nimani yetkazish siz uchun eng muhim edi?", "Farzandlarimga nimani o‘rgatdim"],
      ["Farzandlaringiz ulg‘aygach, sizni nimasi bilan hayron qoldirdi yoki xursand qildi?", "Farzandlar ulg‘ayganda"],
      [
        "Nevaralar haqida gapirib bering: ular qanday, sizga nimasi bilan o‘xshaydi, birga nima qilishni yaxshi ko‘rasiz?",
        "Nevaralarim",
        "Nevaralaringiz hali bo‘lmasa, ularni qanday tasavvur qilishingizni va ularga nimalarni aytib bermoqchi ekaningizni yozing.",
      ],
    ],
  },
  {
    key: "home",
    title: "Uyim",
    epigraph: "Mehmonda yaxshi, uyda — yaxshiroq.",
    questions: [
      [
        "Qaysi shahar va qishloqlarda yashagansiz? Ko‘chib yurishlaringiz haqida gapirib bering: qayerga, nega, yangi joy qanday chiqdi.",
        "Men qayerda yashaganman",
        "Tartib bilan bo‘lishi mumkin: joy, yillar, nimasi bilan esda qolgan. Hatto qisqa ro‘yxat ham hayotingiz xaritasiga aylanadi.",
      ],
      ["Qaysi joyni o‘z vataningiz deb bilasiz? U yerga qaytganingizda nimani his qilasiz?", "Mening tug‘ilgan yerim"],
      [
        "O‘z uyingiz — birinchi kvartira yoki o‘z uyingiz qanday paydo bo‘lganini eslaysizmi? Bu qanday bo‘lgan?",
        "O‘z tomim ostida",
        "Uzoq yillik navbatdan keyin olingan order, butun qarindosh-urug‘ qurgan uy, yangi joydagi birinchi kecha.",
      ],
      [
        "Uyingizda dasturxon qanday edi? Mehmonlarni qanday kutib olishardi, ular kelishi uchun nima pishirishardi?",
        "Bizning dasturxonimiz",
        "Bayramlarda beshbarmoq, bovursoq, qazi, sutli choy — va dasturxonda to‘rda kim o‘tirardi.",
      ],
      ["Uyingizda qanday urf-odatlarga amal qilinardi? Ulardan qaysilarini farzandlaringizga yetkazdingiz?", "Uyimizning urf-odatlari"],
      [
        "Uyingizdagi qaysi buyumlar oila tarixini saqlaydi? Siz uchun eng qadrlisi haqida gapirib bering.",
        "Tarixi bor buyumlar",
        "Sandiq, kosa, gilam, dombira, buvingizning nimchasi, eski suratlar, medallar, xatlar.",
      ],
    ],
  },
  {
    key: "times",
    title: "Men yashagan zamon",
    questions: [
      [
        "Bolaligingiz va yoshligingiz yillarida odamlar qanday yashardi? O‘shanda nima oddiy edi-yu, bugungi yoshlarni hayron qoldirardi?",
        "O‘shanda qanday yashardik",
        "Navbatlar, haftalab yurgan xatlar, butun ko‘chaga bitta telefon — turmushning mayda-chuydalari zamonni eng yaxshi ko‘rsatadi.",
      ],
      [
        "Mamlakat va dunyodagi qaysi voqealarni kechagidek eslaysiz? O‘sha kuni qayerda edingiz?",
        "Esimda qolgan kunlar",
        "Darslikda yozilganini emas, o‘zingiz ko‘rganingizni aytib bering: qayerda edingiz, odamlar nima derdi, bu oilangizda qanday aks etdi.",
      ],
      [
        "To‘qsoninchi yillarda oilangiz qanday yashadi? Nima o‘zgardi va qanday uddalandingiz?",
        "To‘qsoninchi yillar",
        "Qanday pul topishgan, dasturxonga nima qo‘yishgan, nimaga umid qilishgan, kim yordam bergan.",
      ],
      [
        "Mustaqil Qozog‘istonning dastlabki yillarini eslaysizmi? Qanday o‘zgarishlarni birinchi bo‘lib payqadingiz?",
        "Mustaqillikning birinchi yillari",
        "Birinchi tenge, yangi pasportlar, ko‘cha va shaharlarning yangi nomlari — hayotingizda nima o‘zgardi.",
      ],
      [
        "Ko‘z oldingizda dunyo qanday o‘zgardi? Qaysi yangilik sizni eng ko‘p hayratga soldi?",
        "Ko‘z oldimda nima o‘zgardi",
        "Uydagi birinchi telefon, birinchi televizor, birinchi kompyuter, nevaralarga birinchi video qo‘ng‘iroq.",
      ],
      ["Sizning avlodingiz uchun qaysi qo‘shiqlar, filmlar va kitoblar eng muhim edi? Ulardan qaysilarini hozirgacha yaxshi ko‘rasiz?", "Zamonamning qo‘shiqlari"],
    ],
  },
  {
    key: "trials",
    title: "Sinovlar",
    epigraph: "Sabrning tagi — sariq oltin.",
    questions: [
      [
        "Hayotingizdagi eng og‘ir sinov qaysi edi? Uni qanday boshdan kechirdingiz?",
        "Eng og‘iri",
        "Aytishga tayyor bo‘lganingizcha yozing. Ba’zan bardosh berishga nima yordam bergani haqida bir necha qator ham yetarli.",
      ],
      ["Og‘ir daqiqada sizni kim qo‘llab-quvvatladi? Bu qanday bo‘lganini gapirib bering.", "Yonimda kim bor edi"],
      ["Qaysi qaror sizga ayniqsa og‘ir tushdi? Hozir unga qanday qaraysiz?", "Qiyin tanlov"],
      ["Yaqinlaringizdan kimni ayniqsa sog‘inasiz? Ular haqida saqlab qolmoqchi bo‘lgan narsalarni gapirib bering.", "Yorug‘ xotira"],
      ["Nima sizga ruhdan tushmaslikka yordam berdi — oilami, ishmi, imonmi, hazilmi?", "Bardosh berishimga nima yordam berdi"],
    ],
  },
  {
    key: "joys",
    title: "Hayot quvonchlari",
    questions: [
      ["Hayotingizdagi eng baxtli kunni qaysi deb atagan bo‘lardingiz? U haqida batafsil gapirib bering.", "Eng baxtli kun"],
      [
        "Oilangizda Navro‘z, Yangi yil, tug‘ilgan kunlarni qanday nishonlashgan? Qaysi bayram eng ko‘p esda qolgan?",
        "Bizning bayramlarimiz",
        "Navro‘z-ko‘za, mehmonlar, yangi kiyim, mandarinli archa, dasturxon atrofidagi qo‘shiqlar.",
      ],
      ["Hozirgacha qaysi to‘yni eslaysiz — yaqinlarning to‘yi, yubiley, kuzatuv? U nimasi bilan o‘ziga xos edi?", "Esimda qolgan to‘y"],
      [
        "Ishdan tashqari, ruhingiz uchun nima bilan shug‘ullanishni yaxshi ko‘rardingiz?",
        "Mening sevimli mashg‘ulotim",
        "Qo‘l mehnati, bog‘, baliq ovi, dombira, shaxmat, qo‘shiqlar, kitoblar — sizga nima quvonch keltirardi.",
      ],
      [
        "Qaysi safar va sayohatlar sizga eng ko‘p yodingizda qolgan?",
        "Mening sayohatlarim",
        "Yo‘llanma bilan sanatoriy, Borovoye, Issiqko‘l, dengiz, chet elga birinchi safar.",
      ],
      ["Umrbod do‘stlaringiz kimlar? Sizni bog‘lab turgan voqeani gapirib bering.", "Umrbod do‘stlar"],
      ["Bugun sizni nima quvontiradi — oddiy kunda, oddiy narsalarda?", "Hozir meni nima quvontiradi"],
    ],
  },
  {
    key: "wisdom",
    title: "Hayot haqida nimani angladim",
    epigraph: "Biluvchi — ko‘p yashagan emas, ko‘p ko‘rgan.",
    questions: [
      [
        "Hayot sizga nimani o‘rgatdi? Uchta asosiy saboqni ayting.",
        "Asosiy saboqlar",
        "Ro‘yxat qilib yozish mumkin: har bir saboq — yangi qatordan va hayotdan qisqa misol bilan.",
      ],
      ["Kattalarning qaysi maslahati siz uchun eng to‘g‘ri chiqdi? Uni kim bergan?", "Yodimda qolgan maslahat"],
      [
        "O‘zingiz yigirma yoshdagi bilan gaplasha olsangiz, nima derdingiz?",
        "Yosh o‘zim bilan suhbat",
      ],
      [
        "Hayotda nima chindan ham muhim bo‘lib chiqdi, nima esa qayg‘urishga arzimaydigan mayda-chuyda edi?",
        "Nima muhim, nima emas",
      ],
      ["Qaysi maqol va sevimli iboralarni eng ko‘p takrorlaysiz? Nega aynan ular?", "Mening sevimli iboralarim"],
      ["Nimaga afsuslanasiz — va nimani o‘ylab o‘tirmay, yana qilgan bo‘lardingiz?", "Nimani yana qilgan bo‘lardim"],
    ],
  },
  {
    key: "letter",
    title: "Avlodlarga xat",
    epigraph: "Sizlarga qoldirishim mumkin bo‘lgan eng qimmat narsa — o‘z hikoyam.",
    questions: [
      ["Farzandlaringiz, nevaralaringiz va evaralaringizga nimalarni tilamoqchisiz?", "Tilaklarim"],
      ["Oilada qaysi qadriyat va an’analarni asrab qolishni so‘raysiz?", "Nimani asrashni so‘rayman"],
      ["Yaqinlaringiz xotirasida qanday bo‘lib qolishni istardingiz?", "Men haqimda nima eslash kerak"],
      ["Yaqinlaringizdan biriga qachonlardir aytmoqchi bo‘lgan, lekin aytolmagan qanday so‘zlaringiz bor?", "Anchadan beri aytmoqchi bo‘lganim"],
      [
        "Bu kitobni ko‘p yillardan keyin o‘qiydiganlarga xat yozing.",
        "Mendan keyin keladiganlarga xat",
        "Ularga ismlari bilan murojaat qiling yoki oddiygina: «Qadrdonlarim…». Ovoz chiqarib aytganingizdek yozing.",
      ],
    ],
  },
];
