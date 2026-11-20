import type { ChapterDef } from "../types";

// A book for Grandma, from a grandson or granddaughter. The recipient is always female, so no recipient markers are needed.
// Chapter keys and the number of questions match the Russian source.

export const grandmaChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "Instead of a foreword",
    epigraph: "Grandma’s home is the place where someone is always waiting for you.",
    questions: [
      [
        "Introduce yourself: who are you to her — a grandson, a granddaughter, a great-grandchild — and why did you decide to write this book?",
        "Why I am writing this book",
        "A few warm words: what is the book for — a milestone birthday, a birthday, 8 March or just because?",
      ],
      ["Describe your grandmother in three words.", "You in three words"],
      ["What do you call her — Grandma, Granny, azhe, apa? Where did that name come from?", "What I call you"],
      ["How many grandchildren and great-grandchildren does she have? Tell us who is who.", "Your grandchildren"],
    ],
  },
  {
    key: "home",
    title: "Grandma’s home",
    questions: [
      ["What was her home like when you were a child?", "Your home"],
      ["What did Grandma’s house smell like? Which sounds, smells and things do you remember?", "The smells of childhood"],
      ["What appeared on her dastarkhan (the family table) when guests came?", "Your dastarkhan"],
      ["Which of her dishes could you never mistake for any other? Do you know the recipe?", "Your signature dish"],
      ["Which corner of her house or yard was your favourite?", "My favourite corner"],
      ["What were holidays or weekends at Grandma’s like?", "Holidays at your place"],
    ],
  },
  {
    key: "care",
    title: "Your care",
    questions: [
      ["How did she look after you when you were a child?", "How you looked after me"],
      ["What fairy tales, songs or lullabies did you hear from her?", "Your stories"],
      ["What did she teach you to do with her own hands — cook, sew, plant, count?", "What you taught me"],
      ["How did she comfort you when you were hurt or upset?", "When you comforted me"],
      ["How did she spoil you? What did she allow that your parents did not?", "Only at Grandma’s"],
      ["How did she get angry — if she ever did?", "When you were cross"],
    ],
  },
  {
    key: "life",
    title: "Your life",
    questions: [
      ["What do you know about her childhood and her parents?", "Your childhood"],
      ["How did she meet Grandpa?", "You and Grandpa"],
      ["What did she do for a living? What is she proud of in her work?", "Your work"],
      ["Which hard times did she have to live through?", "What you lived through"],
      ["Which story from her life does she love to tell?", "Your favourite story"],
      ["What was she like when she was young, judging by photographs and stories?", "You when you were young"],
      ["Which of her actions do you admire?", "What I admire in you"],
    ],
  },
  {
    key: "you",
    title: "You through my eyes",
    questions: [
      ["What is her character like? What makes her unlike anyone else?", "What you are like"],
      ["Which of her little sayings, proverbs and expressions do you remember?", "Your sayings"],
      ["Which of her habits makes you smile with tenderness?", "Your habit"],
      ["What is she passionate about now?", "Your hobbies"],
      ["What do you value most in her?", "What I value in you"],
      ["When were you proud of her?", "When I was proud of you"],
    ],
  },
  {
    key: "family",
    title: "Our family",
    questions: [
      ["Which family traditions rest on Grandma?", "The traditions you keep"],
      ["Which family celebration at her place do you remember best?", "That very celebration"],
      ["Which of her blessings and words of farewell were heard at important moments?", "Your blessing"],
      ["What did she tell you about the family line, the ancestors, where we come from?", "Where we come from"],
      ["What is the funniest thing that ever happened to Grandma?", "The funniest story"],
    ],
  },
  {
    key: "wisdom",
    title: "Your wisdom",
    questions: [
      ["Which piece of her advice do you still remember?", "Your advice"],
      ["What does she say about love and family?", "You on love"],
      ["What has her life taught you?", "What your life taught me"],
      ["Which of her lessons will you pass on to your own children?", "What I will pass on to my children"],
      ["What would you still like to ask her?", "What I want to ask you"],
    ],
  },
  {
    key: "thanks",
    title: "Thank you",
    questions: [
      ["What are you grateful to Grandma for?", "Thank you for…"],
      ["What did you want to tell her but never did?", "What I never said"],
      ["What do you wish for her?", "My wishes"],
      ["What will you promise her?", "My promise"],
      ["Why do you love her? List the reasons.", "Why I love you"],
      ["Write a letter to your grandmother from the heart.", "A letter to you"],
    ],
  },
];
