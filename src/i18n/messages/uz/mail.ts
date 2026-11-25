import type { mail as ru } from "../ru/mail";
import { uzCount } from "../../plural";

/**
 * Письма клиентам на узбекском (латиница). Пользовательские данные экранирует вызывающий код; HTML-разметка допускается.
 */
const answers = (n: number) => uzCount(n, "ta javob");
const words = (n: number) => uzCount(n, "ta so‘z");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const mail: typeof ru = {
  hello: (name: string) => `Assalomu alaykum${name ? `, ${name}` : ""}!`,
  helpFootnote: "Yordam kerak bo‘lsa — shu xatga javob yozing.",
  unsubscribe: "Bunday xatlarni yubormaslik",
  reset: {
    subject: "Parolni tiklash",
    title: "Parolni tiklash",
    text: "Yangi parol o‘rnatish uchun quyidagi tugmani bosing. Havola 1 soat amal qiladi.",
    button: "Yangi parol o‘rnatish",
    footnote: "Agar siz parolni tiklashni so‘ramagan bo‘lsangiz, bu xatni e’tiborsiz qoldiring.",
  },
  lifecycle: {
    chat: {
      deadline: (book: string, until: string, url: string) => `«${book}» kitobi o‘z vaqtida yetib borishi uchun buyurtmani ${until} rasmiylashtiring. Ulgurmasangiz — ekspress bosmani qo‘shing, u navbatsiz bosiladi. Kitob shu yerda: ${url}`,
      deadlinePremium: (book: string, until: string, url: string) => `Oddiy ishlab chiqarish bayramga endi ulgurmaydi, ammo ekspress bosma navbatsiz bosiladi: buyurtmani ${until} rasmiylashtiring, «${book}» kitobi o‘z vaqtida yetib boradi. Kitob shu yerda: ${url}`,
      almost: (book: string, url: string) => `«${book}» kitobi deyarli tayyor. Maketni varaqlab chiqing — sahifalar aynan bosiladigan ko‘rinishda terilgan. Hammasi yoqsa, buyurtma bering: ${url}`,
      unpaid: (n: number, amount: string, url: string) => `${amount} miqdoridagi №${n} buyurtma rasmiylashtirilgan, lekin hali to‘lanmagan. To‘lov kelishi bilan kitob bosmaga ketadi: ${url}\nTo‘lovda qiyinchilik bo‘lsa — shu yerga yozing, yordam beramiz.`,
      review: (percent: number, url: string) => `Kitob yoqdimi? Iltimos, sharh qoldiring — bu bir daqiqa oladi, minnatdorchilik sifatida esa keyingi kitobga ${percent} foizli promokod yuboramiz: ${url}`,
    },
    deadline: {
      subject: (occasion: string, until: string) => `«${occasion}» bayramiga ulgurish uchun kitobga ${until} buyurtma bering`,
      title: (untilOccasion: string, when: string) => `${cap(untilOccasion)} ${when}`,
      premium: (book: string, until: string) => `Oddiy ishlab chiqarish endi ulgurmaydi, ammo ekspress bosma navbatsiz bosiladi — buyurtmani <b>${until}</b> rasmiylashtiring, «${book}» kitobi o‘z vaqtida yetib boradi.`,
      normal: (book: string, until: string) => `«${book}» kitobi o‘z vaqtida yetib borishi uchun buyurtmani <b>${until}</b> rasmiylashtiring. Ulgurmasangiz — ekspress bosmani qo‘shing: u navbatsiz bosiladi.`,
      ready: (n: number) => `Kitobda allaqachon ${answers(n)} bor — maketni ko‘ring: balki u allaqachon tayyordir.`,
      readyWords: (n: number) => `Kitobda allaqachon ${words(n)} bor — maketni ko‘ring: balki u allaqachon tayyordir.`,
      short: "15–20 ta qisqa javobning o‘zi ta’sirchan kitobga aylanadi — bu bir necha kechalik ish.",
      shortWords: "Boshlash uchun ming so‘zning o‘zi yetarli — bu bir necha kechalik ish.",
      preview: "Maketni ko‘rish",
      continue: "Kitobni davom ettirish",
    },
    almost: {
      subject: (book: string) => `«${book}» kitobi deyarli tayyor`,
      title: "Kitobingiz deyarli tayyor",
      text: (book: string, n: number) => `«${book}» kitobida allaqachon ${answers(n)} bor — bu to‘laqonli kitob. Maketni varaqlab chiqing: sahifalar aynan bosiladigan ko‘rinishda terilgan.`,
      textWords: (book: string, n: number) => `«${book}» kitobida allaqachon ${words(n)} bor — bu to‘laqonli kitob. Maketni varaqlab chiqing: sahifalar aynan bosiladigan ko‘rinishda terilgan.`,
      next: "Hammasi yoqsa — buyurtma bering, bir necha kundan keyin kitob qo‘lingizda bo‘ladi.",
      button: "Maketni ko‘rish",
    },
    start: {
      subject: "Kitobni nimadan boshlash kerak: uchta maslahat",
      title: "Qanday boshlashni bilmasangiz",
      intro: (book: string) => `«${book}» kitobi birinchi satrlarini kutmoqda. O‘z kitobini yozib bo‘lganlardan uchta maslahat:`,
      tips: [
        "<b>1. Tartib bilan emas.</b> Javobi darhol esingizga keladigan savoldan boshlang — qolganlari o‘zi ergashadi.",
        "<b>2. Do‘stingizga choy ustida aytgandek.</b> Chiroyli yozish shart emas — ovoz chiqarib aytganingizdek yozing. Hatto ovozingiz bilan aytib yozdirsangiz ham bo‘ladi.",
        "<b>3. 10 daqiqadan.</b> Kuniga ikki-uch javob — va ikki haftadan keyin kitob tayyor.",
      ],
      button: "Birinchi savolga javob berish",
      autobiography: {
        intro: (book: string) => `«${book}» kitobi sizning birinchi xotiralaringizni kutmoqda. O‘z hikoyasini yozib qoldirganlardan uchta maslahat:`,
        tips: [
          "<b>1. Oson esga tushganidan boshlang.</b> Albatta bolalikdan boshlash shart emas: javobi darhol esingizga keladigan savolni oling — qolganlari o‘zi ergashadi.",
          "<b>2. Nevaralaringizga aytib berganingizdek.</b> Chiroyli yozish shart emas — ovoz chiqarib aytganingizdek yozing. Yozish qiyin bo‘lsa, yaqiningiz hikoyangizni sizning so‘zlaringizdan yozib olsin: kitob birinchi shaxs nomidan qoladi.",
          "<b>3. 10 daqiqadan.</b> Kuniga ikki-uch javob — va ikki haftadan keyin kitob tayyor.",
        ],
        button: "Birinchi savolga javob berish",
      },
      blank: {
        intro: (book: string) => `«${book}» kitobi birinchi satrlarini kutmoqda. O‘z kitobini yozib bo‘lganlardan uchta maslahat:`,
        tips: [
          "<b>1. Istalgan bo‘limdan.</b> Tartib bilan yozish shart emas: aytgingiz kelgan mavzudan boshlang, bob va bo‘limlarni keyin qo‘shish va joyini almashtirish mumkin.",
          "<b>2. Sarlavha va bir-ikki xatboshi.</b> Bo‘limga nom bering va erkin yozing. Birinchi variant mukammal bo‘lishi shart emas — keyin tuzatasiz.",
          "<b>3. 10 daqiqadan.</b> Kuniga bitta bo‘lim — va bir necha haftadan keyin kitob tayyor.",
        ],
        button: "Birinchi bo‘limni yozish",
      },
    },
    nudge: {
      subject: (book: string) => `«${book}» kitobingiz davomini kutmoqda`,
      title: "Kitobingiz davomini kutmoqda",
      text: (n: number) => `Kitobda allaqachon ${answers(n)} bor — yaxshi boshlanish. Kechqurun bir-ikki javobning o‘zi uni boyitadi.`,
      textWords: (n: number) => `Kitobda allaqachon ${words(n)} bor — yaxshi boshlanish. Kechqurun bitta bo‘limning o‘zi uni boyitadi.`,
      autosave: "Barcha javoblar avtomatik saqlanadi, telefondan ham yozish mumkin.",
      button: "Kitobni davom ettirish",
    },
    unpaid: {
      subject: (n: number) => `№${n} buyurtma to‘lovni kutmoqda`,
      title: "Buyurtma to‘lovni kutmoqda",
      text: (n: number, amount: string) => `${amount} miqdoridagi №${n} buyurtma rasmiylashtirilgan, lekin hali to‘lanmagan. To‘lov kelishi bilan kitob bosmaga ketadi.`,
      help: "To‘lovda qiyinchilik bo‘lsa — shu xatga javob yozing, yordam beramiz.",
      button: "To‘lovga o‘tish",
    },
    review: {
      subject: "Kitob yoqdimi?",
      title: "Kitob yoqdimi?",
      text: "Sovg‘a o‘zgacha chiqdi degan umiddamiz. Topshirish qanday o‘tganini aytib bering — bu bir daqiqa oladi, sharhingiz esa boshqalarga ham o‘z kitobini yozishga jur’at etishga yordam beradi. Surat ham ilova qilishingiz mumkin.",
      thanks: (percent: number) => `Har qanday sharh uchun minnatdorchilik sifatida keyingi kitobga ${percent} foizli promokod beramiz.`,
      textAutobiography: "Kitob siz o‘ylaganingizdek chiqdi degan umiddamiz. Yaqinlaringiz uni o‘qigach nima deganini aytib bering — bu bir daqiqa oladi, sharhingiz esa boshqalarga ham o‘z hikoyasini yozib qoldirishga jur’at etishga yordam beradi. Surat ham ilova qilishingiz mumkin.",
      textBlank: "Kitob siz o‘ylaganingizdek chiqdi degan umiddamiz. Natija sizga qanday ko‘ringanini aytib bering — bu bir daqiqa oladi, sharhingiz esa boshqalarga ham o‘z kitobini yozishga jur’at etishga yordam beradi. Surat ham ilova qilishingiz mumkin.",
      giftAutobiography: (url: string) => `Onangiz, otangiz, buvingiz yoki bobongizga shunday imkoniyatni sovg‘a qilmoqchimisiz? Ular uchun — <a href="${url}" style="color:#7a1f2b">sovg‘a sertifikati</a>: o‘z hikoyasini o‘zlari yozib qoldiradi.`,
      gift: (url: string) => `Onangiz, otangiz yoki do‘stingizga xuddi shunday kitob sovg‘a qilmoqchimisiz? Ular uchun alohida savollar to‘plami bor, yaqiningiz kitobni o‘zi yozishi uchun esa — <a href="${url}" style="color:#7a1f2b">sovg‘a sertifikati</a>.`,
      button: "Kitobni baholash",
    },
  },
  order: {
    subject: (title: string, n: number) => `${title} — №${n} buyurtma`,
    open: "Buyurtmani ochish",
    paid: {
      title: "Rahmat! To‘lov qabul qilindi",
      text: (n: number, amount: string) => `${amount} miqdoridagi №${n} buyurtma to‘langan.`,
      printed: "Kitobingizni bosmaga tayyorlayapmiz. U jo‘natilishi bilan trek-raqamli xat yuboramiz.",
      digital: "Kitobning elektron nusxasi buyurtma sahifasida yuklab olish uchun allaqachon mavjud.",
    },
    production: { title: "Kitob ishlab chiqarilmoqda", text: "Kitobingiz bosmaga yuborildi. Odatda bu bir necha ish kunini oladi." },
    shipped: { title: "Kitob yo‘lda", text: "Kitobingiz bosildi va yetkazib berishga topshirildi.", tracking: (t: string) => `Trek-raqam: <b>${t}</b>` },
    delivered: { title: "Kitob yetkazib berildi", text: "Sovg‘a o‘zgacha chiqdi degan umiddamiz. Sharhingizni eshitsak xursand bo‘lamiz!", textOwn: "Kitob sizga yoqdi degan umiddamiz. Sharhingizni eshitsak xursand bo‘lamiz!" },
    cancelled: { title: "Buyurtma bekor qilindi", text: "Buyurtma bekor qilindi. Kitobni yana tahrirlash va yangi buyurtma berish mumkin." },
    created: {
      subject: (n: number) => `№${n} buyurtma rasmiylashtirildi`,
      title: "Buyurtma rasmiylashtirildi",
      number: (n: number) => `Buyurtma raqami: <b>№${n}</b>`,
      plan: (plan: string, qty: number) => `Tarif: ${plan}, ${qty} nusxa`,
      prepaid: (paid: string) => `Avval <b>${paid}</b> to‘langan — bu summa hisobga olingan.`,
      amount: (a: string) => `To‘lov summasi: <b>${a}</b>`,
      quoted: (where: string) => `Yetkazib berish (${where}) bu summaga kirmaydi: uning narxi alohida hisoblanadi — menejer manzilingiz bo‘yicha hisoblab, sizga yozadi.`,
      button: "To‘lovga o‘tish",
    },
  },
  /** Письма клиенту о деньгах по договорённости с менеджером (предоплата, доплата, возврат). */
  payment: {
    received: {
      subject: (amount: string) => `To‘lovingiz qabul qilindi — ${amount}`,
      title: "To‘lov qabul qilindi",
      text: (amount: string, deal: number) => `Buyurtmangiz bo‘yicha ${amount} qabul qildik (bitim №${deal}).`,
      left: (amount: string) => `Yana to‘lash kerak: <b>${amount}</b>.`,
      full: "Kelishilgan summa to‘liq to‘langan.",
      next: "Kitobni boshlashingiz mumkin: savollarga javob bering va suratlar qo‘shing — hammasi avtomatik saqlanadi, buyurtmani esa kitob tayyor bo‘lganda rasmiylashtirasiz.",
      button: "Shaxsiy kabinetni ochish",
    },
    refund: {
      subject: (amount: string) => `${amount} qaytarish rasmiylashtirildi`,
      title: "Pul qaytarish rasmiylashtirildi",
      text: (amount: string, deal: number) => `Bitim №${deal} bo‘yicha ${amount} qaytarish rasmiylashtirildi. Pulning tushish muddati bankingizga bog‘liq.`,
    },
  },
  gift: {
    buyer: {
      subject: (n: number) => `№${n} sovg‘a sertifikati tayyor`,
      title: "Sertifikat tayyor",
      paid: (plan: string, recipient: string) => `Rahmat! «${plan}» kitobi uchun sertifikat to‘langan. Oluvchi: ${recipient}.`,
      code: (code: string) => `Kod: <b style="letter-spacing:1px">${code}</b>. Chop etish uchun PDF — ilovada.`,
      later: (email: string, day: string) => `Sertifikatni ${day} kuni ${email} manziliga yuboramiz.`,
      sent: (email: string) => `Sertifikatni ${email} manziliga allaqachon yubordik.`,
      print: "Sertifikatni chop eting yoki PDF faylni yuboring — sovg‘ani topshirish sizga qanday qulay bo‘lsa, shunday.",
      button: "Sertifikatni ochish",
    },
    recipient: {
      subject: (buyer: string) => `${buyer} sizga kitob sovg‘a qilmoqda`,
      title: (recipient: string) => `${recipient}, bu sizga sovg‘a`,
      text: (buyer: string, brand: string, plan: string) =>
        `${buyer} sizga ${brand} sertifikatini sovg‘a qilmoqda — «${plan}» kitobi, uni o‘zingiz yozasiz: iliq savollarga javob berasiz, suratlar qo‘shasiz, biz esa uni haqiqiy nashr kabi terib, bosib beramiz.`,
      code: (code: string) => `Sizning kodingiz: <b style="letter-spacing:1px">${code}</b>`,
      button: "Kitobni boshlash",
      footnote: "Sertifikat bir yil amal qiladi. O‘z sur’atingizda yozishingiz mumkin — hammasi avtomatik saqlanadi.",
      filename: "sovga-sertifikati.pdf",
    },
  },
  letter: {
    subject: (book: string) => `«${book}» kitobi uchun yangi xat`,
    title: "Sizga kitob uchun xat keldi",
    text: (author: string, relation: string, book: string) => `<b>${author}</b>${relation ? ` (${relation})` : ""} «${book}» kitobi uchun xat yozdi.`,
    decide: "Uni o‘qib chiqing va xatni kitobga qo‘shish-qo‘shmaslikni hal qiling.",
    button: "Xatlarni ochish",
  },
  reminder: {
    subject: (book: string) => `«${book}» kitobingiz davomini kutmoqda`,
    title: "Kitobingiz davomini kutmoqda",
    progress: (book: string, answered: number, total: number) =>
      `«${book}» kitobida ${total} ta savoldan ${answered} tasiga allaqachon javob berilgan. Juda oz qoldi — kechqurun bir-ikki javobning o‘zi kitobni boyitadi.`,
    progressWords: (book: string, n: number) => `«${book}» kitobida allaqachon ${words(n)} bor. Kechqurun bitta bo‘limning o‘zi kitobni boyitadi.`,
    empty: (book: string) => `«${book}» kitobi yaratilgan, endi yozishni boshlash qoldi. Birinchi savol eng oddiysi — hoziroq urinib ko‘ring.`,
    autosave: "Barcha javoblar avtomatik saqlanadi, telefondan ham yozish mumkin.",
    button: "Kitobni davom ettirish",
    footnote: "Kitob bo‘yicha yordam kerak bo‘lsa — shu xatga javob yozing.",
  },
  /** Награда за приглашение: друг оплатил заказ по коду. Имя и код приходят уже экранированными. */
  referral: {
    subject: "Do‘stingiz kitobga buyurtma berdi — sizga sovg‘a",
    title: (friend: string) => (friend ? `${friend} sizning taklifingiz bilan kitobga buyurtma berdi` : "Do‘stingiz sizning taklifingiz bilan kitobga buyurtma berdi"),
    text: (friend: string, percent: number) => `Biz haqimizda aytganingiz uchun rahmat${friend ? ` — ${friend} allaqachon o‘z kitobini yozmoqda` : ""}. Minnatdorchilik sifatida keyingi kitobingizga ${percent}% chegirma sovg‘a qilamiz.`,
    code: (code: string) => `Sizning promokodingiz: <b style="font-family:monospace;font-size:17px;letter-spacing:1px">${code}</b>`,
    valid: (days: number) => `U ${uzCount(days, "kun")} amal qiladi — uni boshqa birovga sovg‘a qilish ham mumkin.`,
    more: "Har bir keyingi do‘st uchun — yana shunday promokod.",
    button: "Mening takliflarim",
  },
  push: {
    bookReady: {
      title: "Kitob tayyor",
      body: (n: number) => `№${n} buyurtma bo‘yicha kitob sahifalanishi tayyor — ilovada ochishingiz mumkin.`,
      bodyWithTitle: (book: string) => `«${book}» kitobi sahifalandi va tayyor — ilovada oching.`,
    },
    orderPaid: {
      title: "Buyurtma to‘landi",
      bodyPrinted: (n: number) => `№${n} buyurtma to‘landi — kitobni bosmaga tayyorlayapmiz.`,
      bodyDigital: (n: number) => `№${n} buyurtma to‘landi — elektron kitob ochiq.`,
    },
    orderShipped: {
      title: "Buyurtma yuborildi",
      body: (n: number) => `№${n} buyurtmadagi kitob yo‘lda.`,
      bodyTracking: (n: number, track: string) => `№${n} buyurtma yo‘lda. Trek-raqam: ${track}`,
    },
    managerReply: {
      title: "Menejer javobi",
      bodyFallback: "Menejer xabaringizga javob berdi.",
    },
  },
};
