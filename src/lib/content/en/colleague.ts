import type { ChapterDef } from "../types";

// A book for a colleague — from a colleague, a team or a department. [he|she] marks the colleague's gender (first option = male).
// English has no gendered verb forms for the author, so there are no {..|..} markers here.
// Chapter keys and question counts are identical to the Russian source.

export const colleagueChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "Instead of a foreword",
    epigraph: "You spend half your life beside the people you work with.",
    questions: [
      [
        "Introduce yourself: who are you to [him|her] — a colleague in the department, the desk next door, the whole team — and why did you decide to write this book?",
        "Why this book",
        "A few warm lines: what is the occasion — a birthday, an anniversary, leaving for a holiday or a new job, a promotion, Professional Day.",
      ],
      ["Describe [him|her] in three words.", "You in three words"],
      ["What do you call [him|her]? Does [he|she] have a nickname in the team?", "What we call you"],
      ["Where and as what does [he|she] work, and how many years have you been in the same team?", "Your role and our years"],
    ],
  },
  {
    key: "meet",
    title: "How we met",
    questions: [
      ["How did you first see [him|her] — in the office or in the work chat?", "First meeting"],
      ["What was your first impression of [him|her]?", "First impression"],
      ["What were you told about [him|her] before you met?", "What they said about you"],
      ["When did you first work together? What was the task?", "Our first shared task"],
      ["When did you realise you could work with [him|her] without worry?", "When I realised I could count on you"],
      ["What changed in the team when [he|she] joined?", "What changed with you"],
    ],
  },
  {
    key: "work",
    title: "Side by side at work",
    epigraph: "Work is easier when there is someone you can rely on.",
    questions: [
      ["What does an ordinary working day beside [him|her] look like?", "An ordinary day"],
      ["What is [he|she] better at than anyone else in the team?", "Your strong side"],
      ["What task did you solve together, and how did it end?", "The task we solved"],
      ["How does [he|she] handle deadlines — well in advance, at the last minute, on the go?", "You and deadlines"],
      ["What do you value in [his|her] way of working?", "How you work"],
      ["Which of [his|her] decisions or ideas pleasantly surprised you?", "An idea I remember"],
      ["How does [he|she] share knowledge and help newcomers?", "How you help"],
    ],
  },
  {
    key: "you",
    title: "What you are like",
    questions: [
      ["What kind of colleague is [he|she]? What sets [him|her] apart from others?", "What kind of colleague you are"],
      ["What do you value most in [him|her] as a person?", "What I value in you"],
      ["What is [his|her] sense of humour like? Which joke does the whole team remember?", "Your humour"],
      ["What does [he|she] drink in the office, and what does [he|she] bring to tea?", "Your tea and coffee"],
      ["Which of [his|her] habits or favourite phrases does the whole team know?", "Your habits"],
      ["What is [he|she] like outside work — the hobbies you found out about over lunch?", "What you love outside work"],
    ],
  },
  {
    key: "moments",
    title: "Our stories",
    epigraph: "Stories like these are what is left from ordinary days.",
    questions: [
      ["Which working day do you remember with a smile?", "A day I remember"],
      ["Which office party, trip or celebration stayed in your memory?", "Our celebration"],
      ["What funny thing happened to [him|her], or to the two of you together?", "A funny story"],
      ["Which conversation over tea or on a break do you remember most?", "A conversation I remember"],
      ["What did you do together as a team outside the office?", "Outside the office"],
      ["What joke, meme or in-house phrase belongs only to your team?", "Our inside jokes"],
    ],
  },
  {
    key: "hard",
    title: "Hard days",
    questions: [
      ["What was the hardest period you went through at work? How did [he|she] behave then?", "A hard period"],
      ["When did [he|she] come to the rescue — for you or for the whole team?", "When you came to the rescue"],
      ["How does [he|she] react to mistakes — [his|her] own and other people’s?", "You and mistakes"],
      ["How did [he|she] support you when things were difficult?", "Your support"],
      ["What advice did [he|she] give that you remember?", "Advice I remember"],
    ],
  },
  {
    key: "lessons",
    title: "What I learned from you",
    questions: [
      ["What did you learn from [him|her] at work?", "What I learned from you"],
      ["What did you pick up from [him|her] — a habit, an approach, a phrase?", "What I took from you"],
      ["How are you different from [him|her] — and why is that good for the team?", "How we are different"],
      ["What changed in your attitude to work beside [him|her]?", "How you changed me"],
    ],
  },
  {
    key: "thanks",
    title: "Thank you and best wishes",
    epigraph: "“Thank you” is rarely written in a work chat — let us say it here.",
    questions: [
      ["What are you grateful to [him|her] for?", "Thank you for…"],
      ["What did you want to tell [him|her] but never had time for in the rush?", "What I never said"],
      ["What do you wish [him|her] at work and in life?", "My wishes"],
      ["What will you promise [him|her], from yourself and from the team?", "My promise"],
      ["Write [him|her] a letter from the heart.", "A letter to you"],
    ],
  },
];
