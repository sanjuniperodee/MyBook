import type { mail as ru } from "../ru/mail";
import { enCount } from "../../plural";

/**
 * Customer e-mails in English. User data (names, titles) is escaped by the calling code; HTML markup is allowed.
 */
const answers = (n: number) => enCount(n, "answer", "answers");
const words = (n: number) => enCount(n, "word", "words");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const mail: typeof ru = {
  hello: (name: string) => `Hello${name ? `, ${name}` : ""}!`,
  helpFootnote: "If you need help, just reply to this e-mail.",
  unsubscribe: "Stop sending me e-mails like this",
  reset: {
    subject: "Reset your password",
    title: "Reset your password",
    text: "To set a new password, press the button below. The link is valid for 1 hour.",
    button: "Set a new password",
    footnote: "If you didn’t ask to reset your password, simply ignore this e-mail.",
  },
  lifecycle: {
    chat: {
      deadline: (book: string, until: string, url: string) => `For your book “${book}” to arrive on time, place your order ${until}. If you are short on time, add express printing — it goes ahead of the queue. Your book is here: ${url}`,
      deadlinePremium: (book: string, until: string, url: string) => `Standard production can no longer make it in time for the occasion, but express printing goes ahead of the queue: place your order ${until} and your book “${book}” will arrive on time. Your book is here: ${url}`,
      almost: (book: string, url: string) => `Your book “${book}” is almost ready. Flip through the layout — the pages are set exactly as they will be printed. If you like it, place your order: ${url}`,
      unpaid: (n: number, amount: string, url: string) => `Order №${n} for ${amount} has been placed but is not paid yet. As soon as the payment arrives, your book goes to print: ${url}\nIf anything goes wrong with the payment, write to us here and we will help.`,
      review: (percent: number, url: string) => `How do you like your book? Please leave a review — it takes a minute, and as a thank-you we will send you a ${percent}% promo code for your next book: ${url}`,
    },
    deadline: {
      subject: (occasion: string, until: string) => `Order your book ${until} to be in time for ${occasion}`,
      title: (untilOccasion: string, when: string) => `${cap(untilOccasion)} is ${when}`,
      premium: (book: string, until: string) => `Standard production can no longer make it, but express printing goes ahead of the queue — place your order <b>${until}</b> and your book “${book}” will arrive on time.`,
      normal: (book: string, until: string) => `For your book “${book}” to arrive on time, place your order <b>${until}</b>. If you are short on time, add express printing: it goes ahead of the queue.`,
      ready: (n: number) => `Your book already has ${answers(n)} — take a look at the layout: it may well be ready.`,
      readyWords: (n: number) => `Your book already has ${words(n)} — take a look at the layout: it may well be ready.`,
      short: "Even 15–20 short answers add up to a touching book — it takes just a couple of evenings.",
      shortWords: "A thousand words is enough to start — it takes just a couple of evenings.",
      preview: "View the layout",
      continue: "Continue your book",
    },
    almost: {
      subject: (book: string) => `Your book “${book}” is almost ready`,
      title: "Your book is almost ready",
      text: (book: string, n: number) => `Your book “${book}” already has ${answers(n)} — that is a real book. Flip through the layout: the pages are set exactly as they will be printed.`,
      textWords: (book: string, n: number) => `Your book “${book}” already has ${words(n)} — that is a real book. Flip through the layout: the pages are set exactly as they will be printed.`,
      next: "If you like it, place your order, and in a few days the book will be in your hands.",
      button: "View the layout",
    },
    start: {
      subject: "Three tips for starting your book",
      title: "How to start when you don’t know how",
      intro: (book: string) => `Your book “${book}” is waiting for its first lines. Three tips from people who have already written theirs:`,
      tips: [
        "<b>1. Not in order.</b> Start with a question you can answer right away — the rest will follow.",
        "<b>2. Like telling a friend over tea.</b> There is no need to write beautifully — write the way you would say it aloud. You can even dictate it by voice.",
        "<b>3. Ten minutes at a time.</b> Two or three answers a day, and in a couple of weeks the book is ready.",
      ],
      button: "Answer the first question",
      autobiography: {
        intro: (book: string) => `Your book “${book}” is waiting for your first memories. Three tips from people who have already written down their story:`,
        tips: [
          "<b>1. Start with what comes to mind easily.</b> You don’t have to go strictly from childhood: pick a question you can answer right away — the rest will follow.",
          "<b>2. Like telling your grandchildren.</b> There is no need to write beautifully — write the way you would say it aloud. If writing is hard, a loved one can write down your story from your words: the book stays in your own voice.",
          "<b>3. Ten minutes at a time.</b> Two or three answers a day, and in a couple of weeks the book is ready.",
        ],
        button: "Answer the first question",
      },
      blank: {
        intro: (book: string) => `Your book “${book}” is waiting for its first lines. Three tips from people who have already written theirs:`,
        tips: [
          "<b>1. Start with any section.</b> There is no need to write in order: begin with the topic you most want to talk about — chapters and sections can be added and rearranged later.",
          "<b>2. A heading and a couple of paragraphs.</b> Give the section a title and write freely. The first version doesn’t have to be perfect — you can polish it later.",
          "<b>3. Ten minutes at a time.</b> One section a day, and in a few weeks the book is ready.",
        ],
        button: "Write the first section",
      },
    },
    nudge: {
      subject: (book: string) => `Your book “${book}” is waiting for you`,
      title: "Your book is waiting for you",
      text: (n: number) => `Your book already has ${answers(n)} — a good start. Even a couple of answers an evening will make it richer.`,
      textWords: (n: number) => `Your book already has ${words(n)} — a good start. Even one section an evening will make it richer.`,
      autosave: "All your answers are saved automatically, and you can write from your phone too.",
      button: "Continue your book",
    },
    unpaid: {
      subject: (n: number) => `Order №${n} is waiting for payment`,
      title: "Your order is waiting for payment",
      text: (n: number, amount: string) => `Order №${n} for ${amount} has been placed but is not paid yet. As soon as the payment arrives, your book goes to print.`,
      help: "If you have any trouble with the payment, reply to this e-mail and we will help.",
      button: "Go to payment",
    },
    review: {
      subject: "How do you like your book?",
      title: "How do you like your book?",
      text: "We hope the gift turned out special. Tell us how the moment of giving it went — it takes a minute, and your review will help others decide to write their own book. You can attach a photo.",
      thanks: (percent: number) => `As a thank-you for any review, here is a ${percent}% promo code for your next book.`,
      textAutobiography: "We hope the book turned out the way you imagined it. Tell us what your loved ones said when they read it — it takes a minute, and your review will help others decide to record their own story. You can attach a photo.",
      textBlank: "We hope the book turned out the way you imagined it. Tell us how you like the result — it takes a minute, and your review will help others decide to write their own book. You can attach a photo.",
      giftAutobiography: (url: string) => `Would you like to give this chance to your mum, dad, grandmother or grandfather? For them there is a <a href="${url}" style="color:#7a1f2b">gift certificate</a>: they will record their own story themselves.`,
      gift: (url: string) => `Would you like to give the same kind of book to your mum, dad or a friend? There are separate sets of questions for them, and also a <a href="${url}" style="color:#7a1f2b">gift certificate</a>, so that they can write the book for you.`,
      button: "Rate your book",
    },
  },
  order: {
    subject: (title: string, n: number) => `${title} — order №${n}`,
    open: "Open your order",
    paid: {
      title: "Thank you! Payment received",
      text: (n: number, amount: string) => `Order №${n} for ${amount} has been paid.`,
      printed: "We are already preparing your book for print. As soon as it is shipped, we will send you an e-mail with the tracking number.",
      digital: "The digital copy of your book is already available to download on your order page.",
    },
    production: { title: "Your book is being made", text: "Your book has gone to print. This usually takes a few working days." },
    shipped: { title: "Your book is on its way", text: "Your book has been printed and handed over for delivery.", tracking: (t: string) => `Tracking number: <b>${t}</b>` },
    delivered: { title: "Your book has been delivered", text: "We hope the gift turned out special. We would love to hear your review!", textOwn: "We hope you like your book. We would love to hear your review!" },
    cancelled: { title: "Order cancelled", text: "The order has been cancelled. You can edit the book again and place a new order." },
    created: {
      subject: (n: number) => `Order №${n} placed`,
      title: "Order placed",
      number: (n: number) => `Order number: <b>№${n}</b>`,
      plan: (plan: string, qty: number) => `Plan: ${plan}, ${qty} ${qty === 1 ? "copy" : "copies"}`,
      prepaid: (paid: string) => `You have already paid <b>${paid}</b> — this amount is taken into account.`,
      amount: (a: string) => `Amount to pay: <b>${a}</b>`,
      quoted: (where: string) => `Delivery (${where}) is not included in this amount: its cost is calculated individually — the manager will work it out for your address and write to you.`,
      button: "Go to payment",
    },
  },
  payment: {
    received: {
      subject: (amount: string) => `We received your payment — ${amount}`,
      title: "Payment received",
      text: (amount: string, deal: number) => `We received ${amount} for your order (deal №${deal}).`,
      left: (amount: string) => `Remaining to pay: <b>${amount}</b>.`,
      full: "The agreed amount has been paid in full.",
      next: "You can start on your book: answer the questions and add photos — everything is saved automatically, and you can place the order when the book is ready.",
      button: "Open your account",
    },
    refund: {
      subject: (amount: string) => `Refund of ${amount} issued`,
      title: "Refund issued",
      text: (amount: string, deal: number) => `A refund of ${amount} has been issued for deal №${deal}. How soon it arrives depends on your bank.`,
    },
  },
  gift: {
    buyer: {
      subject: (n: number) => `Gift certificate №${n} is ready`,
      title: "Your certificate is ready",
      paid: (plan: string, recipient: string) => `Thank you! The certificate for the “${plan}” book has been paid. Recipient: ${recipient}.`,
      code: (code: string) => `Code: <b style="letter-spacing:1px">${code}</b>. A printable PDF is attached.`,
      later: (email: string, day: string) => `We will send the certificate to ${email} on ${day}.`,
      sent: (email: string) => `We have already sent the certificate to ${email}.`,
      print: "Print the certificate or forward the PDF — whichever is the best way for you to present the gift.",
      button: "Open the certificate",
    },
    recipient: {
      subject: (buyer: string) => `${buyer} is giving you a book`,
      title: (recipient: string) => `${recipient}, this gift is for you`,
      text: (buyer: string, brand: string, plan: string) =>
        `${buyer} is giving you a ${brand} certificate — the “${plan}” book, which you will write yourself: answer warm questions, add photos, and we will lay it out and print it as a real edition.`,
      code: (code: string) => `Your code: <b style="letter-spacing:1px">${code}</b>`,
      button: "Start your book",
      footnote: "The certificate is valid for a year. You can write at your own pace — everything is saved automatically.",
      filename: "gift-certificate.pdf",
    },
  },
  letter: {
    subject: (book: string) => `A new letter for your book “${book}”`,
    title: "A letter has arrived for your book",
    text: (author: string, relation: string, book: string) => `<b>${author}</b>${relation ? ` (${relation})` : ""} has written a letter for the book “${book}”.`,
    decide: "Read it and decide whether to add the letter to the book.",
    button: "Open the letters",
  },
  reminder: {
    subject: (book: string) => `Your book “${book}” is waiting for you`,
    title: "Your book is waiting for you",
    progress: (book: string, answered: number, total: number) =>
      `Your book “${book}” already has ${answers(answered)} out of ${total}. Only a little is left — even a couple of answers an evening will make the book richer.`,
    progressWords: (book: string, n: number) => `Your book “${book}” already has ${words(n)}. Even one section an evening will make the book richer.`,
    empty: (book: string) => `Your book “${book}” has been created, and all that is left is to start writing. The first question is the easiest — try it right now.`,
    autosave: "All your answers are saved automatically, and you can write from your phone too.",
    button: "Continue your book",
    footnote: "If you need help with your book, just reply to this e-mail.",
  },
  referral: {
    subject: "Your friend ordered a book — a gift for you",
    title: (friend: string) => (friend ? `${friend} ordered a book through your invitation` : "A friend ordered a book through your invitation"),
    text: (friend: string, percent: number) => `Thank you for telling others about us${friend ? ` — ${friend} is already writing their book` : ""}. As a thank-you, here is ${percent}% off your next book.`,
    code: (code: string) => `Your promo code: <b style="font-family:monospace;font-size:17px;letter-spacing:1px">${code}</b>`,
    valid: (days: number) => `It is valid for ${enCount(days, "day", "days")} — you can also pass it on to someone else.`,
    more: "For every further friend, you get another promo code like this.",
    button: "My invitations",
  },
  push: {
    bookReady: {
      title: "Your book is ready",
      body: (n: number) => `Your book layout for order #${n} is ready — open it in the app.`,
      bodyWithTitle: (book: string) => `“${book}” is formatted and ready — open it in the app.`,
    },
    orderPaid: {
      title: "Order paid",
      bodyPrinted: (n: number) => `Order #${n} is paid — we are preparing your book for print.`,
      bodyDigital: (n: number) => `Order #${n} is paid — your digital book is ready.`,
    },
    orderShipped: {
      title: "Order shipped",
      body: (n: number) => `Your book from order #${n} is on its way.`,
      bodyTracking: (n: number, track: string) => `Order #${n} is on its way. Tracking number: ${track}`,
    },
    managerReply: {
      title: "Reply from manager",
      bodyFallback: "A manager replied to your message.",
    },
  },
};
