import type { ChapterDef } from "../types";

// A book for the family — from one of its members. The recipient is the whole family, so no [..|..] markers are needed.
// Chapter keys and question counts are identical to the Russian original.
// Chapter keys must not be changed after launch: language switching, analytics and the CRM rely on them.

export const familyChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "Instead of a foreword",
    epigraph: "Family is a beginning and a support.",
    questions: [
      [
        "Introduce yourself: who are you, and why did you decide to write a book about your family?",
        "Why I’m writing this book",
        "A few warm lines: who you are, what occasion this book is for, and what you want to preserve.",
      ],
      ["Describe your family in three words.", "Us in three words"],
      ["How many of you are there — parents, children, grandmothers and grandfathers? Tell us who is who.", "Who is who"],
      ["What do people call you at home? Where did the nicknames come from?", "Our nicknames"],
    ],
  },
  {
    key: "roots",
    title: "Roots and ancestry",
    epigraph: "Roots hold the tree, ancestry holds the person.",
    questions: [
      ["Where does your family come from? Which place do you consider your own?", "Where we come from"],
      ["What do you know about your great-grandmothers and great-grandfathers?", "Great-grandmothers and great-grandfathers"],
      ["Where does your surname come from, and what does it mean?", "Our surname"],
      ["Which stories about your ancestors are passed down in the family?", "Family legends"],
      ["How did your family end up where it lives now?", "How we came to be here"],
      ["Which relatives do you remember with special warmth?", "Warm names"],
    ],
  },
  {
    key: "home",
    title: "Our home",
    epigraph: "A home is not its walls, but the people in it.",
    questions: [
      ["What was the home you grew up in like — where did it stand, what was your room like?", "Our home"],
      ["What did home smell like? Which sounds, things and scents do you remember?", "The scents of childhood"],
      ["What did your family table look like on holidays and on ordinary days?", "Our table"],
      ["Which rule in your home was the most important?", "The main rule"],
      ["Who in the family was responsible for what — the household, the celebrations, the money?", "Who was responsible for what"],
      ["Which corner of the house or yard was your favourite?", "My favourite corner"],
    ],
  },
  {
    key: "traditions",
    title: "Traditions and holidays",
    epigraph: "Traditions are memories that we repeat.",
    questions: [
      ["Which holidays does your family always celebrate?", "Our holidays"],
      ["How do you celebrate Nauryz, or another holiday that is especially dear to you?", "A favourite holiday"],
      ["What always appears on the dastarkhan (the family table)? Who keeps the family recipe?", "Our dastarkhan"],
      ["Which customs and rituals does your family observe?", "Our customs"],
      ["How do you usually welcome guests?", "Guests in our home"],
      ["Which family traditions do you want to keep?", "What we will keep"],
    ],
  },
  {
    key: "people",
    title: "Our loved ones",
    questions: [
      ["Who in the family do you consider its heart? Why?", "The heart of the family"],
      ["Which photographs in the family album are the most important?", "The most important photos"],
      ["Who in the family can do what others can’t — bake, fix things, calm everyone down?", "Golden hands"],
      ["What are your brothers and sisters like? How did you grow up together?", "Our childhood"],
      ["Who in the family do you resemble, and in what way?", "Our shared traits"],
      ["Who from the family is no longer with us? What do you remember about them?", "Those we remember"],
      ["What is your family proud of?", "Our pride"],
    ],
  },
  {
    key: "lessons",
    title: "What family teaches",
    questions: [
      ["What did the elders teach you — by example, not just by words?", "What the elders taught me"],
      ["Which piece of advice from the family do you still remember?", "Family advice"],
      ["What does your family say about honour and keeping your word?", "About honour and keeping your word"],
      ["How do you usually talk about money and work?", "About money and work"],
      ["How do family members support each other in a hard moment?", "A shoulder to lean on"],
      ["Which of these lessons will you pass on to your children?", "What I will pass on to my children"],
    ],
  },
  {
    key: "hard",
    title: "Hard times",
    questions: [
      ["Which trials fell to your family?", "Our trials"],
      ["Who helped you get through them?", "Who helped"],
      ["What changed afterwards?", "What changed"],
      ["Whose action in the family will you never forget?", "An act I remember"],
      ["What did those years teach the family?", "What we learned"],
    ],
  },
  {
    key: "thanks",
    title: "Thank you",
    epigraph: "We often leave the most precious things unsaid.",
    questions: [
      ["What are you grateful to your family for?", "Thank you, family, for…"],
      ["What did you want to tell your loved ones but never did?", "What I never said"],
      ["What do you want to preserve for those who come after us?", "For those who come after us"],
      ["What will you promise your family?", "My promise"],
      ["What do you wish for each person in the family?", "My wishes"],
      ["Write your family a letter from the bottom of your heart.", "A letter to my family"],
    ],
  },
];
