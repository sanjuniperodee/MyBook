import type { book as ru } from "../ru/book";

export const book: typeof ru = {
  chapter: (n: number) => `${n}-тарау`,
  toc: "Мазмұны",
  gallery: "Біздің сәттеріміз",
  galleryByKind: { autobiography: "Отбасылық альбомнан", blank: "Фотосуреттер" },
  recordedBy: (name: string) => `Автордың айтуымен жазып алған — ${name}`,
  untitledChapter: "Атаусыз",
  samplePhotos: ["Алғашқы жазымыз", "Сол бір күн", "Жай ғана біз"],
  samplePhotosSolo: ["Бұрынғы күндер", "Сол бір күн", "Бәрі қалай болды"],
  misc: "Әртүрлі",
  letters: { title: "Жақындардың хаттары", epigraph: "Сізді жақсы көретіндердің сөздері" },
  copyright: (year: number, author: string) => `© ${year}${author ? ` ${author}` : ""}. Барлық құқықтар қорғалған.`,
  colophon: (brand: string) => `Бұл кітап сүйіспеншілікпен жазылып, ${brand} сервисінде жалғыз данада басылды.`,
  theEnd: "Жалғасы бар…",
  previewMark: "АЛДЫН АЛА ҚАРАУ",
  coverDoc: (title: string) => `${title} — мұқаба`,
  untitled: "Атаусыз",
};
