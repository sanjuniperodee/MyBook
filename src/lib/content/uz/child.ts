import type { ChapterDef } from "../types";

// Qizga yoki o‘g‘lga bag‘ishlangan kitob — ona yoki otadan. […|…] — bola: [o‘g‘il|qiz].
// Bob kalitlari va savollar soni rus nusxasi bilan bir xil.

export const childChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "So‘z boshi o‘rnida",
    epigraph: "Sen — hayotimda bo‘lgan eng yaxshi hikoyasan.",
    questions: [
      [
        "O‘zingizni tanishtiring: siz unga kimsiz va nega bu kitobni yozmoqchi bo‘ldingiz?",
        "Nega bu kitobni yozyapman",
        "Bir-ikki iliq jumla: kitob qaysi munosabat bilan — tug‘ilgan kun, bitiruv kechasi, voyaga yetish, to‘y.",
      ],
      ["Uni uchta so‘z bilan ta’riflang.", "Sen uchta so‘zda"],
      ["Uni erkalab qanday chaqirasiz? Bu laqablar qayerdan paydo bo‘lgan?", "Seni qanday chaqiraman"],
      ["U hozir necha yoshda va shu yoshda qanday?", "Hozirgi sen"],
    ],
  },
  {
    key: "waiting",
    title: "Seni kutganimizda",
    questions: [
      ["Farzandli bo‘lishingizni qanday bildingiz? Nimani his qildingiz?", "Sen haqingda bilgan kunim"],
      ["O‘z farzandingizni qanday tasavvur qilgan edingiz?", "Seni qanday tasavvur qilgan edim"],
      ["Ism qanday tanlandi? U nimani anglatadi?", "Isming"],
      ["Uning dunyoga kelishiga qanday tayyorlandingiz — nima sotib oldingiz, nimalar tayyorladingiz, kim hammadan ko‘p hayajonlandi?", "Biz tayyorlandik"],
      ["U tug‘ilgan kun qanday o‘tdi?", "Sen tug‘ilgan kun"],
      ["Uni birinchi marta qo‘lingizga olganingizda nimani his qildingiz?", "Birinchi uchrashuvimiz"],
    ],
  },
  {
    key: "baby",
    title: "Dastlabki yillaring",
    questions: [
      ["U butunlay kichkina paytida qanday edi? Qanday uxlar, ovqatlanar, injiqlik qilar edi?", "Sen kichkinaligingda"],
      ["Birinchi tabassumi, birinchi so‘zi, birinchi qadamlari esingizdami?", "Birinchi tabassum, birinchi so‘z"],
      ["U qaysi o‘yinchoq, ertak yoki qo‘shiqni hammadan ko‘p yaxshi ko‘rar edi?", "Sevimli ertaging"],
      ["Bolaligida u qanday kulgili so‘z va iboralar aytar edi?", "Sening so‘zchalaring"],
      ["Uning erta bolaligidagi qaysi voqeani hammaga aytib berasiz?", "Hammaga aytadigan hikoyam"],
      ["Uyqusiz tunlar esingizdami? Nima uchun uxlay olmadingiz va nima yordam berdi?", "Uyqusiz tunlar"],
      ["O‘shanda oilada qanday odatlar paydo bo‘ldi — uxlashdan oldin, dam olish kunlari?", "Bizning odatlarimiz"],
    ],
  },
  {
    key: "growing",
    title: "Sen ulg‘ayyapsan",
    questions: [
      ["Uning bog‘chadagi yoki maktabdagi birinchi kuni qanday o‘tdi?", "Birinchi sinfga birinchi marta"],
      ["U turli yillarda nimalarga qiziqdi?", "Qiziqishlaring"],
      ["Uning qaysi do‘stlari sizga yodda qoldi?", "Do‘stlaring"],
      ["Uning qaysi qilig‘i sizni hayratga soldi yoki ta’sirlantirdi?", "Meni hayratga solganing"],
      ["Qachon u bilan ayniqsa faxrlandingiz?", "Men sen bilan faxrlanganim"],
      ["U qanday qiyinchiliklarni yengdi? Siz yonida qanday bo‘ldingiz?", "Sen uddalading"],
      ["U bilan eng kulgili qanday voqea yuz berdi?", "Eng kulgili voqea"],
      ["O‘smirligida u qanday edi? Nima qiyin bo‘ldi — unga ham, sizga ham?", "Sen — o‘smirsan"],
    ],
  },
  {
    key: "family",
    title: "Bizning oilamiz",
    questions: [
      ["U qaysi oilaviy an’analarni hammadan ko‘p yaxshi ko‘radi?", "An’analarimiz"],
      ["Birga qayerlarga bordingiz? Qaysi sayohat hammadan ko‘p esda qoldi?", "Sayohatlarimiz"],
      ["Uning qaysi tug‘ilgan kuni yoki bayrami sizga hammadan yaxshi esda?", "O‘sha bayram"],
      ["Ikkingiz ham yoqtiradigan qanday umumiy mashg‘ulot bor?", "Umumiy ishimiz"],
      ["Unda sizdan nima bor, nimasi esa butunlay o‘ziga xos?", "Sen menga o‘xshaysan — va o‘xshamaysan"],
      ["U sizning o‘zingizga nimani o‘rgatdi?", "Sen menga nimani o‘rgatding"],
    ],
  },
  {
    key: "you",
    title: "Sen — mening ko‘zim bilan",
    questions: [
      ["U qanday inson — qanday xarakter, qanday yurak?", "Sen qanday insonsan"],
      ["Unda nimani hammadan ko‘p qadrlaysiz?", "Senda nimani qadrlayman"],
      ["Uning qanday iste’dodi bor — hammaga ko‘rinadimi yoki faqat sizga ma’lummi?", "Iste’doding"],
      ["Uning qaysi odati sizni ta’sirlantiradi?", "Odating"],
      ["Uning qaysi iboralari oilada mashhur bo‘lib ketdi?", "Iboralaring"],
    ],
  },
  {
    key: "advice",
    title: "Senga nimani aytmoqchiman",
    questions: [
      ["Unga qanday asosiy maslahat bermoqchisiz?", "Asosiy maslahatim"],
      ["Hayot haqida unga asqotadigan qanday narsani tushunib yetdingiz?", "Hayot haqida tushunganim"],
      ["Qaysi xatolaringizni u takrorlamasligini istardingiz?", "Xatolarim"],
      ["Unga sevgi va oila haqida nima demoqchisiz?", "Sevgi haqida"],
      ["Ildizlaringiz — buvilar, bobolar, urug‘ haqida unga nima aytib berasiz?", "Biz qayerdanmiz"],
      ["Unga qiyin bo‘lgan paytda nima demoqchi edingiz?", "Qiyin bo‘lganda"],
    ],
  },
  {
    key: "future",
    title: "Oldinda",
    questions: [
      ["U uchun nimani orzu qilasiz?", "Sen haqingdagi orzularim"],
      ["Uni o‘n yildan keyin qanday ko‘rasiz?", "Sen o‘n yildan keyin"],
      ["Birga nimani albatta qilmoqchisiz?", "Birga nima qilamiz"],
      ["Unga nimani va’da qilasiz?", "Va’dam"],
    ],
  },
  {
    key: "thanks",
    title: "Borliging uchun rahmat",
    questions: [
      ["U uchun nimaga minnatdorsiz?", "Senga rahmat…"],
      ["Nima bo‘lmasin, u nimani doim bilishi kerak?", "Nimani doim bilishing kerak"],
      ["Uni nima uchun sevasiz? Sabablarni sanab chiqing.", "Seni nima uchun sevaman"],
      ["[O‘g‘lingizga|Qizingizga] butun qalbingizdan xat yozing.", "Senga xat"],
    ],
  },
];
