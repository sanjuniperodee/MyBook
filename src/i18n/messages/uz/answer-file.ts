import type { answerFile as ru } from "../ru/answer-file";

export const answerFile: typeof ru = {
  meta: { video: "Kitobdagi video", audio: "Kitobdagi yozuv" },
  fromBook: (title: string) => (title ? `«${title}» kitobidan` : "Xotiralar kitobidan"),
  processing: "Fayl hali tayyorlanmoqda — odatda bu bir necha daqiqa oladi. Birozdan keyin qaytib keling.",
  failed: "Bu faylni qayta ishlab bo‘lmadi. Kitob muallifi uni qaytadan yuklashi mumkin.",
  refresh: "Sahifani yangilash",
  download: "Yuklab olish",
  noPlayer: "Brauzer faylni ijro eta olmaydi — uni yuklab oling.",
  madeWith: "MyBooks orqali yaratilgan xotiralar kitobi",
  about: "Shunday kitobni qanday yaratish mumkin",
};
