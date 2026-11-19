import type { LegalBlock, LegalFacts, legal as ru } from "../ru/legal";

export const legal: typeof ru = {
  updated: "2026-yil 1-sentabr",
  offer: {
    meta: "Ommaviy oferta",
    metaDescription: "MyBooks’da shaxsiy kitobga buyurtma berish shartlari: rasmiylashtirish, to‘lov, tayyorlash va yetkazib berish muddatlari, qaytarish.",
    title: "Ommaviy oferta",
    blocks: (f: LegalFacts): LegalBlock[] => [
      {
        p: `Ushbu hujjat ${f.legalName} (BIN ${f.bin}, keyingi o‘rinlarda — «Ijrochi») tomonidan quyida bayon etilgan shartlarda shaxsiy kitob tayyorlash bo‘yicha shartnoma tuzish haqidagi rasmiy taklifdir. ${f.url} saytida buyurtmani rasmiylashtirish oferta shartlarini to‘liq va so‘zsiz qabul qilishni (aksept) anglatadi.`,
      },
      {
        h: "1. Shartnoma predmeti",
        p: "Ijrochi Buyurtmachiga shaxsiy kitob (keyingi o‘rinlarda — «Kitob») yaratish uchun onlayn-servis taqdim etadi va Buyurtmachining buyurtmasiga ko‘ra Kitobni elektron (PDF) va/yoki bosma shaklda tayyorlaydi, Buyurtmachi esa buyurtma uchun to‘laydi.",
      },
      {
        h: "2. Kitob mazmuni",
        ul: [
          "Kitobning matnlari, suratlari va boshqa materiallarini Buyurtmachi taqdim etadi. Buyurtmachi ulardan foydalanish huquqiga ega ekanini kafolatlaydi.",
          "Ijrochi matnlarni mazmunan tahrir qilmaydi va ularning mazmuni, imlosi hamda tinish belgilari uchun javobgar emas.",
          "Ijrochi Qozog‘iston Respublikasi qonunchiligini buzuvchi materiallar mavjud Kitobni tayyorlashdan bosh tortishga haqli.",
        ],
      },
      {
        h: "3. Buyurtmani rasmiylashtirish va to‘lash",
        ul: [
          "Buyurtmani rasmiylashtirishdan oldin Buyurtmachi «Oldindan ko‘rish» bo‘limida Kitob maketi bilan tanishib chiqishi shart. Buyurtmani rasmiylashtirib, Buyurtmachi maketga rozilik bildiradi.",
          "Narx buyurtma rasmiylashtirilgan paytda saytda e’lon qilingan tariflar bilan belgilanadi. To‘lov tengeda, saytda ko‘rsatilgan usullar bilan amalga oshiriladi.",
          "Tayyorlash to‘lov to‘liq hajmda kelib tushganidan keyin boshlanadi.",
        ],
      },
      {
        h: "4. Muddatlar va yetkazib berish",
        ul: [
          `Bosma Kitobni tayyorlash muddati — to‘lov paytidan boshlab ${f.standardDays} ish kuni (ekspress bosma buyurtma qilinganda — ${f.premiumDays}).`,
          "Elektron nusxa to‘lov tasdiqlanishi bilan darhol shaxsiy kabinetda mavjud bo‘ladi.",
          "Yetkazib berish muddatlari tanlangan usul va yetkazib berish xizmatiga bog‘liq.",
        ],
      },
      {
        h: "5. Qaytarish va e’tirozlar",
        ul: [
          "Kitob individual buyurtma bo‘yicha tayyorlanadi, shuning uchun sifati lozim darajada bo‘lgan kitob qaytarib olinmaydi.",
          "Ishlab chiqarish boshlanishidan oldin Buyurtmachi buyurtmani bekor qilib, to‘lovni to‘liq qaytarib olishi mumkin.",
          "Ishlab chiqarish nuqsoni (bosma, muqovalash nuqsonlari) bo‘lganda Ijrochi Kitobni bepul qayta tayyorlaydi. E’tirozlar olingan paytdan boshlab 14 kun ichida qabul qilinadi.",
        ],
      },
      {
        h: "6. Sovg‘a sertifikatlari",
        ul: [
          "Sertifikat Kitobga buyurtma berishda uning nominali miqdorida chegirma olish huquqini beradi. Sertifikat bir martalik bo‘lib, to‘lov sanasidan boshlab 12 oy amal qiladi.",
          "Buyurtma narxi nominaldan yuqori bo‘lsa, Buyurtmachi farqini qo‘shimcha to‘laydi; kam bo‘lsa — qoldiq qaytarilmaydi va keyingisiga o‘tkazilmaydi.",
          `Foydalanilmagan sertifikatni to‘lov sanasidan boshlab 14 kun ichida ${f.email} manziliga yozib, qaytarish mumkin.`,
        ],
      },
      { h: "7. Shaxsiy ma’lumotlar", p: "Shaxsiy ma’lumotlarni qayta ishlash saytda joylashtirilgan Maxfiylik siyosatiga muvofiq amalga oshiriladi." },
      { h: "8. Hujjat tili", p: "Oferta rus va qozoq tillarida e’lon qilingan. Ikkala tildagi matnlar bir xil kuchga ega." },
      { h: "9. Rekvizitlar", p: `${f.legalName}, BIN ${f.bin}, ${f.address}. E-mail: ${f.email}, telefon: ${f.phone}.` },
    ],
  },
  privacy: {
    meta: "Maxfiylik siyosati",
    metaDescription: "MyBooks qanday ma’lumotlarni to‘playdi, ular nega kerak va qanday himoyalangan: profil, kitoblar, buyurtmalar, xabarnomalar.",
    title: "Maxfiylik siyosati",
    blocks: (f: LegalFacts): LegalBlock[] => [
      {
        p: `Ushbu siyosat ${f.legalName} ${f.brand} servisidan foydalanishda qanday ma’lumotlarni to‘plashini va ular qanday ishlatilishini bayon etadi. Biz hikoyalaringizning maxfiyligini hurmat qilamiz: kitobning matnlari va suratlari faqat sizga ochiq.`,
      },
      {
        h: "Qanday ma’lumotlarni to‘playmiz",
        ul: [
          "Profil ma’lumotlari: ism, e-mail, parol (faqat kriptografik xesh ko‘rinishida saqlanadi), tanlangan til.",
          "Kitob mazmuni: savollarga javoblar, suratlar, bezak sozlamalari.",
          "Buyurtma ma’lumotlari: aloqa uchun ism, telefon, yetkazib berish manzili, holatlar tarixi.",
          "Texnik ma’lumotlar: profilga kirish uchun zarur bo‘lgan sessiya cookie’si va tanlangan til cookie’si.",
        ],
      },
      {
        h: "Ma’lumotlardan qanday foydalanamiz",
        ul: [
          "Servis ishlashi uchun: kitobingizni saqlash va maketlash.",
          "Buyurtmani bajarish uchun: bosish, yetkazib berish va buyurtma bo‘yicha siz bilan bog‘lanish.",
          "Biz ma’lumotlarni sotmaymiz va kitob matnlaridan reklama yoki boshqa maqsadlarda foydalanmaymiz.",
        ],
      },
      {
        h: "Ma’lumotlar kimga uzatiladi",
        ul: [
          "Bosmaxonalarga — kitobning tayyor fayllari, faqat buyurtmani bosish uchun.",
          "Yetkazib berish xizmatiga — oluvchining ismi, telefoni va manzili.",
          "To‘lov provayderiga — to‘lovni o‘tkazish uchun zarur ma’lumotlar. Bank kartalari ma’lumotlarini biz olmaymiz va saqlamaymiz.",
        ],
      },
      {
        h: "Saqlash va o‘chirish",
        p: `Kitobni istalgan payt uning sahifasida o‘chirishingiz mumkin. Profilni va barcha bog‘liq ma’lumotlarni o‘chirish uchun bizga ${f.email} manziliga yozing. Buyurtmalar haqidagi ma’lumotlar buxgalteriya hisoboti uchun qonunchilikda belgilangan muddatlarda saqlanadi.`,
      },
      { h: "Aloqa", p: `Ma’lumotlarni qayta ishlash masalalari bo‘yicha: ${f.email}.` },
    ],
  },
};
