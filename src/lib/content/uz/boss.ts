import type { ChapterDef } from "../types";

// Rahbarga yoki direktorga bag‘ishlangan kitob — jamoadan, bo‘limdan yoki bitta xodimdan. O‘zbek tilida grammatik jins yo‘q, shuning uchun [..|..] belgilari kerak emas.
// Sarlavhalarda rahbarga xat kabi «Siz» deb, bosh harf bilan murojaat qilinadi.
// Boblar kalitlari va savollar soni rus nusxasi bilan bir xil.

export const bossChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "So‘z boshi o‘rnida",
    epigraph: "Yaxshi rahbar — yonida yaxshiroq ishlagingiz keladigan inson.",
    questions: [
      [
        "O‘zingizni tanishtiring: siz kimsiz — xodim, bo‘lim, butun jamoa — va nega bu kitobni yozmoqchi bo‘ldingiz?",
        "Nega bu kitob",
        "Bir-ikki iliq jumla: kim yozyapti va qaysi munosabat bilan — tug‘ilgan kun, yubiley, lavozim ko‘tarilishi, yangi joyga ketish, kasb bayrami.",
      ],
      ["Uni uchta so‘z bilan ta’riflang.", "Siz uchta so‘zda"],
      ["Unga qanday murojaat qilasiz? Jamoada uning o‘zi biladigan — yoki bilmaydigan — laqabi bormi?", "Biz Sizni qanday chaqiramiz"],
      ["U qanday lavozimda ishlaydi va necha yildan beri birga ishlaysizlar?", "Lavozimingiz va bizning yillarimiz"],
    ],
  },
  {
    key: "meet",
    title: "Tanishuv",
    questions: [
      ["Uni birinchi marta qanday ko‘rdingiz? Bu qanday bo‘lgan — suhbat, yig‘ilish, birinchi ish kuni?", "Birinchi uchrashuv"],
      ["U sizda qanday birinchi taassurot qoldirdi?", "Birinchi taassurot"],
      ["Birga ishlay boshlashingizdan oldin u haqida nima eshitgan edingiz?", "Siz haqingizda nima deyishgan"],
      ["U sizga birinchi marta vazifa topshirganda nimani his qildingiz?", "Birinchi vazifa"],
      ["Alohida rahbar bilan ishlayotganingizni qachon tushundingiz?", "Siz alohida rahbar ekaningizni qachon tushundim"],
      ["U kelgach, jamoada nima o‘zgardi?", "Siz bilan nima o‘zgardi"],
    ],
  },
  {
    key: "leader",
    title: "Siz qanday rahbarlik qilasiz",
    epigraph: "Rahbar haqida oddiy ish kuni ko‘p narsani aytib beradi.",
    questions: [
      ["U bilan oddiy ish kuni qanday o‘tadi? Ertalabdan nima qiladi?", "Sizning oddiy kuningiz"],
      ["U vazifalarni qanday qo‘yadi va nima xohlayotganini qanday tushuntiradi?", "Siz vazifalarni qanday qo‘yasiz"],
      ["U qarorlarni qanday qabul qiladi — tez, o‘ylab, jamoa bilan maslahatlashib?", "Siz qanday qaror qilasiz"],
      ["U xatolarga — o‘zinikiga ham, boshqalarnikiga ham — qanday munosabatda bo‘ladi?", "Siz va xatolar"],
      ["Butun jamoa biladigan qanday iboralari va so‘zlari bor?", "Sizning iboralaringiz"],
      ["U yig‘ilishlarda va kengashlarda qanday bo‘ladi?", "Yig‘ilishlarda"],
      ["U qanday maqtaydi va qanday tanbeh beradi?", "Maqtov va tanbeh"],
    ],
  },
  {
    key: "team",
    title: "Siz bilan jamoa",
    questions: [
      ["U joyida bo‘lganda va bo‘lmaganda jamoadagi muhit qanday?", "Jamoadagi muhit"],
      ["Qiyin paytlarda u odamlarni qanday qo‘llab-quvvatlaydi?", "Siz qanday qo‘llab-quvvatlaysiz"],
      ["U jamoada qanday an’anani joriy qilgan?", "Bizning an’anamiz"],
      ["U jamoa yutuqlarini qanday nishonlaydi va xodimlarni qanday tabriklaydi?", "Yutuqlarni qanday nishonlaymiz"],
      ["U yangi kelganlarga qanday munosabatda bo‘ladi va ularga ko‘nikishda qanday yordam beradi?", "Siz bilan yangi kelganlar"],
      ["Qaysi korporativ, sayohat yoki bayramni tabassum bilan eslaysiz?", "Bizning bayramimiz"],
    ],
  },
  {
    key: "lessons",
    title: "Bizga nimani o‘rgatdingiz",
    epigraph: "Rahbarning saboqlari butun karerada qoladi.",
    questions: [
      ["Ishda undan nimani o‘rgandingiz?", "Sizdan nimani o‘rgandim"],
      ["U qanday maslahat berdi va u esingizda qoldi?", "Esimda qolgan maslahat"],
      ["Undan nimani o‘zlashtirdingiz — odatni, yondashuvni, iborani?", "Sizdan nimani o‘zlashtirdim"],
      ["U qachon sizga o‘zingizdan ham ko‘proq ishondi?", "Menga qachon ishongansiz"],
      ["U o‘sishga qanday yordam beradi — qiyin vazifalar beradi, ishonadi, erkinlik beradi?", "O‘sishga qanday yordam berasiz"],
      ["U bilan yonma-yon ishlaganda ishga munosabatingizda nima o‘zgardi?", "Siz meni qanday o‘zgartirdingiz"],
    ],
  },
  {
    key: "hard",
    title: "Og‘ir va muhim kunlar",
    questions: [
      ["Jamoangiz qanday eng og‘ir davrni boshidan kechirdi? U o‘zini qanday tutdi?", "Og‘ir davr"],
      ["Qaysi loyiha yoki natijani birga faxr bilan eslaysiz?", "Bizning g‘alabamiz"],
      ["Uning rahbar sifatida qaysi qilmishi sizning esingizda abadiy qoldi?", "Esimda qolgan qilmishingiz"],
      ["U qachon jamoa tomonini oldi?", "Bizni qachon himoya qilgansiz"],
      ["Og‘ir kunlarda o‘zini tutishiga qarab, u haqida nimani tushundingiz?", "Og‘ir kunlarda qanday edingiz"],
    ],
  },
  {
    key: "person",
    title: "Siz inson sifatida",
    questions: [
      ["Yig‘ilishlardan tashqarida u qanday — tushlikda, safarda, bayramda?", "Kabinetdan tashqarida"],
      ["U nimalarga qiziqadi? Ish suhbatlaridan tashqari u haqida nimalarni bildingiz?", "Lavozimdan tashqari"],
      ["Uning qaysi odati yoki xislati hammaning esida qolgan?", "Sizning odatingiz"],
      ["Uni inson sifatida nimasi uchun ko‘proq qadrlaysiz?", "Sizda nimani qadrlayman"],
      ["U oilasi haqida, hammasi qanday boshlangani haqida nimalar aytib beradi?", "Sizning hikoyangiz"],
    ],
  },
  {
    key: "thanks",
    title: "Rahmat va tilaklar",
    epigraph: "Rahbarga «rahmat» kamdan-kam ovoz chiqarib aytiladi — shu yerda aytamiz.",
    questions: [
      ["Unga nimalar uchun minnatdorsiz?", "Sizga rahmat…"],
      ["Unga nimani aytmoqchi edingiz, lekin imkon bo‘lmadi?", "Aytolmagan gapim"],
      ["Unga nimalarni tilaysiz — ishda, oilada, hayotda?", "Tilaklarim"],
      ["O‘zingizdan va jamoadan unga nimani va’da qilasiz?", "Bizning va’damiz"],
      ["Unga butun qalbingiz bilan xat yozing.", "Sizga xat"],
    ],
  },
];
