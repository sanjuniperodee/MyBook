import type { answerFile as ru } from "../ru/answer-file";

export const answerFile: typeof ru = {
  meta: { video: "Кітаптағы бейне", audio: "Кітаптағы жазба" },
  fromBook: (title: string) => (title ? `«${title}» кітабынан` : "Естелік кітабынан"),
  processing: "Файл әлі дайындалып жатыр — әдетте бұл бірнеше минутқа созылады. Сәл кейінірек кіріңіз.",
  failed: "Бұл файлды өңдеу мүмкін болмады. Кітап авторы оны қайта жүктей алады.",
  refresh: "Бетті жаңарту",
  download: "Жүктеп алу",
  noPlayer: "Браузер файлды ойната алмайды — оны жүктеп алыңыз.",
  madeWith: "MyBooks-та жасалған естелік кітабы",
  about: "Осындай кітапты қалай жасауға болады",
};
