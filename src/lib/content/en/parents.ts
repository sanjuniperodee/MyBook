import type { ChapterDef } from "../types";

// A book for Mom and Dad together — from their child. The recipient is plural, so no [..|..] markers are needed;
// the recipient’s gender plays no part in the text. Chapter keys and question counts are identical to the Russian original.
// Chapter keys must not be changed after launch: language switching, analytics and the CRM rely on them.

export const parentsChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "Instead of a foreword",
    epigraph: "Everything I have began with the two of you.",
    questions: [
      [
        "Introduce yourself: who are you, and why did you decide to write this book for your parents?",
        "Why I’m writing this book",
        "A few warm lines: who you are, what occasion this book is for, and what you want to say to them.",
      ],
      ["Describe your parents in three words.", "You in three words"],
      ["What do you call them — Mom and Dad, ana and ake, Mummy and Daddy? Where did that habit come from?", "What I call you"],
      ["How many children and grandchildren do they have? Tell us who is who.", "Your children and grandchildren"],
      ["What was your family like when you were a child?", "Our family back then"],
    ],
  },
  {
    key: "home",
    title: "Our home",
    epigraph: "A home is what you built together.",
    questions: [
      ["What was your home like when you were a child — where did it stand, what was your room like?", "Our home"],
      ["What did home smell like? Which sounds, things and scents do you remember?", "The scents of childhood"],
      ["What appeared on the table on holidays, and what was on it every day?", "Your table"],
      ["Which of your parents did what around the house, and how did they share the chores?", "Who was responsible for what"],
      ["Which rule in your home was the most important?", "The main rule"],
      ["Which corner of the house or yard was your favourite?", "My favourite corner"],
    ],
  },
  {
    key: "story",
    title: "Your story",
    questions: [
      ["Where and when were your mom and dad born? What do you know about their childhoods?", "Where it all began"],
      ["How did they meet and decide to be together?", "How you met"],
      ["Who did they dream of becoming, and how did they choose their work?", "Your calling"],
      ["Which hard times did they go through together?", "What you went through together"],
      ["Which of their decisions changed your family’s life?", "Your biggest decision"],
      ["Which story from their youth do you love the most?", "A story from your youth"],
      ["Which of their actions do you admire?", "What I admire in you"],
    ],
  },
  {
    key: "you",
    title: "You through my eyes",
    questions: [
      ["What are they like by nature? How is each of them different from the other?", "What you are like"],
      ["Which of them is stricter, and which is softer? How did that show?", "The strict one and the gentle one"],
      ["Which of their little words, sayings and jokes do you remember?", "Your sayings"],
      ["Which of their habits melts your heart?", "Your habit"],
      ["What do you value most in each of them?", "What I value in you"],
      ["When were you proud of them both?", "When I was proud of you"],
    ],
  },
  {
    key: "lessons",
    title: "Your lessons",
    epigraph: "I still hear your lessons to this day.",
    questions: [
      ["What did your parents teach you by example — cooking, fixing things, counting, driving?", "What you taught me"],
      ["Which of their pieces of advice do you still remember?", "Your advice"],
      ["How did they comfort you when you felt hurt or sad?", "When you comforted me"],
      ["How did they spoil you? What did they allow that others didn’t?", "Only with you"],
      ["How did your family talk about money, work and studies?", "About money and studies"],
      ["Which of their lessons have you passed on to your own children?", "What I will pass on to my children"],
    ],
  },
  {
    key: "family",
    title: "Our family",
    questions: [
      ["Which family traditions are kept alive by your parents?", "Traditions you keep"],
      ["Which family celebration do you remember best?", "That very celebration"],
      ["What words of blessing did they give you at important moments — graduation, a wedding, the birth of a child?", "Your blessing"],
      ["What did they tell you about your clan, your ancestors, where we come from?", "Where we come from"],
      ["How did they look after their own parents?", "Caring for the elders"],
      ["What is the funniest thing that ever happened with them?", "The funniest story"],
    ],
  },
  {
    key: "thanks",
    title: "Thank you",
    questions: [
      ["What are you grateful to your parents for?", "Thank you for…"],
      ["What did you want to tell them but never did?", "What I never said"],
      ["What do you wish for them?", "My wishes"],
      ["What will you promise them?", "My promise"],
      ["Why do you love them? List your reasons.", "Why I love you"],
      ["Write your parents a letter from the bottom of your heart.", "A letter to you"],
    ],
  },
];
