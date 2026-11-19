import type { ChapterDef } from "../types";

// Buvijonga kitob — nevara yoki evaradan. Oluvchi doim buvi, shuning uchun oluvchi jinsi belgilari kerak emas.
// Bob kalitlari va savollar soni rus nusxasi bilan bir xil.

export const grandmaChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "So‘zboshi o‘rniga",
    epigraph: "Buvining uyi — seni doim kutib turadigan joy.",
    questions: [
      [
        "O‘zingizni tanishtiring: siz unga kimsiz — nevara, evara — va bu kitobni nega yozmoqchisiz?",
        "Nega bu kitobni yozayapman",
        "Bir-ikki iliq so‘z: kitob qanday munosabat bilan — yubiley, tug‘ilgan kun, 8-mart yoki shunchaki.",
      ],
      ["Buvingizni uchta so‘z bilan tasvirlang.", "Sen uchta so‘zda"],
      ["Uni qanday atab chaqirasiz — buvi, buvijon, momo, oyijon? Bu odat qayerdan paydo bo‘lgan?", "Men seni qanday atayman"],
      ["Uning nechta nevarasi va evarasi bor? Kim kimligini aytib bering.", "Sening nevaralaring"],
    ],
  },
  {
    key: "home",
    title: "Buvining uyi",
    questions: [
      ["Bolaligingizda uning uyi qanday edi?", "Sening uying"],
      ["Buvingizning uyida nima hidi kelardi? Qanday tovushlar, hidlar, buyumlarni eslaysiz?", "Bolalik hidlari"],
      ["Mehmon kelganda uning dasturxoniga nimalar qo‘yilardi?", "Sening dasturxoning"],
      ["Uning qaysi taomini hech narsa bilan adashtirmaysiz? Retseptini bilasizmi?", "Sening mashhur taoming"],
      ["Uning uyi yoki hovlisining qaysi burchagi sizning eng sevimli joyingiz edi?", "Mening sevimli burchagim"],
      ["Buvingizning uyida ta’til yoki dam olish kunlari qanday o‘tardi?", "Sening uyingdagi ta’tillar"],
    ],
  },
  {
    key: "care",
    title: "Sening g‘amxo‘rliging",
    questions: [
      ["Siz bola paytingizda u sizga qanday g‘amxo‘rlik qilgan?", "Menga qanday g‘amxo‘rlik qilgansan"],
      ["Undan qanday ertaklar, qo‘shiqlar yoki allalar eshitgansiz?", "Sening ertaklaring"],
      ["U sizga qo‘li bilan nimani o‘rgatdi — ovqat pishirishni, tikishni, ekishni, hisob-kitobni?", "Menga nimani o‘rgatding"],
      ["Xafa bo‘lganingizda yoki og‘riganda u sizni qanday yupatgan?", "Meni yupatganingda"],
      ["U sizni qanday erkalatgan? Nimaga ruxsat bergan, ota-onangiz esa bermagan?", "Faqat buvining uyida"],
      ["U qanday jahli chiqardi — umuman jahli chiqqan bo‘lsa?", "Jahling chiqqanda"],
    ],
  },
  {
    key: "life",
    title: "Sening hayoting",
    questions: [
      ["Uning bolaligi va ota-onasi haqida nimalarni bilasiz?", "Sening bolaliging"],
      ["U bobo bilan qanday tanishgan?", "Sen va bobo"],
      ["U kim bo‘lib ishlagan? Ishidan nimasi bilan faxrlanadi?", "Sening ishing"],
      ["U qanday og‘ir kunlarni boshidan o‘tkazishga majbur bo‘lgan?", "Boshingdan kechirganlaring"],
      ["U o‘z hayotidan qaysi voqeani aytib berishni yaxshi ko‘radi?", "Sening sevimli hikoyang"],
      ["Yoshligida u qanday bo‘lgan — suratlar va hikoyalarga qaraganda?", "Yoshligingdagi sen"],
      ["Uning qaysi qilig‘iga qoyil qolasiz?", "Sendan nimaga qoyil qolaman"],
    ],
  },
  {
    key: "you",
    title: "Mening nazarimdagi sen",
    questions: [
      ["Uning fe’li qanday? Nimasi bilan hech kimga o‘xshamaydi?", "Sen qanday insonsan"],
      ["Uning qaysi so‘zlari, ibora va maqollarini eslaysiz?", "Sening maqollaring"],
      ["Uning qaysi odati sizni mehrga to‘ldiradi?", "Sening odating"],
      ["Hozir u nima bilan qiziqadi?", "Sening qiziqishlaring"],
      ["Unda eng ko‘p nimani qadrlaysiz?", "Sendagi qadrlaganim"],
      ["Qachon u bilan faxrlandingiz?", "Sen bilan faxrlangan paytlarim"],
    ],
  },
  {
    key: "family",
    title: "Bizning oilamiz",
    questions: [
      ["Qaysi oilaviy an’analar buvi tufayli saqlanib kelmoqda?", "Sen saqlayotgan an’analar"],
      ["Uning uyidagi qaysi oilaviy bayramni eng yaxshi eslaysiz?", "O‘sha bayram"],
      ["Muhim onlarda uning qanday duo va nasihatlari yangragan?", "Sening duoying"],
      ["U urug‘, ajdodlar, qayerdan kelganimiz haqida nimalar aytib bergan?", "Biz qayerdanmiz"],
      ["Buvi bilan bo‘lgan eng kulgili voqea qaysi?", "Eng kulgili voqea"],
    ],
  },
  {
    key: "wisdom",
    title: "Sening donoliging",
    questions: [
      ["Uning qaysi maslahatini hanuz eslaysiz?", "Sening maslahating"],
      ["U sevgi va oila haqida nima deydi?", "Sen sevgi haqida"],
      ["Uning hayoti sizga nimani o‘rgatdi?", "Sening hayoting menga nimani o‘rgatdi"],
      ["Uning saboqlaridan qaysi birini farzandlaringizga yetkazasiz?", "Farzandlarimga nimani yetkazaman"],
      ["Undan yana nimalarni so‘ramoqchi edingiz?", "Sendan nimani so‘ramoqchiman"],
    ],
  },
  {
    key: "thanks",
    title: "Rahmat",
    questions: [
      ["Buvingizdan nimalar uchun minnatdorsiz?", "Senga rahmat…"],
      ["Unga nimani aytmoqchi bo‘lgan-u, aytmay qo‘ygansiz?", "Aytmagan gaplarim"],
      ["Unga nima tilaysiz?", "Tilaklarim"],
      ["Unga nima va’da berasiz?", "Va’dam"],
      ["Uni nimasi uchun sevasiz? Sabablarni sanab chiqing.", "Seni nima uchun sevaman"],
      ["Buvingizga yuragingizdan xat yozing.", "Senga xat"],
    ],
  },
];
