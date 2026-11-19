import type { ChapterDef } from "../types";

// Boboga kitob — nevara yoki evaradan. Oluvchi doim bobo, shuning uchun oluvchi jinsi belgilari kerak emas.
// Bob kalitlarini ishga tushirilgandan keyin o‘zgartirib bo‘lmaydi: til almashtirish, analitika va CRM ularga tayanadi.

export const grandpaChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "So‘zboshi o‘rniga",
    epigraph: "Bobo qo‘llari — eng ishonchli tayanch.",
    questions: [
      [
        "O‘zingizni tanishtiring: siz unga kimsiz — nevara, evara — va bu kitobni nega yozmoqchisiz?",
        "Nega bu kitobni yozayapman",
        "Bir-ikki iliq so‘z: kitob qanday munosabat bilan — yubiley, tug‘ilgan kun yoki shunchaki.",
      ],
      ["Boboingizni uchta so‘z bilan tasvirlang.", "Sen uchta so‘zda"],
      ["Uni qanday atab chaqirasiz — bobo, bobojon, dada, ota? Bu odat qayerdan paydo bo‘lgan?", "Men seni qanday atayman"],
      ["Uning nechta nevarasi va evarasi bor? Kim kimligini aytib bering.", "Sening nevaralaring"],
    ],
  },
  {
    key: "home",
    title: "Bobo uyi",
    epigraph: "U yerda randa qipig‘i, benzin va non hidi kelardi.",
    questions: [
      ["Bolaligingizda uning uyi qanday edi?", "Sening uying"],
      ["Boboning uyida — xonadonda, garajda, ustaxonada — nima hidi kelardi?", "Bolalik hidlari"],
      ["U nimalarni yasay olardi? Uyda nimalar uning qo‘li bilan qilingan?", "Qo‘ling bilan yasalganlar"],
      ["U bilan qayerda o‘tirishni yaxshi ko‘rardingiz — hovlida, oshxonada, mashinada?", "Bizning joylarimiz"],
      ["Boboning uyida ta’til yoki dam olish kunlari qanday o‘tardi?", "Sening uyingdagi ta’tillar"],
      ["U nima pishirardi va siz birga nima qilardingiz?", "Sen bilan birga"],
    ],
  },
  {
    key: "work",
    title: "Sening kasbing",
    epigraph: "Qo‘ling bilan qilgan hamma narsa bizdan ko‘ra uzoqroq yashaydi.",
    questions: [
      ["U kim bo‘lib ishlagan? O‘z kasbidan nimasi bilan faxrlanadi?", "Sening ishing"],
      ["Uning qaysi asbob-uskunalari va buyumlarini eslaysiz?", "Sening asboblaring"],
      ["U sizga nimani o‘rgatdi — bolg‘a tutishni, ta’mirlashni, mashina haydashni, hisob-kitobni?", "Menga nimani o‘rgatding"],
      ["Uning ish yoki pul haqidagi qaysi maslahatini eslaysiz?", "Ish haqida maslahat"],
      ["Uning ustozi yoki o‘rnak olgan odami bo‘lganmi?", "Sening ustozing"],
      ["Uning qaysi ish kuni yoki qaysi qilig‘i esingizda qolgan?", "Esimda qolgan kun"],
    ],
  },
  {
    key: "life",
    title: "Sening hayoting",
    questions: [
      ["Uning bolaligi va ota-onasi haqida nimalarni bilasiz?", "Sening bolaliging"],
      ["U buvi bilan qanday tanishgan?", "Sen va buvi"],
      ["U qanday og‘ir kunlarni boshidan o‘tkazishga majbur bo‘lgan?", "Boshingdan kechirganlaring"],
      ["U o‘z hayotidan qaysi voqeani aytib berishni yaxshi ko‘radi?", "Sening sevimli hikoyang"],
      ["Yoshligida u qanday bo‘lgan — suratlar va hikoyalarga qaraganda?", "Yoshligingdagi sen"],
      ["U armiyada xizmat qilganmi, yurtni kezganmi? Nimalar aytib bergan?", "Sening yo‘llaring"],
      ["Uning qaysi qilig‘iga qoyil qolasiz?", "Sendan nimaga qoyil qolaman"],
    ],
  },
  {
    key: "you",
    title: "Mening nazarimdagi sen",
    questions: [
      ["Uning fe’li qanday? Nimasi bilan hech kimga o‘xshamaydi?", "Sen qanday insonsan"],
      ["Uning qaysi so‘zlari, ibora va hazillarini eslaysiz?", "Sening so‘zlaring va hazillaring"],
      ["Uning qaysi odati sizni mehrga to‘ldiradi yoki kuldiradi?", "Sening odating"],
      ["Hozir u nima bilan qiziqadi — baliq ovi, bog‘, mashina, futbol?", "Sening qiziqishlaring"],
      ["Unda eng ko‘p nimani qadrlaysiz?", "Sendagi qadrlaganim"],
      ["Qachon u bilan faxrlandingiz?", "Sen bilan faxrlangan paytlarim"],
    ],
  },
  {
    key: "family",
    title: "Bizning oilamiz",
    questions: [
      ["Qaysi oilaviy an’analar bobo tufayli saqlanib kelmoqda?", "Sen saqlayotgan an’analar"],
      ["U bilan o‘tgan qaysi oilaviy bayramni eng yaxshi eslaysiz?", "O‘sha bayram"],
      ["Muhim onlarda uning qanday duo va nasihatlari yangragan?", "Sening duoying"],
      ["U urug‘, ajdodlar, qayerdan kelganimiz haqida nimalar aytib bergan?", "Biz qayerdanmiz"],
      ["Bobo bilan bo‘lgan eng kulgili voqea qaysi?", "Eng kulgili voqea"],
    ],
  },
  {
    key: "wisdom",
    title: "Sening donoliging",
    questions: [
      ["Uning qaysi maslahatini hanuz eslaysiz?", "Sening maslahating"],
      ["So‘z, nomus va oila haqida u nima deydi?", "Sen nomus haqida"],
      ["Uning hayoti sizga nimani o‘rgatdi?", "Sening hayoting menga nimani o‘rgatdi"],
      ["Uning saboqlaridan qaysi birini farzandlaringizga yetkazasiz?", "Farzandlarimga nimani yetkazaman"],
      ["Undan yana nimalarni so‘ramoqchi edingiz?", "Sendan nimani so‘ramoqchiman"],
    ],
  },
  {
    key: "thanks",
    title: "Rahmat",
    questions: [
      ["Boboingizdan nimalar uchun minnatdorsiz?", "Senga rahmat…"],
      ["Unga nimani aytmoqchi bo‘lgan-u, aytmay qo‘ygansiz?", "Aytmagan gaplarim"],
      ["Unga nima tilaysiz?", "Tilaklarim"],
      ["Unga nima va’da berasiz?", "Va’dam"],
      ["Uni nimasi uchun sevasiz? Sabablarni sanab chiqing.", "Seni nima uchun sevaman"],
      ["Boboingizga yuragingizdan xat yozing.", "Senga xat"],
    ],
  },
];
