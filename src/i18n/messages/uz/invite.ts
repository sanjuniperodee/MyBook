import type { invite as ru } from "../ru/invite";
import { uzCount } from "../../plural";

/** Takliflar: «do‘stga — birinchi kitobga chegirma, sizga — har bir do‘st uchun promokod». */
export const invite: typeof ru = {
  meta: "Do‘stni taklif qilish",
  eyebrow: "Takliflar",
  title: "Do‘stlaringizga o‘z kitobiga chegirma sovg‘a qiling",
  lead: (friend: number, reward: number) => `Do‘stingiz birinchi kitobga ${friend}% chegirma oladi, siz esa uni buyurtma qilgan har bir do‘st uchun ${reward}% promokod olasiz. Do‘stlar soni cheklanmagan.`,
  yourLink: "Sizning havolangiz",
  yourCode: (code: string) => `Yoki shunchaki ${code} kodini ayting — u buyurtma rasmiylashtirilayotganda kiritiladi.`,
  copy: "Havolani nusxalash",
  copied: "Havola nusxalandi",
  share: "Ulashish",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  message: (link: string, percent: number) =>
    `MyBooks xizmatini sinab ko‘r: iliq savollarga javob berasan — va yaqin insoningga sovg‘a uchun haqiqiy kitob tayyor bo‘ladi. Mening havolam orqali birinchi kitobga ${percent}% chegirma: ${link}`,
  stepsTitle: "Bu qanday ishlaydi",
  steps: (friend: number, reward: number) => [
    "Havolani do‘stingizga yuboring — WhatsApp, Telegram yoki qulay usulda.",
    `Do‘stingiz o‘z kitobini yozadi, buyurtma rasmiylashtirilayotganda esa ${friend}% chegirma o‘zi qo‘yiladi.`,
    `Do‘stingiz buyurtmani to‘lagach, pochtangizga ${reward}% promokod keladi — keyingi kitobingiz uchun yoki boshqa birovga sovg‘a sifatida.`,
  ],
  statsTitle: "Sizning takliflaringiz",
  friends: (n: number) => (n ? `${uzCount(n, "ta do‘st")} sizning havolangiz orqali kitob buyurtma qildi` : "Hozircha hech kim sizning havolangiz orqali kitob buyurtma qilmagan — ulashishning aynan vaqti."),
  rewards: "Sizning promokodlaringiz",
  rewardFor: (n: number) => `Do‘stning №${n} buyurtmasi uchun`,
  rewardForChat: (n: number) => `Do‘stning chatdagi xaridi uchun (№${n} ariza)`,
  until: (date: string) => `amal qilish muddati: ${date}`,
  used: "ishlatilgan",
  expired: "muddati tugagan",
  rules: "Do‘stning chegirmasi birinchi kitobga amal qiladi va boshqa promokodlar bilan qo‘shilmaydi. O‘z kodingizni qo‘llab bo‘lmaydi.",
  /** Buyurtma sahifasidagi kartochka. */
  card: {
    title: "Do‘stlaringizga chegirma sovg‘a qiling",
    text: (friend: number, reward: number) => `Do‘stlarga — birinchi kitobga ${friend}%, sizga — buyurtma bergan har biri uchun ${reward}%.`,
    button: "Do‘stni taklif qilish",
  },
  /** Taklif havolasi orqali saytdagi salomlashuv. */
  welcome: (from: string, percent: number) => (from ? `${from} sizga birinchi kitobga ${percent}% chegirma sovg‘a qilmoqda` : `Sizga sovg‘a — birinchi kitobga ${percent}% chegirma`),
  welcomeNote: "Chegirma buyurtma rasmiylashtirilayotganda o‘zi qo‘yiladi.",
};
