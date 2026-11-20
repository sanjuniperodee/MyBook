import type { ChapterDef } from "../types";

// A book for a manager or director — from a team, a department or a single employee. [he|she] marks the manager's gender (first option = male).
// English has no gendered verb forms for the author, so there are no {..|..} markers here.
// Titles address the manager respectfully, as in a letter. Chapter keys and question counts are identical to the Russian source.

export const bossChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "Instead of a foreword",
    epigraph: "A good manager is someone beside whom you want to work better.",
    questions: [
      [
        "Introduce yourself: who are you — an employee, a department, the whole team — and why did you decide to write this book?",
        "Why this book",
        "A few warm lines: who is writing and what is the occasion — a birthday, an anniversary, a promotion, a move to a new job, Professional Day.",
      ],
      ["Describe [him|her] in three words.", "You in three words"],
      ["What do you call [him|her]? Does [he|she] have a nickname in the team that [he|she] knows about — or doesn’t?", "What we call you"],
      ["What position does [he|she] hold, and how many years have you worked together?", "Your position and our years"],
    ],
  },
  {
    key: "meet",
    title: "Getting to know you",
    questions: [
      ["How did you first see [him|her]? How was it — an interview, a meeting, the first day?", "First meeting"],
      ["What was your first impression of [him|her]?", "First impression"],
      ["What had you heard about [him|her] before you started working together?", "What they said about you"],
      ["What did you feel when [he|she] first gave you a task?", "The first task"],
      ["When did you realise you were working with an exceptional manager?", "When I realised you are an exceptional manager"],
      ["What changed in the team when [he|she] arrived?", "What changed with you"],
    ],
  },
  {
    key: "leader",
    title: "How you lead",
    epigraph: "An ordinary working day says a lot about a manager.",
    questions: [
      ["What does an ordinary working day beside [him|her] look like? What does [he|she] do first thing in the morning?", "Your ordinary day"],
      ["How does [he|she] set tasks and explain what [he|she] wants?", "How you set tasks"],
      ["How does [he|she] make decisions — quickly, carefully, by consulting the team?", "How you decide"],
      ["How does [he|she] react to mistakes — [his|her] own and other people’s?", "You and mistakes"],
      ["Which of [his|her] phrases and favourite words does the whole team know?", "Your phrases"],
      ["What is [he|she] like in team briefings and meetings?", "In team briefings"],
      ["How does [he|she] give praise, and how does [he|she] give feedback?", "Praise and feedback"],
    ],
  },
  {
    key: "team",
    title: "The team beside you",
    questions: [
      ["What is the atmosphere in the team when [he|she] is in, and when [he|she] is away?", "The atmosphere in the team"],
      ["How does [he|she] support people in difficult moments?", "How you support people"],
      ["What team tradition did [he|she] start?", "Our tradition"],
      ["How does [he|she] celebrate the team’s successes and congratulate colleagues?", "How we celebrate successes"],
      ["How does [he|she] treat newcomers and help them settle in?", "Newcomers beside you"],
      ["Which office party, trip or celebration do you remember with a smile?", "Our celebration"],
    ],
  },
  {
    key: "lessons",
    title: "What you taught us",
    epigraph: "A manager’s lessons stay with you for a whole career.",
    questions: [
      ["What did you learn from [him|her] at work?", "What I learned from you"],
      ["What advice did [he|she] give that you remember?", "Advice I remember"],
      ["What did you pick up from [him|her] — a habit, an approach, a phrase?", "What I took from you"],
      ["When did [he|she] believe in you more than you believed in yourself?", "When you believed in me"],
      ["How does [he|she] help people grow — by giving difficult tasks, by trusting them, by letting go?", "How you help us grow"],
      ["What changed in your attitude to work beside [him|her]?", "How you changed me"],
    ],
  },
  {
    key: "hard",
    title: "Hard and important days",
    questions: [
      ["What was the hardest period your team went through? How did [he|she] behave?", "A hard period"],
      ["Which project or result do you remember together with pride?", "Our victory"],
      ["Which of [his|her] actions as a manager will you remember forever?", "An action I remember"],
      ["When did [he|she] stand up for the team?", "When you stood up for us"],
      ["What did you understand about [him|her] from the way [he|she] carried on through difficult days?", "What you were like on hard days"],
    ],
  },
  {
    key: "person",
    title: "You as a person",
    questions: [
      ["What is [he|she] like outside meetings — at lunch, on a trip, at a celebration?", "Outside the office"],
      ["What are [his|her] interests? What did you learn about [him|her] that did not come from work conversations?", "Beyond the job title"],
      ["Which of [his|her] habits or traits has everyone remembered?", "Your habit"],
      ["What do you value most in [him|her] as a person?", "What I value in you"],
      ["What does [he|she] tell you about [his|her] family and about how it all began?", "Your story"],
    ],
  },
  {
    key: "thanks",
    title: "Thank you and best wishes",
    epigraph: "Managers are rarely thanked out loud — let us do it here.",
    questions: [
      ["What are you grateful to [him|her] for?", "Thank you for…"],
      ["What did you want to tell [him|her] but never had the chance?", "What I never said"],
      ["What do you wish [him|her] — at work, in the family, in life?", "My wishes"],
      ["What will you promise [him|her], from yourself and from the team?", "Our promise"],
      ["Write [him|her] a letter from the heart.", "A letter to you"],
    ],
  },
];
