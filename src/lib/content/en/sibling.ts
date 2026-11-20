import type { ChapterDef } from "../types";

// A book for a brother or sister. [he|she] and similar markers are the recipient’s gender (first = male); the author’s gender needs no markers in English.

export const siblingChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "Instead of a foreword",
    epigraph: "We grew up under one roof — and that stays forever.",
    questions: [
      [
        "Who are you to each other — older, younger, twins? Why did you decide to write this book for your [brother|sister]?",
        "Why I am writing this book",
        "A few warm words: what is the book for — a birthday, a wedding, a send-off or just because?",
      ],
      ["Describe [him|her] in three words.", "You in three words"],
      ["What is the age gap between you, and how did it feel in different years?", "Our age gap"],
      ["What do you call each other at home? Where did the nicknames come from?", "Our nicknames"],
    ],
  },
  {
    key: "childhood",
    title: "Our childhood",
    questions: [
      ["What is your first memory of [him|her]?", "My first memory of you"],
      ["How did you share a room, toys and your parents’ attention?", "One room for two"],
      ["What did you play together?", "Our games"],
      ["How did you quarrel — and how did you make up?", "How we quarrelled and made up"],
      ["What prank did you pull off together and hide from your parents?", "Our secret from our parents"],
      ["Who stood up for whom in the yard or at school?", "Who stood up for whom"],
      ["Which summer, trip or holiday from childhood do you remember best?", "That summer"],
      ["What gift did [he|she] give you in childhood that you still remember?", "A gift from childhood"],
    ],
  },
  {
    key: "family",
    title: "Our family",
    questions: [
      ["What was [he|she] like in your parents’ eyes — the favourite, the rebel, the helper?", "You and our parents"],
      ["Which family traditions do you remember from childhood?", "Our traditions"],
      ["Which family stories do you tell together, interrupting each other?", "Stories we tell together"],
      ["Which of your parents’ phrases do you both still repeat?", "As our parents used to say"],
      ["How did you plan a surprise for your parents?", "A surprise for our parents"],
      ["How did you stick together when the family was going through a hard time?", "When times were hard"],
      ["How are you alike, and how are you completely different?", "We are alike — and not"],
    ],
  },
  {
    key: "you",
    title: "You through my eyes",
    questions: [
      ["What kind of [brother|sister] is [he|she]?", "The [brother|sister] you are"],
      ["What do you value most in [him|her]?", "What I value in you"],
      ["What is [his|her] talent?", "Your talent"],
      ["Which of [his|her] phrases and habits make you laugh?", "Your phrases and habits"],
      ["How does [he|she] surprise you?", "How you surprise me"],
      ["When were you proud of [him|her]?", "When I was proud of you"],
      ["What have you learned from [him|her]?", "What I learned from you"],
    ],
  },
  {
    key: "grownup",
    title: "We grew up",
    questions: [
      ["How did your relationship change when you grew up?", "How we grew up"],
      ["Was there a time when you drifted apart? How did you become close again?", "How we grew close again"],
      ["How did [he|she] support you in a hard moment?", "When you were there for me"],
      ["Which of [his|her] pieces of advice do you remember?", "Your advice"],
      ["How did you first meet [his|her] other half? What did you think?", "Your other half"],
      ["What kind of [uncle|aunt] is [he|she] to your children — or what kind will [he|she] be?", "You as [an uncle|an aunt]"],
      ["What is the funniest thing that has happened to you as adults?", "The funniest story"],
    ],
  },
  {
    key: "future",
    title: "Looking ahead",
    questions: [
      ["What do you dream about together?", "Our dreams"],
      ["What must you absolutely do together?", "What we will do together"],
      ["Where do you dream of travelling together?", "Our journey"],
      ["Which tradition would you like to start or keep?", "Our tradition for the future"],
      ["How do you see yourselves twenty years from now?", "Us in twenty years"],
      ["What will you promise [him|her]?", "My promise"],
    ],
  },
  {
    key: "thanks",
    title: "Thank you",
    questions: [
      ["What are you grateful to [him|her] for?", "Thank you for…"],
      ["What would you like to apologise for — something from childhood or from adult life?", "Forgive me for…"],
      ["What would you like [him|her] to know?", "What you should know"],
      ["What do you wish for [him|her]?", "My wishes"],
      ["Why do you love [him|her]? List the reasons.", "Why I love you"],
      ["Write a letter to your [brother|sister] from the heart.", "A letter to you"],
    ],
  },
];
