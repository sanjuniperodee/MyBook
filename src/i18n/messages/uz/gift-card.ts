import type { gift as ru } from "../ru/gift";

export const card: typeof ru.card = {
  brandLine: (brand: string) => `${brand} · sovg‘a sertifikati`,
  title: "Eng muhim narsa haqidagi kitob",
  recipient: "Oluvchi",
  book: "Kitob",
  amount: (price: string) => `${price} miqdorida`,
  code: "KOD",
  howTo: (host: string) => `Qanday foydalanish kerak: ${host}/uz/redeem sahifasini oching, kodni kiriting va kitob yozing — savollarga javob bering, suratlar qo‘shing va muqova tanlang. Sertifikat buyurtma rasmiylashtirilganda qo‘llaniladi.`,
  footer: (n: number, until: string) => `№ ${n} · ${until} amal qiladi`,
  docTitle: (brand: string) => `${brand} sovg‘a sertifikati`,
  filename: (n: number) => `mybooks-sertifikat-${n}.pdf`,
};
