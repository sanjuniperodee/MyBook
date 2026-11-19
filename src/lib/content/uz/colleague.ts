import type { ChapterDef } from "../types";

// Hamkasbga bag‘ishlangan kitob — hamkasbdan, bo‘limdan yoki butun jamoadan. O‘zbek tilida grammatik jins yo‘q, shuning uchun [..|..] belgilari kerak emas.
// Sarlavhalarda hamkasbga «sen» deb murojaat qilinadi: bunday kitobni sovg‘a qiladigan jamoada shunday qabul qilingan.
// Boblar kalitlari va savollar soni rus nusxasi bilan bir xil.

export const colleagueChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "So‘z boshi o‘rnida",
    epigraph: "Ish joyida yoningda o‘tiradigan odam bilan hayotning yarmi o‘tadi.",
    questions: [
      [
        "O‘zingizni tanishtiring: siz unga kimsiz — bo‘limdagi hamkasb, yonma-yon stol, butun jamoa — va nega bu kitobni yozmoqchi bo‘ldingiz?",
        "Nega bu kitob",
        "Bir-ikki iliq jumla: kitob qaysi munosabat bilan — tug‘ilgan kun, yubiley, ta’tilga yoki yangi ishga ketish, lavozim ko‘tarilishi, kasb bayrami.",
      ],
      ["Uni uchta so‘z bilan ta’riflang.", "Sen uchta so‘zda"],
      ["Unga qanday murojaat qilasiz? Jamoada uning laqabi bormi?", "Biz seni qanday chaqiramiz"],
      ["U qayerda va kim bo‘lib ishlaydi, jamoada necha yildan beri birgasiz?", "Lavoziming va bizning yillarimiz"],
    ],
  },
  {
    key: "meet",
    title: "Qanday tanishganmiz",
    questions: [
      ["Uni ofisda yoki ish chatida birinchi marta qanday ko‘rdingiz?", "Birinchi uchrashuv"],
      ["U sizda qanday birinchi taassurot qoldirdi?", "Birinchi taassurot"],
      ["Tanishishdan oldin u haqida sizga nima deyishgan edi?", "Sen haqingda nima deyishgan"],
      ["Birinchi marta qachon birga ishladingiz? Bu qanday vazifa edi?", "Birinchi umumiy vazifa"],
      ["U bilan xotirjam ishlash mumkinligini qachon tushundingiz?", "Senga ishonish mumkinligini qachon tushundim"],
      ["U kelgach, jamoada nima o‘zgardi?", "Sen bilan nima o‘zgardi"],
    ],
  },
  {
    key: "work",
    title: "Ish joyida yonma-yon",
    epigraph: "Yoningda suyanadigan odam bo‘lsa, ish yengilroq bo‘ladi.",
    questions: [
      ["U bilan birga oddiy ish kuni qanday o‘tadi?", "Oddiy kun"],
      ["Jamoada u nimasi bilan hammadan kuchli?", "Sening kuchli tomoning"],
      ["Birga qanday vazifani hal qildingiz va u nima bilan tugadi?", "Birga hal qilgan vazifamiz"],
      ["U muddatlar bilan qanday ishlaydi — oldindan, oxirgi daqiqada, yo‘l-yo‘lakay?", "Sen va muddatlar"],
      ["Uning ish uslubining nimasini qadrlaysiz?", "Sen qanday ishlaysan"],
      ["Uning qaysi qarori yoki g‘oyasi sizni xushnud qilib hayratga soldi?", "Esimda qolgan g‘oyang"],
      ["U bilimini qanday ulashadi va yangi kelganlarga qanday yordam beradi?", "Sen qanday yordam berasan"],
    ],
  },
  {
    key: "you",
    title: "Sen qandaysan",
    questions: [
      ["U qanday hamkasb? Boshqalardan nimasi bilan farq qiladi?", "Sen qanday hamkasbsan"],
      ["Uni inson sifatida nimasi uchun ko‘proq qadrlaysiz?", "Senda nimani qadrlayman"],
      ["Uning hazil tuyg‘usi qanday? Butun jamoa eslab yuradigan qanday hazili bor?", "Sening hazilling"],
      ["U ofisda nima ichadi va choyga nima olib keladi?", "Choying va qahvang"],
      ["Butun jamoaga tanish bo‘lgan qaysi odati yoki so‘zi bor?", "Odatlaring"],
      ["U ish tashqarisida qanday — tushlik paytida bilib olgan qiziqishlari qanday?", "Ishdan tashqari nimani yoqtirasan"],
    ],
  },
  {
    key: "moments",
    title: "Bizning voqealarimiz",
    epigraph: "Oddiy kunlardan keyin aynan shunday voqealar esda qoladi.",
    questions: [
      ["Qaysi ish kunini tabassum bilan eslaysiz?", "Esimda qolgan kun"],
      ["Qaysi korporativ, sayohat yoki bayram yodingizda qoldi?", "Bizning bayramimiz"],
      ["U bilan yoki sizlar birga qanday kulgili voqea bo‘lgan?", "Kulgili voqea"],
      ["Choy yoki tanaffus paytidagi qaysi suhbat eng ko‘p esingizda qoldi?", "Esimda qolgan suhbat"],
      ["Butun jamoa bo‘lib ofisdan tashqarida nima qildingiz?", "Ofisdan tashqarida"],
      ["Faqat sizning jamoangizda bor qanday hazil, mem yoki ichki ibora bor?", "Bizning ichki gaplarimiz"],
    ],
  },
  {
    key: "hard",
    title: "Qiyin kunlar",
    questions: [
      ["Ishda eng og‘ir davringiz qanday bo‘lgan? U o‘shanda o‘zini qanday tutdi?", "Og‘ir davr"],
      ["U qachon sizni yoki butun jamoani qiyin ahvoldan olib chiqdi?", "Qachon bizni qutqargansan"],
      ["U xatolarga — o‘zinikiga ham, boshqalarnikiga ham — qanday munosabatda bo‘ladi?", "Sen va xatolar"],
      ["Qiyin paytda u sizni qanday qo‘llab-quvvatladi?", "Sening qo‘llab-quvvatlashing"],
      ["U qanday maslahat berdi va u sizning esingizda qoldi?", "Esimda qolgan maslahating"],
    ],
  },
  {
    key: "lessons",
    title: "Sendan nimani o‘rgandim",
    questions: [
      ["Ishda undan nimani o‘rgandingiz?", "Sendan nimani o‘rgandim"],
      ["Undan nimani o‘zlashtirdingiz — odatni, yondashuvni, iborani?", "Sendan nimani o‘zlashtirdim"],
      ["U bilan nimangiz bilan farq qilasiz — va bu jamoa uchun nimasi bilan yaxshi?", "Nimasi bilan farq qilamiz"],
      ["U bilan yonma-yon ishlaganda ishga munosabatingizda nima o‘zgardi?", "Sen meni qanday o‘zgartirding"],
    ],
  },
  {
    key: "thanks",
    title: "Rahmat va tilaklar",
    epigraph: "Ish chatida «rahmat» kamdan-kam yoziladi — shu yerda aytamiz.",
    questions: [
      ["Unga nimalar uchun minnatdorsiz?", "Senga rahmat…"],
      ["Unga nimani aytmoqchi edingiz, lekin shov-shuvda ulgurmadingiz?", "Aytolmagan gapim"],
      ["Unga ishda va hayotda nimalarni tilaysiz?", "Tilaklarim"],
      ["O‘zingizdan va jamoadan unga nimani va’da qilasiz?", "Va’dam"],
      ["Unga butun qalbingiz bilan xat yozing.", "Senga xat"],
    ],
  },
];
