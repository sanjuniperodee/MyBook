import type { ChapterDef } from "../types";

// Aka yoki opaga kitob. [aka|opa] — oluvchining jinsi (faqat so‘zlar farq qilgan joyda), {..|..} — muallifning jinsi.

export const siblingChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "So‘zboshi o‘rniga",
    epigraph: "Biz bir tom ostida o‘sdik — va bu abadiy.",
    questions: [
      [
        "Siz bir-biringizga kim bo‘lasiz — katta, kichik, egizak? Bu kitobni unga nega yozmoqchisiz?",
        "Nega bu kitobni yozayapman",
        "Bir-ikki iliq so‘z: kitob qanday munosabat bilan — tug‘ilgan kun, to‘y, safarga kuzatish yoki shunchaki.",
      ],
      ["Uni uchta so‘z bilan tasvirlang.", "Sen uchta so‘zda"],
      ["Orangizda yosh farqi qancha va u turli yillarda qanday seziladi?", "Yosh farqimiz"],
      ["Uyda bir-biringizni qanday atab chaqirasiz? Laqablar qayerdan paydo bo‘lgan?", "Laqablarimiz"],
    ],
  },
  {
    key: "childhood",
    title: "Bizning bolaligimiz",
    questions: [
      ["U haqdagi birinchi xotirangiz qanday?", "Sen haqingdagi birinchi xotiram"],
      ["Xonani, o‘yinchoqlarni va ota-ona e’tiborini qanday bo‘lishgansiz?", "Ikkimizga bitta xona"],
      ["Birga nima o‘ynardingiz?", "O‘yinlarimiz"],
      ["Qanday urishardingiz — va qanday yarashardingiz?", "Qanday urishib, yarashardik"],
      ["Birga qanday shumlik qilib, ota-onadan yashirgansiz?", "Ota-onadan sirimiz"],
      ["Hovlida yoki maktabda kim kimni himoya qilgan?", "Kim kimni himoya qilgan"],
      ["Bolalikdagi qaysi yoz, safar yoki bayram eng ko‘p esingizda qolgan?", "O‘sha yoz"],
      ["Bolaligingizda u sizga qanday sovg‘a qilgan — hanuz eslaysiz?", "Bolalikdagi sovg‘a"],
    ],
  },
  {
    key: "family",
    title: "Bizning oilamiz",
    questions: [
      ["Ota-onaning ko‘zida u qanday edi — erkatoy, itoatsiz, yordamchi?", "Sen va ota-onamiz"],
      ["Bolalikdan qanday oilaviy an’analarni eslaysiz?", "An’analarimiz"],
      ["Qaysi oilaviy voqealarni ikkovingiz bir-biringizning gapingizni bo‘lib aytib berasiz?", "Ikkimiz aytadigan hikoyalar"],
      ["Ota-onangizning qaysi iboralarini ikkovingiz hanuz takrorlaysiz?", "Ota-onamizcha gapirardik"],
      ["Ota-onaga qanday syurpriz tayyorlagansiz?", "Ota-onaga syurpriz"],
      ["Oilaga qiyin bo‘lganda qanday birga turgansiz?", "Qiyin paytlarda"],
      ["Nimalaringiz o‘xshash, nimalaringiz butunlay boshqacha?", "O‘xshash va farqli jihatlarimiz"],
    ],
  },
  {
    key: "you",
    title: "Mening nazarimdagi sen",
    questions: [
      ["U qanday [aka|opa]?", "[Qanday akasan|Qanday opasan]"],
      ["Unda eng ko‘p nimani qadrlaysiz?", "Sendagi qadrlaganim"],
      ["Uning qanday iste’dodi bor?", "Sening iste’doding"],
      ["Uning qaysi gaplari va odatlari sizni kuldiradi?", "Sening gaplaring va odatlaring"],
      ["U sizni nima bilan hayron qoldiradi?", "Sen nima bilan hayron qoldirasan"],
      ["Qachon u bilan faxrlandingiz?", "Sen bilan faxrlangan paytlarim"],
      ["Undan nimalarni o‘rgandingiz?", "Sendan nimalarni o‘rgandim"],
    ],
  },
  {
    key: "grownup",
    title: "Biz katta bo‘ldik",
    questions: [
      ["Katta bo‘lganingizda munosabatlaringiz qanday o‘zgardi?", "Qanday katta bo‘ldik"],
      ["Orangiz sovigan davr bo‘lganmi? Yana qanday yaqinlashdingiz?", "Yana qanday yaqinlashdik"],
      ["Qiyin paytda u sizni qanday qo‘llab-quvvatlagan?", "Yonimda bo‘lganingda"],
      ["Uning qaysi maslahatini eslaysiz?", "Sening maslahating"],
      ["Uning umr yo‘ldoshi bilan birinchi marta qanday uchrashdingiz? Nima deb o‘yladingiz?", "Sening umr yo‘ldoshing"],
      ["Farzandlaringiz bilan u qanday munosabatda — yoki qanday bo‘ladi deb o‘ylaysiz?", "Farzandlarim uchun sen"],
      ["Katta bo‘lganingizdan keyin sizlar bilan bo‘lgan eng kulgili voqea qaysi?", "Eng kulgili voqea"],
    ],
  },
  {
    key: "future",
    title: "Oldinda",
    questions: [
      ["Birga nimalarni orzu qilasiz?", "Orzularimiz"],
      ["Ikkovingiz albatta nima qilishingiz kerak?", "Ikkimiz nima qilamiz"],
      ["Ikkovingiz qayerga borishni orzu qilasiz?", "Sayohatimiz"],
      ["Qanday an’anani boshlamoqchi yoki saqlab qolmoqchisiz?", "Kelajak uchun an’anamiz"],
      ["Yigirma yildan keyin o‘zingizni qanday ko‘rasiz?", "Yigirma yildan keyin biz"],
      ["Unga nima va’da berasiz?", "Va’dam"],
    ],
  },
  {
    key: "thanks",
    title: "Rahmat",
    questions: [
      ["Undan nimalar uchun minnatdorsiz?", "Senga rahmat…"],
      ["Nimalar uchun kechirim so‘ramoqchisiz — bolalikdagimi yoki kattalikdagimi?", "Meni kechir…"],
      ["U nimani bilib yurishini istaysiz?", "Bilishing kerak"],
      ["Unga nima tilaysiz?", "Tilaklarim"],
      ["Uni nimasi uchun sevasiz? Sabablarni sanab chiqing.", "Seni nima uchun sevaman"],
      ["Unga yuragingizdan xat yozing.", "Senga xat"],
    ],
  },
];
