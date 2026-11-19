import type { ChapterDef } from "../types";

// Kelinga kitob — qaynona, qayinota yoki erdan (muallif kimligini majburlamaymiz). Oluvchi doim kelin,
// shuning uchun oluvchi jinsi belgilari kerak emas.

export const daughterinlawChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "So‘zboshi o‘rniga",
    epigraph: "Sen oilaga kirib kelgan kuni oilada iliqlik ko‘paydi.",
    questions: [
      [
        "O‘zingizni tanishtiring: siz unga kimsiz — qaynona, qayinota, er, boshqa qarindosh — va bu kitobni nega yozmoqchisiz?",
        "Nega bu kitobni yozayapman",
        "Bir-ikki iliq so‘z: kitob qanday munosabat bilan — to‘y, tug‘ilgan kun, 8-mart yoki shunchaki.",
      ],
      ["Uni uchta so‘z bilan tasvirlang.", "Sen uchta so‘zda"],
      ["Uni qanday atab chaqirasiz? Bu ism yoki laqab qayerdan paydo bo‘lgan?", "Men seni qanday atayman"],
      ["U oilangizda qachondan beri? Bu davr siz uchun qanday?", "Qancha vaqtdan beri birgamiz"],
    ],
  },
  {
    key: "arrival",
    title: "Sen oilaga qanday kirib kelding",
    epigraph: "Har bir oila kimningdir «salom»idan boshlanadi.",
    questions: [
      ["Uni ko‘rishingizdan oldin u haqda nimalarni bilgan edingiz?", "Seni oldindan nimalarni bilardim"],
      ["Qanday va qachon tanishgansiz?", "Uchrashuvimiz"],
      ["Birinchi uchrashuvda nimani his qildingiz?", "Birinchi tuyg‘u"],
      ["Uni oilada qanday qabul qilishdi — kim nima dedi, kim qanday kutib oldi?", "Seni qanday kutib olishdi"],
      ["To‘y kuni yoki sizning uyingizdagi birinchi kun qanday o‘tdi?", "O‘sha kun"],
      ["Uyingizda u nimani his qilishini istagan edingiz?", "Sen his qilishing uchun"],
    ],
  },
  {
    key: "first",
    title: "Birinchi taassurotlar",
    questions: [
      ["Dastlabki haftalarda uning nimasi sizni hayron qoldirdi?", "Meni nima hayron qoldirdi"],
      ["Dastlabki kunlarda u qanday edi — uyatchan, jasur, jim, quvnoq?", "Qanday eding"],
      ["Uning qaysi dastlabki so‘zlari yoki ishlari esingizda qolgan?", "Birinchi so‘z va ishlaring"],
      ["Nima siz kutganingizdek chiqmadi?", "Kutganim va hayot"],
      ["U chinakamiga o‘zimizniki bo‘lib qolganini qachon tushundingiz?", "Qachon o‘zimizniki bo‘lding"],
      ["O‘shanda unga nima demoqchi edingiz, lekin demadingiz?", "O‘shanda aytmaganim"],
    ],
  },
  {
    key: "you",
    title: "Sen qanday insonsan",
    epigraph: "Inson haqida mayda-chuydalar ko‘p narsa aytadi.",
    questions: [
      ["Uning qaysi xislatlarini eng ko‘p qadrlaysiz?", "Sendagi qadrlaganim"],
      ["Unda sizni nima hayratga soladi?", "Sendan nimaga qoyil qolaman"],
      ["Siz sezib, yaxshi ko‘rib qolgan qanday odatlari bor?", "Sening odatlaring"],
      ["U nimani hammadan yaxshi uddalaydi?", "Hammadan yaxshi uddalaydigan ishing"],
      ["Mehmonlarga u haqida nimalarni aytib berardingiz?", "Sen haqingda nimalar deyman"],
      ["Uning sizdan farq qiladigan jihatlari qaysilar va bu nimasi bilan yaxshi?", "Nimasi bilan farq qilamiz"],
    ],
  },
  {
    key: "together",
    title: "Sen oilaga nima berding",
    questions: [
      ["U oilangizga nima olib keldi?", "Uyga nima olib kelding"],
      ["U eriga, bolalariga, kattalarga qanday g‘amxo‘rlik qiladi?", "Sening g‘amxo‘rliging"],
      ["Uning qaysi qilig‘ini hech qachon unutmaysiz?", "Esimda qolgan ish"],
      ["U paydo bo‘lgach, uyda nima o‘zgardi?", "Sen bilan nima o‘zgardi"],
      ["Uning qaysi yordami yoki qo‘llab-quvvatlashi eng kerakli bo‘ldi?", "Qo‘llab-quvvatlaganing"],
      ["Oilada uni nimasi uchun yaxshi ko‘rishadi — nevaralar, aka-ukalar, opa-singillar, qo‘shnilar?", "Seni nima uchun yaxshi ko‘rishadi"],
    ],
  },
  {
    key: "traditions",
    title: "Oila an’analari",
    epigraph: "Yangi odamlar eski urf-odatlarga o‘z nurini olib keladi.",
    questions: [
      ["Oilangizdagi qaysi an’analarni u allaqachon o‘zlashtirib oldi?", "Sening ham bo‘lib qolgani"],
      ["U o‘z oilasidan qanday an’analarni olib keldi?", "Sening an’analaring"],
      ["U mehmonlarni qanday kutib oladi va dasturxon yozadi?", "Sening dasturxoning"],
      ["Qaysi oilaviy bayramni u bilan birga eslaysiz?", "Bizning bayramimiz"],
      ["Undan nimalarni o‘rgandingiz?", "Sendan nimalarni o‘rgandim"],
      ["Qaysi oilaviy an’anani unga topshirmoqchisiz, u uni keyingilarga yetkazishi uchun?", "Nimani topshirmoqchiman"],
    ],
  },
  {
    key: "thanks",
    title: "Rahmat",
    epigraph: "O‘z vaqtida aytilgan minnatdorchilik eng uzoq isitadi.",
    questions: [
      ["Unga nimalar uchun minnatdorsiz?", "Senga rahmat…"],
      ["Unga qanday so‘zlarni anchadan beri aytmoqchi edingiz?", "Aytmagan gaplarim"],
      ["Uning qaysi xislati oilangizni iliqroq qiladi?", "Sening iliqliging"],
      ["U bilan birga bo‘lgan qaysi lahza esingizda abadiy qoldi?", "Qolgan lahza"],
      ["Bugun u oilangiz uchun nimani anglatadi?", "Bizga sen kimsan"],
      ["Agar u uchun bitta narsa qila olsangiz, bu nima bo‘lardi?", "Sen uchun nima qilgan bo‘lardim"],
    ],
  },
  {
    key: "wishes",
    title: "Tilaklar va xat",
    epigraph: "Yaxshi so‘zlar — qoladigan sovg‘a.",
    questions: [
      ["Unga hayotda va oilada nima tilaysiz?", "Tilaklarim"],
      ["U doim nimani bilib yurishini istaysiz?", "Bilib yurishing uchun"],
      ["U va umumiy oilangiz uchun nimalarni orzu qilasiz?", "Biz haqimizdagi orzularim"],
      ["Unga nima va’da berasiz?", "Va’dam"],
      ["Unga yuragingizdan xat yozing.", "Senga xat"],
    ],
  },
];
