import type { ChapterDef } from "../types";

// Do‘stga bag‘ishlangan kitob. Uzbek tilida jins ko‘rsatkichlari kerak emas.

export const friendChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "So‘z boshi o‘rnida",
    epigraph: "Do‘st — sen haqingda hamma narsani biladigan va baribir yoningda bo‘ladigan kishi.",
    questions: [
      [
        "O‘zingizni tanishtiring: siz kimsiz va nega bu kitobni do‘stingiz uchun yozmoqchi bo‘ldingiz?",
        "Nega bu kitobni yozyapman",
        "Bir-ikki iliq jumla: siz kimsiz va bu kitob qaysi munosabat bilan.",
      ],
      ["Uni uchta so‘z bilan ta’riflang.", "Sen uchta so‘zda"],
      ["Necha yildan beri do‘stsiz? Shu vaqt ichida nima o‘zgardi?", "Do‘stligimiz necha yil"],
      ["Bir-biringizga qanday laqablar qo‘ygansiz?", "Laqablarimiz"],
    ],
  },
  {
    key: "meet",
    title: "Qanday do‘st bo‘ldik",
    questions: [
      ["Qanday va qayerda tanishdingiz?", "Qanday tanishdik"],
      ["U sizda qanday dastlabki taassurot qoldirdi?", "Birinchi taassurotim"],
      ["Bu haqiqiy do‘stlik ekanini qachon tushundingiz?", "Do‘st ekanimizni tushunganim"],
      ["Qaysi lahza sizni chinakam yaqin qildi?", "Bizni yaqinlashtirgan lahza"],
      ["Sizni nima birlashtirdi?", "Bizni nima birlashtirdi"],
      ["Endigina tanishgan paytingizda u qanday edi?", "Sen o‘shanda va hozir"],
    ],
  },
  {
    key: "you",
    title: "Sen — mening nigohimda",
    questions: [
      ["U qanday do‘st?", "Sen qanday do‘stsan"],
      ["Unda nimani hammadan ko‘p qadrlaysiz?", "Senda nimani qadrlayman"],
      ["Uning qaysi iboralarini takrorlab turasiz?", "Iboralaring"],
      ["U sizni nimasi bilan hayratga soladi?", "Nima bilan hayratga solasan"],
      ["Uning qanday iste’dodi bor?", "Iste’doding"],
      ["U nimani hammadan yaxshi qiladi?", "Sen hammadan yaxshi…"],
      ["Uning qaysi odati sizni kuldiradi?", "Odating"],
      ["Qachon u bilan faxrlandingiz?", "Men sen bilan faxrlanganim"],
    ],
  },
  {
    key: "adventures",
    title: "Sarguzashtlarimiz",
    questions: [
      ["Eng telba sarguzashtingiz qaysi?", "Telba sarguzashtimiz"],
      ["Birga qayerlarga bordingiz?", "Safarlarimiz"],
      ["Qaysi bazm yoki bayram hammadan ko‘p esda qoldi?", "Esimda qolgan bayram"],
      ["Nima rejadagidek bo‘lmadi, ammo ajoyib hikoyaga aylandi?", "Hammasi rejadagidek bo‘lmadi"],
      ["Qaysi joyni «sizniki» deb bilasiz?", "Bizning joyimiz"],
      ["Birga qanday musiqa tinglardingiz?", "Bizning qo‘shiqlarimiz"],
      ["Sizlarda qanday umumiy an’analar bor?", "An’analarimiz"],
      ["Qaysi sarguzashtni anchadan beri amalga oshirmoqchisiz?", "Kelajak sarguzashti"],
    ],
  },
  {
    key: "fun",
    title: "Kulgili voqealar",
    questions: [
      ["Birga bo‘lganingizda eng kulgili qanday voqea yuz berdi?", "Eng kulgili voqea"],
      ["Faqat sizlargagina tushunarli qanday hazillaringiz bor?", "O‘zimizning hazillar"],
      ["Birga boshingizdan o‘tkazgan eng bema’ni lahza qaysi?", "Bema’ni lahza"],
      ["Nimadan ko‘zingizdan yosh chiqquncha kuldingiz?", "Yig‘lagunimizcha kulganimiz"],
      ["Uning qaysi qilig‘ini unga hech qachon unutdirmaysiz?", "Buni senga hali eslataman"],
    ],
  },
  {
    key: "support",
    title: "Yonimda",
    questions: [
      ["Qiyin damda u sizni qanday qo‘llab-quvvatladi?", "Sen yonimda bo‘lganingda"],
      ["Uning qaysi maslahati esingizda?", "Maslahating"],
      ["Bir-biringizga qanday sirlaringizni ishonib topshirgansiz (tafsilotsiz)?", "Sirlarimiz"],
      ["Janjaldan keyin yanada yaqinlashgan paytingiz bo‘ldimi?", "Bizni yaqinlashtirgan janjal"],
      ["Undan nimani o‘rgandingiz?", "Sendan nimani o‘rgandim"],
      ["Yillar o‘tishi bilan do‘stligingiz qanday o‘zgardi?", "Do‘stligimiz qanday o‘zgardi"],
    ],
  },
  {
    key: "future",
    title: "Oldinda",
    questions: [
      ["Umumiy orzularingiz qanday?", "Orzularimiz"],
      ["Do‘stligingizni o‘n yildan keyin qayerda ko‘rasiz?", "Biz o‘n yildan keyin"],
      ["Birga albatta nimani qilishingiz kerak?", "Ikkimizning ishlar ro‘yxati"],
      ["Unga nimani va’da qilasiz?", "Va’dam"],
    ],
  },
  {
    key: "thanks",
    title: "Rahmat",
    questions: [
      ["U uchun nimaga minnatdorsiz?", "Senga rahmat…"],
      ["U nimani bilishini istardingiz?", "Nimani bilishing kerak"],
      ["Uni nima uchun yaxshi ko‘rasiz? Sabablarni sanab chiqing.", "Seni nima uchun yaxshi ko‘raman"],
      ["Do‘stingizga butun qalbingizdan xat yozing.", "Senga xat"],
    ],
  },
];
