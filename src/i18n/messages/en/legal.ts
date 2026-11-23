import type { LegalBlock, LegalFacts, legal as ru } from "../ru/legal";

export const legal: typeof ru = {
  updated: "1 September 2026",
  offer: {
    meta: "Public offer",
    metaDescription: "Terms for ordering a personal book on MyBooks: placing an order, payment, production and delivery times, returns.",
    title: "Public offer",
    blocks: (f: LegalFacts): LegalBlock[] => [
      {
        p: `This document is the official offer of ${f.legalName} (BIN ${f.bin}, hereinafter the “Contractor”) to enter into a contract for the production of a personal book on the terms set out below. Placing an order on the website ${f.url} constitutes full and unconditional acceptance of the terms of this offer (acceptance).`,
      },
      {
        h: "1. Subject of the contract",
        p: "The Contractor provides the Customer with an online service for creating a personal book (hereinafter the “Book”) and, on the Customer’s order, produces the Book in digital form (PDF) and/or in printed form, and the Customer pays for the order.",
      },
      {
        h: "2. Content of the Book",
        ul: [
          "The texts, photographs and other materials of the Book are provided by the Customer. The Customer warrants that they hold the rights to use them.",
          "The Contractor does not edit the texts in substance and is not responsible for their content, spelling or punctuation.",
          "The Contractor may refuse to produce a Book that contains materials violating the legislation of the Republic of Kazakhstan.",
        ],
      },
      {
        h: "3. Placing and paying for an order",
        ul: [
          "Before placing an order, the Customer must review the Book’s layout in the “Preview” section. By placing an order, the Customer confirms that they agree with the layout.",
          "The price is determined by the plans published on the website at the time the order is placed. Payment is made in tenge by the methods indicated on the website.",
          "Production begins once payment has been received in full.",
        ],
      },
      {
        h: "4. Timing and delivery",
        ul: [
          `The production time for a printed Book is ${f.standardDays} business days from the date of payment (${f.premiumDays} if express printing is ordered).`,
          "The digital copy becomes available in your account immediately after payment is confirmed.",
          "Delivery times depend on the delivery method and the delivery service chosen.",
        ],
      },
      {
        h: "5. Returns and claims",
        ul: [
          "The Book is made to individual order, so a Book of proper quality cannot be returned.",
          "Before production begins, the Customer may cancel the order and receive a full refund of the payment.",
          "In the event of a manufacturing defect (printing or binding defects), the Contractor will produce the Book again free of charge. Claims are accepted within 14 days of receipt.",
        ],
      },
      {
        h: "6. Gift certificates",
        ul: [
          "A certificate entitles the holder to a discount equal to its face value when ordering a Book. A certificate is single-use and is valid for 12 months from the date of payment.",
          "If the order total is higher than the face value, the Customer pays the difference; if it is lower, the remainder is neither refunded nor carried over.",
          `An unused certificate can be returned within 14 days of the date of payment by writing to ${f.email}.`,
        ],
      },
      { h: "7. Personal data", p: "Personal data is processed in accordance with the Privacy Policy published on the website." },
      { h: "8. Language of the document", p: "This English text is a translation provided for convenience. The original offer is published in Russian and Kazakh, and both have equal legal force; in case of any discrepancy between this translation and the original, the Russian text prevails." },
      { h: "9. Details", p: `${f.legalName}, BIN ${f.bin}, ${f.address}. E-mail: ${f.email}, phone: ${f.phone}.` },
    ],
  },
  privacy: {
    meta: "Privacy policy",
    metaDescription: "What data MyBooks collects, why it is needed, who it is shared with and where it is stored: account, books, orders, chats, AI services.",
    title: "Privacy policy",
    updated: "24 November 2026",
    blocks: (f: LegalFacts): LegalBlock[] => [
      {
        p: `This policy describes what data ${f.legalName} collects when you use the ${f.brand} service, why it is needed, who it is shared with and where it is stored. The texts and photographs in your book are not published: they are seen by you, by the people you yourself invite into the book (for example, to write a letter), and by ${f.brand} staff when they help you with the book or prepare it for printing.`,
      },
      {
        h: "What data we collect",
        ul: [
          "Account data: name, e-mail or phone number, password (stored only as a cryptographic hash), selected language.",
          "Book content: answers to questions, photographs, audio and video for QR codes, letters from loved ones, design settings.",
          "Order data: contact name, phone number, delivery address, history of statuses and payments.",
          "Your messages to us: texts, voice messages, photos and files you send us on WhatsApp or in the chat on the website; recordings of WhatsApp calls with a manager.",
          "Technical data: the session cookie needed to log in to your account, the language cookie, the website chat cookie and a note of where you came from (for example, which advert) — to run the service and for our own statistics.",
        ],
      },
      {
        h: "How we use the data",
        ul: [
          "To run the service: saving and laying out your book.",
          "To fulfil your order: printing, delivery and contacting you about the order.",
          "To answer your questions on WhatsApp, in the website chat and in the book’s workspace.",
          "We do not sell data and do not use the texts of books for advertising or any other purposes.",
        ],
      },
      {
        h: "Who the data is shared with",
        ul: [
          "Print shops: the finished book files, solely for printing your order.",
          "The delivery service: the recipient’s name, phone number and address.",
          "The payment provider: the data needed to process the payment. We do not receive or store bank card data.",
          "The e-mail service: your e-mail address and the text of the e-mail, to deliver e-mails about your book and order.",
          "WhatsApp (Meta): the messages you send us on WhatsApp pass through the messenger itself under its own rules.",
          "AI services: in the cases described in the next section.",
        ],
      },
      {
        h: "AI services",
        p: "Some MyBooks features work with the help of AI services (language models) run by other companies. To get an answer, we send such a service only the text or file needed for that particular request.",
        ul: [
          "WhatsApp and the website chat: messages are sent to an AI service so that the bot can reply to you and a manager can get a suggested reply and a short summary of the conversation. Voice messages and photos from the chat are sent for recognition so that the bot understands what is in them.",
          "The book’s workspace: when you yourself use an AI feature — the AI assistant, the AI proofreader, the AI designer or the workspace helper — the relevant text of your book and your request are sent to the service.",
          "We currently use DeepSeek (a company based in China), OpenRouter (USA; it gives access to other companies’ models, for example Google Gemini) and Groq (USA; transcribing voice messages). The set of services may change — if it does, we will update this list.",
          "These services are located outside Kazakhstan, so this is a cross-border transfer of data. By using the chats and AI features, you agree to it. If you do not want your messages to be processed by AI, tell a manager: we will stop the bot in your conversation, and from then on only a manager will reply to you.",
        ],
      },
      {
        h: "Where the data is stored",
        p: "The service’s database and files (books, photographs, chats, call recordings) are stored in Kazakhstan — on the server and in the object storage of the cloud provider PS Cloud (ps.kz). Data leaves this storage only for the services listed above.",
      },
      {
        h: "Storage and deletion",
        p: `You can delete a book at any time on its page. To delete your account, your conversations with us and all related data, write to us at ${f.email}. Order data is kept for the periods set by law for accounting records.`,
      },
      { h: "Contacts", p: `For questions about data processing: ${f.email}.` },
    ],
  },
};
