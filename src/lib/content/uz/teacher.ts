import type { ChapterDef } from "../types";

// Ustozga bag‘ishlangan kitob — o‘quvchi, bitiruvchi, ota-ona yoki butun sinfdan.
// Sarlavhalarda ustozga xat kabi «Siz» deb, bosh harf bilan murojaat qilinadi.

export const teacherChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "So‘z boshi o‘rnida",
    epigraph: "Ustoz — sendagi o‘zing ko‘rganingdan ko‘proq narsani ko‘ra oladigan kishi.",
    questions: [
      [
        "O‘zingizni tanishtiring: siz kimsiz — uning o‘quvchisi, bitiruvchisi, ota-onasi yoki butun sinfmi — va nega bu kitobni yozmoqchi bo‘ldingiz?",
        "Nega bu kitob",
        "Bir-ikki iliq jumla: kim yozyapti va qaysi munosabat bilan — Ustozlar kuni, bitiruv, yubiley.",
      ],
      ["Unga qanday murojaat qilasiz? Uning sizlar biladigan — yoki bilmaydigan — laqabi bormi?", "Biz Sizni qanday chaqiramiz"],
      ["Uni uchta so‘z bilan ta’riflang.", "Siz uchta so‘zda"],
      ["U qaysi fandan dars beradi va necha yildan beri tanishsiz?", "Sizning faningiz va bizning yillarimiz"],
    ],
  },
  {
    key: "meet",
    title: "Birinchi uchrashuv",
    questions: [
      ["U bilan birinchi dars yoki birinchi uchrashuv esingizdami? Qanday edi?", "Birinchi dars"],
      ["U sizda qanday dastlabki taassurot qoldirdi?", "Birinchi taassurot"],
      ["O‘shanda u qanday edi — ovozi, nigohi, o‘zini tutishi?", "O‘shanda Siz qanday edingiz"],
      ["Uning sinfiga tushishingizdan oldin u haqida nima eshitgan edingiz?", "Siz haqingizda nima derdilar"],
      ["Bu alohida ustoz ekanini qachon tushundingiz?", "Siz alohida ustoz ekaningizni tushunganim"],
    ],
  },
  {
    key: "lessons",
    title: "Sizning darslaringiz",
    questions: [
      ["Uning darsi qanday o‘tardi? Eng oddiy darsni tasvirlab bering.", "Sizning darsingiz"],
      ["Qaysi dars hozirgacha esingizda?", "Esimda qolgan dars"],
      ["U murakkab narsalarni qanday tushuntirardiki, hammasi tushunarli bo‘lib qolardi?", "Siz qanday tushuntirardingiz"],
      ["Uning qaysi iboralari va so‘zchalarini butun sinf bilardi?", "Sizning iboralaringiz"],
      ["U baholarni qanday qo‘yar va uy vazifalarini qanday tekshirardi? Daftarlarga nima yozardi?", "Qizil ruchka bilan"],
      ["Faqat uning darslarida qanday an’ana yoki rasm-rusm bor edi?", "An’analarimiz"],
      ["Qaysi topshiriq, loyiha yoki olimpiada hammadan ko‘p esda qoldi?", "Esimda qolgan topshiriq"],
      ["U tartibni qanday saqlardi — qattiqqo‘llik, hazil yoki bitta nigoh bilanmi?", "Sizning bitta nigohingiz"],
    ],
  },
  {
    key: "portrait",
    title: "Siz o‘quvchilaringiz nigohida",
    questions: [
      ["U qanday ustoz? Boshqalardan nimasi bilan farq qilardi?", "Siz qanday ustozsiz"],
      ["Unda nimani hammadan ko‘p qadrlaysiz?", "Sizda nimani qadrlayman"],
      ["Dars tashqarisida — tanaffuslarda, sayohatlarda, bayramlarda — u qanday bo‘ladi?", "Dars tashqarisida"],
      ["U nimaga qiziqadi? Uning haqida darslikdan tashqari nimalarni bildingiz?", "Darslikdan tashqari"],
      ["Uning qaysi odati yoki xislati hammaga yodda qoldi?", "Sizning odatingiz"],
      ["Uning xonasi qanday edi? Devorlarda nima osilgan, stolda nima turardi?", "Sizning xonangiz"],
      ["Qachon u bilan faxrlandingiz?", "Biz Siz bilan faxrlanganimiz"],
    ],
  },
  {
    key: "class",
    title: "Bizning sinfimiz",
    questions: [
      ["Sinfingiz qanday edi? U o‘zi uni qanday ta’riflagan bo‘lardi?", "Bizning sinfimiz"],
      ["Uning darsida eng kulgili qanday voqea yuz berdi?", "Eng kulgili dars"],
      ["Sinfning qaysi sho‘xligini u kechirdi — yoki hech qachon bilmay qoldi?", "Bizning sho‘xligimiz"],
      ["U bilan birga qaysi bayram, yurish yoki sayohatni eslaysiz?", "Birgalikda"],
      ["U sinfni qanday yarashtirar va janjallarni hal qilishga qanday yordam berardi?", "Siz bizni qanday yarashtirardingiz"],
      ["Sinfda u haqida esdalik sifatida nima qoldi: suratlar, faxriy yorliqlar, qo‘shiq, hazillar?", "Bizda nima qoldi"],
    ],
  },
  {
    key: "support",
    title: "Yonimizda",
    questions: [
      ["Qiyin damda u sizni qanday qo‘llab-quvvatladi?", "Siz yonimda bo‘lganingizda"],
      ["O‘zingizga ishonmay turganingizda u sizga qanday ishondi?", "Siz menga ishondingiz"],
      ["Uning qaysi maslahati hozirgacha esingizda?", "Sizning maslahatingiz"],
      ["U qattiqqo‘l bo‘lgan, keyin buning to‘g‘ri ekanini tushungan holat bo‘ldimi?", "Qattiqqo‘llik uchun rahmat"],
      ["U o‘z ishidan tashqari sizga yoki sinfga nima qildi?", "Ishdan ko‘proq"],
    ],
  },
  {
    key: "legacy",
    title: "Siz bizga nima berdingiz",
    questions: [
      ["U sizga fanidan tashqari nimani o‘rgatdi?", "Siz menga nimani o‘rgatdingiz"],
      ["U kasb yoki yo‘l tanlashingizga qanday ta’sir qildi?", "Mening yo‘lim Sizdan boshlangan"],
      ["Uning darslaridan nimasi hozirgacha asqotadi?", "Hayotda asqotdi"],
      ["Uning qaysi so‘zlarini farzandlaringizga aytib berardingiz?", "Aytib beradigan so‘zlarim"],
      ["Uning o‘quvchilari kim bo‘ldi? U faxrlanishi mumkin bo‘lgan bitiruvchilar haqida gapirib bering.", "Sizning bitiruvchilaringiz"],
      ["U sizni inson sifatida nimaga o‘zgartirdi?", "Siz tufayli qanday inson bo‘ldim"],
    ],
  },
  {
    key: "thanks",
    title: "Rahmat",
    questions: [
      ["U uchun nimaga minnatdorsiz?", "Sizga rahmat…"],
      ["Unga nimani aytmoqchi edingiz, lekin aytmay qoldingiz?", "Aytolmagan gapim"],
      ["Uning bitta darsiga qaytish mumkin bo‘lsa — qaysi birini tanlardingiz?", "Yana bitta dars"],
      ["Unga ish va hayotda nimalar tilaysiz?", "Tilaklarimiz"],
      ["O‘z ustozingizga butun qalbingizdan xat yozing.", "Sizga xat"],
    ],
  },
];
