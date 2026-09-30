/** Тексты, которые печатаются в самой книге. Выбираются по языку книги (books.language), а не интерфейса. */
export const book = {
  chapter: (n: number) => `Глава ${n}`,
  toc: "Содержание",
  gallery: "Наши моменты",
  misc: "Разное",
  letters: { title: "Письма близких", epigraph: "Слова тех, кто любит вас" },
  copyright: (year: number, author: string) => `© ${year}${author ? ` ${author}` : ""}. Все права защищены.`,
  colophon: (brand: string) => `Эта книга написана с любовью и напечатана в единственном экземпляре на ${brand}.`,
  theEnd: "Продолжение следует…",
  previewMark: "ПРЕДПРОСМОТР",
  coverDoc: (title: string) => `${title} — обложка`,
  /** Имя автора в конце посвящения / на обороте, когда поле пустое. */
  untitled: "Без названия",
};
