import type { Messages } from "..";
import { enCount } from "../../plural";

/**
 * AI designer: describe what you want in words and the page design or cover changes; three variants to choose from; a design
 * review with tips. 5 free requests, then packs.
 */
export const design_ai: Messages["design"]["ai"] = {
  tab: "AI designer",
  title: "AI designer",
  lead: {
    pages: "It knows fonts, colours and layout rules, and sees the colours of your photos and your book’s cover. It can draw emblems for the title page and chapters. Describe what you’d like and see it on the spread.",
    cover: "It knows fonts, layouts and cover rules, and sees the colours of your photos and your book’s pages. It can draw landscapes, patterns, frames and flowers. Describe what you’d like and see it on the proof.",
  },
  modes: { edit: "Change", create: "Create", variants: "3 variants", review: "Review" },
  modesAria: "What to do",
  modeHint: {
    edit: "Say in words what to change. You can refine: “even darker”, “bring back the old font”.",
    create: "The AI will come up with a design for your book from scratch and draw artwork for it: mountains, flowers, ornaments, frames.",
    variants: "Three different directions in one request — choose the best one; the others stay available while you’re here.",
    review: "An honest rating of the design from 1 to 10 and tips you can apply with one button.",
  },
  placeholder: {
    pages: "For example: make it look like an old-fashioned novel — a serif font, a drop cap and burgundy accents",
    cover: "For example: a navy background, a larger gold title and a thin frame",
  },
  createPlaceholder: {
    pages: "What’s the idea? For example: mountains and a starry sky, like in a fairy tale. You can leave it empty — the AI will think of something",
    cover: "What’s the idea? For example: the steppe, a yurt and tulips. You can leave it empty — the AI will think of something",
  },
  createDefault: "Come up with a design for this book from scratch and draw your own artwork for it",
  concept: "Idea",
  variantsPlaceholder: {
    pages: "What mood? For example: warm and family-like. You can leave it empty — the AI will choose to suit the book",
    cover: "What mood? For example: festive, but not busy. You can leave it empty — the AI will choose to suit the book",
  },
  reviewPlaceholder: "Anything in particular to look at? (optional)",
  variantsDefault: "Suggest three different designs for this book",
  examples: {
    pages: ["A bigger font, for reading to Grandma", "Like a classic novel", "Modern and strict, no serifs", "Warm colours and soft decorations"],
    cover: ["A larger, higher-contrast title", "A dark background and gold", "Soft and light, in pastel tones", "Add a frame and sprigs"],
  },
  drawIdeas: {
    pages: ["Draw an emblem for the chapters — a flower", "Draw an emblem: mountains and a moon"],
    cover: ["Draw mountains with a moon at the bottom", "Draw a yurt, tulips and a sun", "Add a Kazakh ornament in a frame", "Draw a wreath of flowers"],
  },
  themeIdeas: {
    love: { pages: "Romantic: powder pink and gold", cover: "Romantic, like a wedding invitation" },
    mom: { pages: "Delicate, like a herbarium", cover: "Flowers and soft pastel tones" },
    dad: { pages: "Dignified, like a memoir", cover: "Restrained and noble, a dark background" },
    friend: { pages: "Fun, like a sticker album", cover: "Bright and festive" },
    teacher: { pages: "Serious but warm, like a good book", cover: "Autumnal and cosy" },
    autobiography: { pages: "Like an old book", cover: "Like a family chronicle, retro" },
    blank: { pages: "Like a real published book", cover: "Minimalism, like in a bookshop" },
  } as Record<string, { pages: string; cover: string }>,
  photoIdea: "Match the colours to my photos",
  matchIdea: { pages: "Make it in the same style as the cover", cover: "Make it in the same style as the pages" },
  examplesLabel: "Ideas:",
  send: { edit: "Change", create: "Create a design", variants: "Show 3 variants", review: "Review my design" },
  thinking: { edit: "Choosing a design…", create: "Thinking and drawing…", variants: "Drawing three variants…", review: "Looking at your design…" },
  undo: "Restore the previous version",
  noChange: "Nothing has changed.",
  you: "You",
  ai: "AI designer",
  // Variants.
  variantsTitle: "Choose a variant",
  pick: "Choose",
  picked: "Chosen",
  noVariants: "We couldn’t put the variants together — try describing the mood differently. The request wasn’t wasted: try “Change”.",
  // Review.
  score: (n: number) => `${n} out of 10`,
  scoreLabel: "Design rating",
  strengths: "What’s already good",
  tips: "How to make it better",
  apply: "Apply",
  applied: "Applied",
  tipText: "tip",
  // Limit — shown before sending.
  left: (n: number, limit: number) => `Free requests: ${n} of ${limit}`,
  credits: (n: number) => `${enCount(n, "request", "requests")} in reserve`,
  oneRequest: "Any mode is one request",
  freeNote: (limit: number) => `${limit} requests are free. Any mode is one request; if the AI doesn’t answer, the request isn’t used up.`,
  lastFree: "This is your last free request. Tip: “3 variants” gives the most for a single request.",
  lowFree: (n: number) => `${enCount(n, "free request", "free requests")} left — try “3 variants” or “Review”: you get more from a single request.`,
  fromCredits: (n: number) => `Your free requests have run out — this request will be taken from your pack (${n} in reserve).`,
  // Pack offer.
  outTitle: "Your free requests have run out",
  outText: "Keep going with the AI designer — requests from a pack don’t expire and work for all your books.",
  perks: ["Three design variants in one request", "Your own artwork: landscapes, patterns, frames, emblems", "A design review and tips in one click", "Cover and pages in the same style"],
  packTitle: (n: number) => enCount(n, "request", "requests"),
  perRequest: (price: string) => `${price} per request`,
  featured: "Best value",
  buy: "Buy",
  buyMore: "Buy more requests",
  hidePacks: "Collapse",
  payTitle: (n: number) => `Pack: ${enCount(n, "request", "requests")}`,
  payNote: (number: number) => `Payment comment — MyBooks A${number}. The requests are added automatically as soon as Kaspi confirms the payment.`,
  paid: (n: number) => `Done! ${enCount(n, "request", "requests")} added.`,
  payUnavailable: "Paying for packs is unavailable right now. Write to us — we’ll help.",
  close: "Close",
  loadFailed: "Couldn’t check how many requests are left. Refresh the page.",
};
