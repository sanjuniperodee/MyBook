import type { answerFile as ru } from "../ru/answer-file";

/** The page of your own video or audio from the book — opened by the QR code in the book (/v/<token>). */
export const answerFile: typeof ru = {
  meta: { video: "Video from the book", audio: "Recording from the book" },
  fromBook: (title: string) => (title ? `From the book “${title}”` : "From a book of memories"),
  processing: "The file is still being prepared — this usually takes a few minutes. Please check back a little later.",
  failed: "We couldn’t process this file. The author of the book can upload it again.",
  refresh: "Refresh the page",
  download: "Download",
  noPlayer: "Your browser can’t play this file — download it instead.",
  madeWith: "A book of memories made with MyBooks",
  about: "How to make a book like this",
};
