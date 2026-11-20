import type { ChapterDef } from "../types";

// A book for Grandpa, from a grandson or granddaughter. The recipient is always male, so no recipient markers are needed.
// Chapter keys must not change after launch: language switching, analytics and the CRM depend on them.

export const grandpaChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "Instead of a foreword",
    epigraph: "Grandpa’s hands are the most reliable support.",
    questions: [
      [
        "Introduce yourself: who are you to him — a grandson, a granddaughter, a great-grandchild — and why did you decide to write this book?",
        "Why I am writing this book",
        "A few warm words: what is the book for — a milestone birthday, a birthday or just because?",
      ],
      ["Describe your grandfather in three words.", "You in three words"],
      ["What do you call him — Grandpa, Grandad, ata, atai? Where did that name come from?", "What I call you"],
      ["How many grandchildren and great-grandchildren does he have? Tell us who is who.", "Your grandchildren"],
    ],
  },
  {
    key: "home",
    title: "Grandpa’s home",
    epigraph: "It smelled of wood shavings, petrol and bread.",
    questions: [
      ["What was his home like when you were a child?", "Your home"],
      ["What did Grandpa’s place smell like — the house, the garage, the workshop?", "The smells of childhood"],
      ["What could he make with his hands? What in the house was made by him?", "Made by your hands"],
      ["Where did you love to sit with him — in the yard, in the kitchen, in the car?", "Our places"],
      ["What were holidays or weekends at Grandpa’s like?", "Holidays at your place"],
      ["What did he cook, and what did you do together?", "Together with you"],
    ],
  },
  {
    key: "work",
    title: "Your trade",
    epigraph: "Whatever your hands have made will outlive us.",
    questions: [
      ["What did he do for a living? What is he proud of in his work?", "Your work"],
      ["Which of his tools and things do you remember?", "Your tools"],
      ["What did he teach you — to hold a hammer, to fix things, to drive, to count?", "What you taught me"],
      ["Which of his pieces of advice about work or money do you remember?", "Advice about work"],
      ["Did he have a mentor, or someone he looked up to?", "Your teacher"],
      ["Which of his working days, or which of his actions, stayed with you?", "A day I remember"],
    ],
  },
  {
    key: "life",
    title: "Your life",
    questions: [
      ["What do you know about his childhood and his parents?", "Your childhood"],
      ["How did he meet Grandma?", "You and Grandma"],
      ["Which hard times did he have to live through?", "What you lived through"],
      ["Which story from his life does he love to tell?", "Your favourite story"],
      ["What was he like when he was young, judging by photographs and stories?", "You when you were young"],
      ["Did he serve in the army, or travel around the country? What did he tell you?", "Your roads"],
      ["Which of his actions do you admire?", "What I admire in you"],
    ],
  },
  {
    key: "you",
    title: "You through my eyes",
    questions: [
      ["What is his character like? What makes him unlike anyone else?", "What you are like"],
      ["Which of his little sayings, catchphrases and jokes do you remember?", "Your sayings"],
      ["Which of his habits makes you smile or laugh?", "Your habit"],
      ["What is he passionate about now — fishing, the garden, his car, football?", "Your hobbies"],
      ["What do you value most in him?", "What I value in you"],
      ["When were you proud of him?", "When I was proud of you"],
    ],
  },
  {
    key: "family",
    title: "Our family",
    questions: [
      ["Which family traditions rest on Grandpa?", "The traditions you keep"],
      ["Which family celebration with him do you remember best?", "That very celebration"],
      ["Which of his blessings and words of farewell were heard at important moments?", "Your blessing"],
      ["What did he tell you about the family line, the ancestors, where we come from?", "Where we come from"],
      ["What is the funniest thing that ever happened to Grandpa?", "The funniest story"],
    ],
  },
  {
    key: "wisdom",
    title: "Your wisdom",
    questions: [
      ["Which piece of his advice do you still remember?", "Your advice"],
      ["What does he say about a person’s word, honour and family?", "You on honour"],
      ["What has his life taught you?", "What your life taught me"],
      ["Which of his lessons will you pass on to your own children?", "What I will pass on to my children"],
      ["What would you still like to ask him?", "What I want to ask you"],
    ],
  },
  {
    key: "thanks",
    title: "Thank you",
    questions: [
      ["What are you grateful to Grandpa for?", "Thank you for…"],
      ["What did you want to tell him but never did?", "What I never said"],
      ["What do you wish for him?", "My wishes"],
      ["What will you promise him?", "My promise"],
      ["Why do you love him? List the reasons.", "Why I love you"],
      ["Write a letter to your grandfather from the heart.", "A letter to you"],
    ],
  },
];
