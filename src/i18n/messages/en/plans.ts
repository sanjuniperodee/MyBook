import type { Messages } from "..";

/** Plans: names, badges and what is included — in the shared dictionary and on the certificate (in the certificate’s language). */
export const plans: Messages["common"]["plans"] = {
  digital: {
    name: "Digital",
    features: ["High-resolution PDF book", "A file ready to print at any print shop", "All chapters, photos and contents", "Access right after payment"],
  },
  hardcover: {
    name: "Hardcover",
    badge: "Popular choice",
    features: ["Hardcover binding, sewn pages", "Thick 150 g/m² paper", "Full-colour photo printing", "PDF version as a gift"],
  },
  premium: {
    name: "Premium",
    features: ["Everything in the “Hardcover” plan", "Designer 170 g/m² paper", "Gift box and a card", "Priority production"],
  },
};
