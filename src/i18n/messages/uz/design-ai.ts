import type { Messages } from "..";
import { uzCount } from "../../plural";

/**
 * AI-dizayner: istakni so‘z bilan yozasiz — sahifalar yoki muqova o‘zgaradi; tanlash uchun uch variant; maslahatlar bilan dizayn bahosi.
 * 5 ta bepul so‘rov, keyin — paketlar.
 */
export const design_ai: Messages["design"]["ai"] = {
  tab: "AI-dizayner",
  title: "AI-dizayner",
  lead: {
    pages: "Shriftlarni, ranglarni va sahifalash qoidalarini biladi, suratlaringiz ranglarini va kitob muqovasini ko‘ra oladi. Titul va boblar uchun emblemalar chiza oladi. Nima xohlayotganingizni yozing — va yoyilmada ko‘ring.",
    cover: "Shriftlarni, maketlarni va muqova qoidalarini biladi, suratlaringiz ranglarini va kitob sahifalarini ko‘ra oladi. Chizishni biladi: manzaralar, naqshlar, hoshiyalar, gullar. Nima xohlayotganingizni yozing — va maketda ko‘ring.",
  },
  modes: { edit: "O‘zgartirish", create: "O‘ylab topish", variants: "3 variant", review: "Baholash" },
  modesAria: "Nima qilish kerak",
  modeHint: {
    edit: "Nimani o‘zgartirishni so‘z bilan ayting. Aniqlashtirish mumkin: «yanada to‘qroq», «oldingi shriftni qaytar».",
    create: "AI kitobingiz uchun bezakni noldan o‘ylab topadi va unga rasmlar chizadi: tog‘lar, gullar, naqshlar, hoshiyalar.",
    variants: "Bitta so‘rovda uchta turli yo‘nalish — eng yaxshisini tanlang, qolganlari siz shu yerda bo‘lguncha yo‘qolmaydi.",
    review: "Bezakka 1 dan 10 gacha halol baho va bir tugma bilan qo‘llanadigan maslahatlar.",
  },
  placeholder: {
    pages: "Masalan: qadimiy roman kabi qil — serifli shrift, bezakli bosh harf va bordo urg‘ular",
    cover: "Masalan: to‘q ko‘k fon, nomi kattaroq va oltin rangda, ingichka hoshiya",
  },
  createPlaceholder: {
    pages: "Qanday g‘oya? Masalan: ertakdagidek tog‘lar va yulduzli osmon. Bo‘sh qoldirish mumkin — AI o‘zi o‘ylab topadi",
    cover: "Qanday g‘oya? Masalan: dasht, o‘tov va lolalar. Bo‘sh qoldirish mumkin — AI o‘zi o‘ylab topadi",
  },
  createDefault: "Bu kitob uchun bezakni noldan o‘ylab top va unga o‘z rasmingni chiz",
  concept: "G‘oya",
  variantsPlaceholder: {
    pages: "Qanday kayfiyat? Masalan: iliq va oilaviy. Bo‘sh qoldirish mumkin — AI kitobga qarab tanlaydi",
    cover: "Qanday kayfiyat? Masalan: bayramona, lekin rang-barang emas. Bo‘sh qoldirish mumkin — AI kitobga qarab tanlaydi",
  },
  reviewPlaceholder: "Nimaga alohida e’tibor berish kerak? (ixtiyoriy)",
  variantsDefault: "Shu kitob uchun uchta turli bezak varianti taklif qil",
  examples: {
    pages: ["Shrift kattaroq, buvim o‘qishi uchun", "Klassik roman kabi", "Zamonaviy va jiddiy, serifsiz", "Iliq ranglar va yumshoq bezaklar"],
    cover: ["Nomi kattaroq va kontrastliroq", "To‘q fon va oltin", "Nafis va yorug‘, pastel ranglarda", "Hoshiya va novdalar qo‘sh"],
  },
  drawIdeas: {
    pages: ["Boblar uchun emblema chiz — gul", "Emblema chiz: tog‘lar va oy"],
    cover: ["Pastda oyli tog‘larni chiz", "O‘tov, lolalar va quyoshni chiz", "Hoshiyada qozoq naqshini qo‘sh", "Gullardan gulchambar chiz"],
  },
  themeIdeas: {
    love: { pages: "Romantik: upa rangi va oltin", cover: "Romantik, to‘y taklifnomasidek" },
    mom: { pages: "Nafis, gerbariydek", cover: "Gullar va yumshoq pastel ranglar" },
    dad: { pages: "Salobatli, xotiralardek", cover: "Vazmin va olijanob, to‘q fon" },
    friend: { pages: "Quvnoq, stikerli albomdek", cover: "Yorqin va bayramona" },
    teacher: { pages: "Jiddiy va iliq, yaxshi kitobdek", cover: "Kuzgi va shinam" },
    autobiography: { pages: "Qadimiy kitobdek", cover: "Oilaviy solnomadek, retro" },
    blank: { pages: "Chinakam nashr etilgan kitobdek", cover: "Minimalizm, kitob do‘konidagidek" },
  },
  photoIdea: "Ranglarni suratlarimga moslab tanla",
  matchIdea: { pages: "Muqova bilan bir uslubda qil", cover: "Sahifalar bilan bir uslubda qil" },
  examplesLabel: "G‘oyalar:",
  send: { edit: "O‘zgartirish", create: "Dizayn o‘ylab topish", variants: "3 variantni ko‘rsatish", review: "Dizaynimni baholash" },
  thinking: { edit: "Bezakni tanlayapman…", create: "O‘ylab topyapman va chizyapman…", variants: "Uchta variantni chizyapman…", review: "Dizayningizga qarayapman…" },
  undo: "Avvalgi holatga qaytarish",
  noChange: "Hech narsa o‘zgarmadi.",
  you: "Siz",
  ai: "AI-dizayner",
  // Variantlar.
  variantsTitle: "Variantni tanlang",
  pick: "Tanlash",
  picked: "Tanlangan",
  noVariants: "Variantlarni tayyorlab bo‘lmadi — kayfiyatni boshqacha tasvirlab ko‘ring. So‘rov bekorga ketmadi: «O‘zgartirish» rejimini sinab ko‘ring.",
  // Baho.
  score: (n: number) => `10 dan ${n}`,
  scoreLabel: "Dizayn bahosi",
  strengths: "Nima allaqachon yaxshi",
  tips: "Qanday qilib yaxshilash mumkin",
  apply: "Qo‘llash",
  applied: "Qo‘llandi",
  tipText: "maslahat",
  // Limit — oldindan, yuborishdan avval.
  left: (n: number, limit: number) => `Bepul so‘rovlar: ${limit} tadan ${n} ta`,
  credits: (n: number) => `zaxirada ${uzCount(n, "ta so‘rov")}`,
  oneRequest: "Har qanday rejim — bitta so‘rov",
  freeNote: (limit: number) => `${limit} ta so‘rov bepul. Har qanday rejim — bitta so‘rov; AI javob bermasa, so‘rov sarflanmaydi.`,
  lastFree: "Bu oxirgi bepul so‘rov. Maslahat: «3 variant» bitta so‘rovga eng ko‘p natija beradi.",
  lowFree: (n: number) => `${uzCount(n, "ta bepul so‘rov")} qoldi — «3 variant» yoki «Dizaynni baholash» rejimini sinab ko‘ring: bitta so‘rovga ko‘proq olasiz.`,
  fromCredits: (n: number) => `Bepul so‘rovlar tugadi — so‘rov paketdan yechiladi (zaxirada ${n} ta).`,
  // Paketlar taklifi.
  outTitle: "Bepul so‘rovlar tugadi",
  outText: "AI-dizayner bilan davom eting — paketdagi so‘rovlarning muddati o‘tmaydi va barcha kitoblaringiz uchun mos keladi.",
  perks: ["Bitta so‘rovda uchta bezak varianti", "O‘z rasmlari: manzaralar, naqshlar, hoshiyalar, emblemalar", "Bir bosishda dizayn bahosi va maslahatlar", "Muqova va sahifalar bir uslubda"],
  packTitle: (n: number) => uzCount(n, "ta so‘rov"),
  perRequest: (price: string) => `bir so‘rovga ${price}`,
  featured: "Foydaliroq",
  buy: "Sotib olish",
  buyMore: "So‘rovlarni qo‘shimcha olish",
  hidePacks: "Yig‘ish",
  payTitle: (n: number) => `Paket: ${uzCount(n, "ta so‘rov")}`,
  payNote: (number: number) => `To‘lov izohi — MyBooks A${number}. Kaspi to‘lovni tasdiqlashi bilan so‘rovlar o‘zi hisobga qo‘shiladi.`,
  paid: (n: number) => `Tayyor! ${uzCount(n, "ta so‘rov")} hisobga qo‘shildi.`,
  payUnavailable: "Paketlar uchun to‘lov hozir mavjud emas. Bizga yozing — yordam beramiz.",
  close: "Yopish",
  loadFailed: "So‘rovlar qoldig‘ini aniqlab bo‘lmadi. Sahifani yangilang.",
};
