import type { ChapterDef } from "../types";

// A book for a daughter-in-law, from her mother-in-law, father-in-law or husband (we do not assume who the author is).
// The recipient is always female, so no recipient markers are needed; the wording avoids fixing the author’s role.

export const daughterinlawChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "Instead of a foreword",
    epigraph: "The family grew warmer the day you came into it.",
    questions: [
      [
        "Introduce yourself: who are you to her — a mother-in-law, a father-in-law, a husband, another relative — and why did you decide to write this book?",
        "Why I am writing this book",
        "A few warm words: what is the book for — a wedding, a birthday, 8 March or just because?",
      ],
      ["Describe her in three words.", "You in three words"],
      ["What do you call her? Where did that name or nickname come from?", "What I call you"],
      ["How long has she been part of your family? What have those years meant to you?", "How long we have been together"],
    ],
  },
  {
    key: "arrival",
    title: "How you joined the family",
    epigraph: "Every family begins with someone’s “hello”.",
    questions: [
      ["What did you learn about her before you saw her?", "What I knew about you in advance"],
      ["How and when did you meet?", "Our meeting"],
      ["What did you feel when you first met?", "The first feeling"],
      ["How was she welcomed into the family — who said what, who greeted her how?", "How you were welcomed"],
      ["How did the wedding day, or her first day in your home, go?", "That very day"],
      ["What did you want her to feel in your home?", "What I wanted you to feel"],
    ],
  },
  {
    key: "first",
    title: "First impressions",
    questions: [
      ["What surprised you about her in the first weeks?", "What surprised me"],
      ["What was she like in the first days — shy, bold, quiet, cheerful?", "What you were like"],
      ["Which first words or actions of hers do you remember?", "First words and actions"],
      ["What turned out differently from what you expected?", "Expectation and reality"],
      ["When did you realise she had become truly one of your own?", "When you became one of us"],
      ["What would you have liked to tell her then, but did not?", "What I did not say then"],
    ],
  },
  {
    key: "you",
    title: "What you are like",
    epigraph: "Little things say a lot about a person.",
    questions: [
      ["Which of her qualities do you value most?", "What I value in you"],
      ["What do you admire in her?", "What I admire in you"],
      ["Which of her habits have you noticed and come to love?", "Your habits"],
      ["What does she do better than anyone?", "What you do best"],
      ["What would you tell guests about her?", "What I tell people about you"],
      ["What is different about her compared with you, and why is that good?", "How we are different"],
    ],
  },
  {
    key: "together",
    title: "What you gave the family",
    questions: [
      ["What did she bring to your family?", "What you brought into our home"],
      ["How does she care for her husband, her children, her elders?", "Your care"],
      ["Which of her actions will you never forget?", "An action I remember"],
      ["What changed in the house when she arrived?", "What changed with you"],
      ["Which of her acts of help or support turned out to be the most needed?", "When you stood by us"],
      ["Why is she loved in the family — by the grandchildren, brothers, sisters, neighbours?", "Why you are loved"],
    ],
  },
  {
    key: "traditions",
    title: "Family traditions",
    epigraph: "New people bring their own light to old customs.",
    questions: [
      ["Which of your family’s traditions has she already made her own?", "What became yours too"],
      ["Which traditions did she bring from her own family?", "Your traditions"],
      ["How does she welcome guests and lay the table?", "Your dastarkhan"],
      ["Which family celebration do you remember together with her?", "Our celebration"],
      ["What have you learned from her?", "What I learned from you"],
      ["Which family tradition would you like to hand to her, so that she can pass it on?", "What I want to pass on"],
    ],
  },
  {
    key: "thanks",
    title: "Thank you",
    epigraph: "Gratitude spoken at the right time stays warm the longest.",
    questions: [
      ["What are you grateful to her for?", "Thank you for…"],
      ["Which words have you long wanted to say to her?", "What I never said"],
      ["Which of her qualities makes your family warmer?", "Your warmth"],
      ["Which moment beside her will you remember forever?", "The moment that stayed"],
      ["What does she mean to your family today?", "Who you are to us"],
      ["If you could do just one thing for her, what would it be?", "What I would do for you"],
    ],
  },
  {
    key: "wishes",
    title: "Wishes and a letter",
    epigraph: "Kind words are a gift that stays.",
    questions: [
      ["What do you wish for her in life and in the family?", "My wishes"],
      ["What do you want her to know always?", "So that you know"],
      ["What do you dream of for her and for your shared family?", "My dreams for us"],
      ["What will you promise her?", "My promise"],
      ["Write her a letter from the heart.", "A letter to you"],
    ],
  },
];
