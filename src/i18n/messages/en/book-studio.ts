import type { bookStudio as ru } from "../ru/book-studio";
import { enCount } from "../../plural";

/**
 * Author’s book studio: the path bar in the book header, the overview “hub”, letters from loved ones,
 * settings, the proof reader and the payment method choice. The old books.* strings stay with the editors.
 */
export const bookStudio: typeof ru = {
  nav: {
    aria: "Book path",
    back: "My books",
    overview: "Overview",
    steps: { questions: "Questions", text: "Text", photos: "Photos", pages: "Pages", cover: "Cover", preview: "Proof", order: "Order" },
    /** Five steps in the book header: cover and pages are “Design”, proof and order are “Order”. */
    groups: { write: "Write", photos: "Photos", design: "Design", order: "Order" },
    designSwitch: { aria: "What are we designing", cover: "Cover", pages: "Pages" },
    extrasAria: "Letters and settings",
    letters: "Letters",
    settings: "Settings",
    /** For screen readers: the state of a step (colour is not the only cue). */
    state: { done: "done", partial: "in progress", todo: "not started", attention: "needs fixing" },
    badge: { writing: "In progress", ready: "Ready to order" },
  },
  hub: {
    facts: { aria: "The book in numbers", pages: "Pages", answers: "Answers", sections: "Sections", words: "Words", photos: "Photos", of: (total: number) => `of ${total}` },
    next: {
      label: "Next step",
      coverTitle: "Finish the cover",
      openCover: "Open the cover",
      readyEyebrow: "The book is ready to order",
      readyTitle: "Check the proof and place your order",
      readyText: "The proof shows the same pages that will go to print. Once you’ve ordered, the book can no longer be edited.",
      order: "Place order",
      openPreview: "Open the proof",
      moreToWrite: (n: number) => `You can write more: ${enCount(n, "question", "questions")} without an answer`,
      keepWriting: "Keep writing",
      orderedEyebrow: (n: number) => `Order No. ${n}`,
      orderedPayTitle: "The order is waiting for payment",
      orderedPayText: "Pay for the order and the book will go to print.",
      openOrder: "Open the order",
      orderedNoOrder: "The book has been handed over for production",
      reopenedText: "The book has been reopened for changes under this order — your corrections will go into it, so there’s no need to order again.",
    },
    path: {
      title: "Book path",
      aria: "Steps of working on the book",
      photosHint: "Without photos the book will be text only",
      previewValue: "The pages just as they will be printed",
      orderLater: "after you check the proof",
      actions: { start: "Start", continue: "Continue", add: "Add", manage: "Manage", change: "Change", fix: "Fix", open: "Open", order: "Place order", openOrder: "Open the order", pay: "Pay" },
    },
    needs: { errors: "Before ordering you still need", warnings: "Worth checking", fix: "Fix" },
    lower: {
      lettersTitle: "Letters from loved ones",
      lettersEmpty: "Invite friends and family: their letters will go into the book as a separate chapter.",
      lettersInvited: "The link has been sent — letters will appear here, and you decide which ones go into the book.",
      lettersState: (approved: number, pending: number) => [approved ? `${approved} in the book` : "", pending ? `${pending} awaiting your decision` : ""].filter(Boolean).join(", "),
      lettersCreate: "Create a link",
      lettersOpen: "Open the letters",
      lettersReview: (n: number) => `Review the letters (${n})`,
      photosTitle: "Photos",
      photosEmpty: "There are no photos yet. Add some — they will decorate the chapters and the cover.",
      photosAdd: "Add photos",
      settingsTitle: "Settings",
      settingsOpen: "Change",
      helpTitle: "Need help?",
    },
  },
  /** Letters from loved ones: the list of letters and the invitation. */
  letters: {
    lead: "Friends and family write via the link, and you decide which letters go into the book.",
    all: "All",
    status: { pending: "New", approved: "In the book", hidden: "Hidden" },
    readMore: "Read in full",
    collapse: "Collapse",
    inviteLead: "Link for loved ones",
    countLine: (n: number) => enCount(n, "letter", "letters"),
  },
  /** Book settings: section anchors. */
  settings: {
    anchors: "Settings sections",
    format: "Format",
    saveHint: "Changes are saved automatically",
  },
  /** Proof reader. */
  reader: {
    tabs: { read: "Read", model: "3D book" },
    spreadMode: "By spreads",
    scrollMode: "All pages in a row",
    of: (n: number) => `of ${n}`,
    hint: "Turn pages by tapping a page, with the arrow keys, by swiping or with the slider",
    endTitle: "This is the last page",
    endText: "Is everything fine? Then place your order: the book will go to print exactly like this.",
  },
  /** Payment: methods. */
  pay: {
    method: "Payment method",
    kaspi: "Kaspi",
    card: "Bank card",
    transfer: "Bank transfer",
  },
};
