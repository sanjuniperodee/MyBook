import type { gift as ru } from "../ru/gift";

export const card: typeof ru.card = {
  brandLine: (brand: string) => `${brand} · сыйлық сертификаты`,
  title: "Ең маңызды нәрсе туралы кітап",
  recipient: "Алушы",
  book: "Кітап",
  amount: (price: string) => `сомасы ${price}`,
  code: "КОД",
  howTo: (host: string) => `Қалай қолдану керек: ${host}/kk/redeem сайтын ашып, кодты енгізіңіз және кітап жазыңыз — сұрақтарға жауап беріп, суреттер қосып, мұқаба таңдаңыз. Сертификат тапсырыс рәсімдегенде қолданылады.`,
  footer: (n: number, until: string) => `№ ${n} · ${until} жарамды`,
  docTitle: (brand: string) => `${brand} сыйлық сертификаты`,
  filename: (n: number) => `mybooks-sertifikat-${n}.pdf`,
};
