import type { ChapterDef } from "../types";

// Oilaga atalgan kitob — yaqinlardan biridan. Oluvchi — butun oila, shuning uchun [..|..] kerak emas.
// Bob kalitlari va savollar soni rus tilidagi nusxa bilan bir xil.

export const familyChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "So‘zboshi o‘rniga",
    epigraph: "Oila — boshlanish va tayanch.",
    questions: [
      [
        "O‘zingizni tanishtiring: siz kimsiz va oilangiz haqida kitob yozishga nega qaror qildingiz?",
        "Bu kitobni nega yozyapman",
        "Bir-ikki iliq gap: siz kimsiz, bu kitob qanday munosabat bilan yozilmoqda va nimani saqlab qolmoqchisiz.",
      ],
      ["Oilangizni uch so‘z bilan ta’riflang.", "Biz uch so‘zda"],
      ["Sizlar nechtasiz — ota-onalar, bolalar, buvi va bobolar? Kim kimligini aytib bering.", "Kim kim"],
      ["Uyda sizlarni qanday atashadi? Erkalatma ismlar qayerdan kelib chiqqan?", "Bizning erkalatma ismlarimiz"],
    ],
  },
  {
    key: "roots",
    title: "Ildizlar va urug‘",
    epigraph: "Ildiz daraxtni ushlab turadi, urug‘ esa insonni.",
    questions: [
      ["Oilangiz qayerlik? Qaysi joyni o‘zingizniki deb bilasiz?", "Biz qayerdanmiz"],
      ["Katta buvi va katta bobolaringiz haqida nimalarni bilasiz?", "Katta buvi va katta bobolar"],
      ["Familiyangiz qayerdan kelib chiqqan va u nimani anglatadi?", "Bizning familiyamiz"],
      ["Oilada ajdodlar haqida qanday hikoyalar aytiladi?", "Oilaviy rivoyatlar"],
      ["Oilangiz hozir yashayotgan joyga qanday kelib qolgan?", "Biz bu yerga qanday kelganmiz"],
      ["Qarindoshlardan kimni alohida iliqlik bilan eslaysiz?", "Iliq ismlar"],
    ],
  },
  {
    key: "home",
    title: "Bizning uy",
    epigraph: "Uy — devorlar emas, undagi insonlardir.",
    questions: [
      ["O‘sgan uyingiz qanday edi — qayerda turardi, xonangiz qanday edi?", "Bizning uy"],
      ["Uyda nima hidlanardi? Qanday tovushlar, buyumlar va hidlar esingizda?", "Bolalik hidlari"],
      ["Oilaviy dasturxon bayramlarda va oddiy kunlarda qanday ko‘rinardi?", "Bizning dasturxon"],
      ["Uyingizda eng muhim qoida qaysi edi?", "Asosiy qoida"],
      ["Oilada kim nimaga javobgar edi — xo‘jalik, bayramlar, pul masalalarida?", "Kim nimaga javobgar edi"],
      ["Uyning yoki hovlining qaysi burchagi sizning sevimlingiz edi?", "Mening sevimli burchagim"],
    ],
  },
  {
    key: "traditions",
    title: "An’analar va bayramlar",
    epigraph: "An’ana — takrorlanadigan xotira.",
    questions: [
      ["Oilada qaysi bayramlar albatta nishonlanadi?", "Bizning bayramlarimiz"],
      ["Navro‘z yoki sizga ayniqsa aziz boshqa bayram qanday o‘tadi?", "Sevimli bayram"],
      ["Dasturxonda nimalar albatta bo‘ladi? Oilaviy retsept kimda saqlanadi?", "Bizning dasturxon"],
      ["Oilada qanday urf-odat va marosimlarga rioya qilinadi?", "Bizning urf-odatlarimiz"],
      ["Sizlarda mehmonlarni qanday kutib olish odat bo‘lgan?", "Uydagi mehmonlar"],
      ["Oilaviy an’analardan qaysilarini saqlab qolmoqchisiz?", "Nimani saqlab qolamiz"],
    ],
  },
  {
    key: "people",
    title: "Yaqinlarimiz",
    questions: [
      ["Oilada kimni uning yuragi deb bilasiz? Nega?", "Oilaning yuragi"],
      ["Oilaviy albomdagi qaysi suratlar eng muhim?", "Asosiy suratlar"],
      ["Oilada kim boshqalar uddalay olmaydigan ishni qiladi — non yopish, tuzatish, ko‘ngilni ko‘tarish?", "Oltin qo‘llar"],
      ["Aka-uka va opa-singillaringiz kimlar? Birga qanday ulg‘aygansiz?", "Bizning bolaligimiz"],
      ["Oilada kimga va nimada o‘xshaysiz?", "Bizning o‘xshashliklarimiz"],
      ["Oiladan kimlar endi biz bilan yo‘q? Ular haqida nimalarni eslaysiz?", "Eslaydigan insonlarimiz"],
      ["Oilangiz nima bilan faxrlanadi?", "Bizning faxrimiz"],
    ],
  },
  {
    key: "lessons",
    title: "Oila nimaga o‘rgatadi",
    questions: [
      ["Kattalar sizga so‘z bilan emas, amalda nimani o‘rgatgan?", "Kattalar menga o‘rgatgan"],
      ["Oilada olgan qaysi maslahat hozir ham esingizda?", "Oilaviy maslahat"],
      ["Oilangizda or-nomus va so‘z haqida nima deyishadi?", "Or-nomus va so‘z haqida"],
      ["Sizlarda pul va ish haqida qanday gaplashish odat bo‘lgan?", "Pul va ish haqida"],
      ["Oilada qiyin paytda bir-biriga qanday suyanishadi?", "Yonma-yon turgan yelka"],
      ["Bu saboqlardan qaysilarini farzandlaringizga berasiz?", "Farzandlarimga nimani beraman"],
    ],
  },
  {
    key: "hard",
    title: "Qiyin davrlar",
    questions: [
      ["Oilangiz boshiga qanday sinovlar tushgan?", "Bizning sinovlarimiz"],
      ["Ularni engib o‘tishga kim yordam bergan?", "Kim yordam bergan"],
      ["Shundan keyin nima o‘zgardi?", "Nima o‘zgardi"],
      ["Oilada kimning qilmishini hech qachon unutmaysiz?", "Eslab yurgan qilmish"],
      ["Bu yillar oilaga nimani o‘rgatdi?", "Biz nimani o‘rgandik"],
    ],
  },
  {
    key: "thanks",
    title: "Rahmat",
    epigraph: "Eng qadrli gapni ko‘pincha ovoz chiqarib aytmaymiz.",
    questions: [
      ["Oilangizga nima uchun minnatdorsiz?", "Oilaga rahmat…"],
      ["Yaqinlaringizga nimani aytmoqchi bo‘lgansiz-u, aytmagansiz?", "Aytmaganlarim"],
      ["Bizdan keyin keladiganlar uchun nimani saqlab qolmoqchisiz?", "Bizdan keyingilar uchun"],
      ["Oilaga nimani va’da qilasiz?", "Mening va’dam"],
      ["Oiladagi har biriga nima tilaysiz?", "Mening tilaklarim"],
      ["Oilangizga butun yuragingiz bilan xat yozing.", "Oilaga xat"],
    ],
  },
];
