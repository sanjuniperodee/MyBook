import type { ChapterDef } from "../types";

// Ona va otaga birga atalgan kitob — farzanddan. Oluvchi ko‘plikda, shuning uchun [..|..] kerak emas.
// Bob kalitlari va savollar soni rus tilidagi nusxa bilan bir xil.

export const parentsChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "So‘zboshi o‘rniga",
    epigraph: "Menda bor hamma narsa ikkovingizdan boshlangan.",
    questions: [
      [
        "O‘zingizni tanishtiring: siz kimsiz va bu kitobni ota-onangiz uchun nega yozishga qaror qildingiz?",
        "Bu kitobni nega yozyapman",
        "Bir-ikki iliq gap: siz kimsiz, bu kitob qanday munosabat bilan yozilmoqda va ularga nima demoqchisiz.",
      ],
      ["Ota-onangizni uch so‘z bilan ta’riflang.", "Sizlar uch so‘zda"],
      ["Ularni qanday ataysiz — ona va ota, oyi va dada, onajon va dadajon? Bu odat qayerdan kelib chiqqan?", "Sizlarni qanday atayman"],
      ["Ularning nechta farzandi va nevarasi bor? Kim kimligini aytib bering.", "Sizlarning farzand va nevaralaringiz"],
      ["Siz bola bo‘lganingizda oilangiz qanday edi?", "O‘sha paytdagi oilamiz"],
    ],
  },
  {
    key: "home",
    title: "Bizning uy",
    epigraph: "Uy — birga qurgan narsangiz.",
    questions: [
      ["Bolaligingizda uyingiz qanday edi — qayerda turardi, xonangiz qanday edi?", "Bizning uy"],
      ["Uyda nima hidlanardi? Qanday tovushlar, buyumlar va hidlar esingizda?", "Bolalik hidlari"],
      ["Bayramlarda dasturxonga nimalar qo‘yilardi va har kuni nima bo‘lardi?", "Sizlarning dasturxoningiz"],
      ["Ota-onangizdan kim uyda nima ish qilardi va g‘amxo‘rliklarni qanday bo‘lishardi?", "Kim nimaga javobgar edi"],
      ["Uyingizda eng muhim qoida qaysi edi?", "Asosiy qoida"],
      ["Uyning yoki hovlining qaysi burchagi sizning sevimlingiz edi?", "Mening sevimli burchagim"],
    ],
  },
  {
    key: "story",
    title: "Sizlarning tarixingiz",
    questions: [
      ["Onangiz va otangiz qayerda va qachon tug‘ilgan? Ularning bolaligi haqida nimalarni bilasiz?", "Hammasi qanday boshlangan"],
      ["Ular qanday tanishgan va birga bo‘lishga qanday qaror qilgan?", "Qanday uchrashgansizlar"],
      ["Ular kim bo‘lishni orzu qilgan va o‘z kasbini qanday tanlagan?", "Sizlarning ishingiz"],
      ["Ular birga qanday qiyin davrlarni boshidan kechirgan?", "Birga nimalarni boshdan kechirdingizlar"],
      ["Ularning qaysi qarori oilangiz hayotini o‘zgartirgan?", "Sizlarning asosiy qaroringiz"],
      ["Ularning yoshlik chog‘laridagi qaysi voqeani eng ko‘p yaxshi ko‘rasiz?", "Yoshligingizdan bir voqea"],
      ["Ularning qaysi qilmishi sizni hayratga soladi?", "Sizlardan nimaga havas qilaman"],
    ],
  },
  {
    key: "you",
    title: "Sizlar mening ko‘zim bilan",
    questions: [
      ["Ular xarakteri jihatidan qanday? Har biri boshqalardan nimasi bilan farq qiladi?", "Qandaysizlar"],
      ["Ulardan qaysi biri qattiqqo‘l, qaysi biri yumshoq edi? Bu qanday namoyon bo‘lardi?", "Qattiqqo‘l va yumshoq"],
      ["Ularning qaysi so‘zlari, maqollari va hazillari esingizda?", "Sizlarning so‘zlaringiz"],
      ["Ularning qaysi odati sizni mehrga to‘ldiradi?", "Sizlarning odatingiz"],
      ["Ularning har birida nimani ko‘proq qadrlaysiz?", "Sizlarda nimani qadrlayman"],
      ["Qachon ikkovlaridan ham g‘ururlangansiz?", "Sizlardan g‘ururlangan paytlarim"],
    ],
  },
  {
    key: "lessons",
    title: "Sizlarning saboqlaringiz",
    epigraph: "Sizlarning saboqlaringizni hali ham eshitib turaman.",
    questions: [
      ["Ota-onangiz sizga amalda nimalarni o‘rgatgan — ovqat pishirish, tuzatish, hisoblash, haydash?", "Menga nimalarni o‘rgatdingizlar"],
      ["Ularning qaysi maslahati hozir ham esingizda?", "Sizlarning maslahatingiz"],
      ["Ranjigan yoki og‘riganingizda ular sizni qanday yupatgan?", "Meni yupatgan paytlaringiz"],
      ["Ular sizni qanday erkalatgan? Sizga nimaga ruxsat berishgan, boshqalarga esa yo‘q?", "Faqat sizlarda"],
      ["Oilangizda pul, ish va o‘qish haqida qanday gaplashilgan?", "Pul va o‘qish haqida"],
      ["Ularning saboqlaridan qaysilarini o‘z farzandlaringizga berasiz?", "Farzandlarimga nimani beraman"],
    ],
  },
  {
    key: "family",
    title: "Bizning oilamiz",
    questions: [
      ["Qaysi oilaviy an’analar ota-onangizga tayanadi?", "Sizlar saqlayotgan an’analar"],
      ["Qaysi oilaviy bayram sizga eng yaxshi yodda qolgan?", "O‘sha bayram"],
      ["Muhim lahzalarda — bitiruv, to‘y, farzand tug‘ilganda — ularning qanday duolari yangragan?", "Sizlarning duoingiz"],
      ["Ular urug‘ haqida, ajdodlar haqida, biz qayerdanligimiz haqida nimalar aytib berishgan?", "Biz qayerdanmiz"],
      ["Ular o‘z ota-onalariga qanday g‘amxo‘rlik qilgan?", "Kattalarga g‘amxo‘rlik"],
      ["Ular bilan bog‘liq eng kulgili voqea qaysi?", "Eng kulgili voqea"],
    ],
  },
  {
    key: "thanks",
    title: "Rahmat",
    questions: [
      ["Ota-onangizga nima uchun minnatdorsiz?", "Sizlarga rahmat…"],
      ["Ularga nimani aytmoqchi bo‘lgansiz-u, aytolmagansiz?", "Aytolmaganlarim"],
      ["Ularga nimalar tilaysiz?", "Mening tilaklarim"],
      ["Ularga nimani va’da qilasiz?", "Mening va’dam"],
      ["Ularni nima uchun yaxshi ko‘rasiz? Sabablarni sanab o‘ting.", "Sizlarni nima uchun sevaman"],
      ["Ota-onangizga butun yuragingiz bilan xat yozing.", "Sizlarga xat"],
    ],
  },
];
