import type { book as ru } from "../ru/book";

/** Texts printed inside the book itself. Chosen by the book’s language (books.language), not the interface. */
export const book: typeof ru = {
  chapter: (n: number) => `Chapter ${n}`,
  toc: "Contents",
  gallery: "Our moments",
  galleryByKind: { autobiography: "From the family album", blank: "Photographs" },
  recordedBy: (name: string) => `Written down from the author’s words — ${name}`,
  untitledChapter: "Untitled",
  samplePhotos: ["Our first summer", "That very day", "Just us"],
  sampleByKind: {
    autobiography: {
      chapterTitle: "Childhood",
      epigraph: "We all come from childhood.",
      h1: "The house where it all began",
      p1: "Our house stood at the very edge of the village, by the irrigation stream. In spring the apricot and cherry trees bloomed in the yard, and in the mornings the air smelled of fresh bread: my grandmother baked it in the oven before dawn.",
      p2: "In summer we vanished outdoors from sunrise to sunset: we played hide-and-seek, ran down to the river, and in the evening everyone gathered around one big table.",
      h2: "My first memories",
      p3: "The earliest thing I remember is my mother’s warm hands and the smell of wormwood. I was about three, and the world seemed huge and kind.",
      p4: "We were not well off, but there was always room in the house for a guest, and hot tea in the kettle.",
      photos: ["Our yard, summer", "The whole family together", "My favourite photograph"],
    },
    blank: {
      chapterTitle: "Chapter title",
      h1: "Section heading",
      p1: "This is where the text of your book will go. Write however suits you: a story, memories, letters, poems — every section will become part of a chapter.",
      p2: "Sections can be rearranged, renamed and moved between chapters, and you can add photos to the text.",
      h2: "Another section",
      p3: "A section without a heading is separated from the previous one in the book by a small ornament — a handy way to split one story into several parts.",
      p4: "This is how your page will look: the typeface, margins and headings depend on the design you choose.",
      photos: ["Photo caption", "Another caption", "A photo from your book"],
    },
  },
  misc: "Miscellany",
  letters: { title: "Letters from loved ones", epigraph: "Words from those who love you" },
  copyright: (year: number, author: string) => `© ${year}${author ? ` ${author}` : ""}. All rights reserved.`,
  colophon: (brand: string) => `This book was written with love and printed in a single copy at ${brand}.`,
  media: {
    video: "Video",
    music: "Music",
    audio: "Audio",
    scan: { video: "Point your phone’s camera at the code to watch", music: "Point your phone’s camera at the code to listen", audio: "Point your phone’s camera at the code to listen" },
  },
  theEnd: "To be continued…",
  previewMark: "PREVIEW",
  coverDoc: (title: string) => `${title} — cover`,
  untitled: "Untitled",
};
