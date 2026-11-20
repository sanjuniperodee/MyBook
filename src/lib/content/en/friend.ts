import type { ChapterDef } from "../types";

// A book for a friend. […|…] — the friend: [he|she] (first = male, second = female).
// Chapter keys and the number of questions are identical to the Russian source.

export const friendChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "In place of a preface",
    epigraph: "A friend is someone who knows everything about you and is still there.",
    questions: [
      [
        "Introduce yourself: who are you, and why did you decide to write this book for your friend?",
        "Why I am writing this book",
        "A few warm lines: who you are and what the occasion for this book is.",
      ],
      ["Describe [him|her] in three words.", "You in three words"],
      ["How many years have you been friends? What has changed in that time?", "How many years of our friendship"],
      ["What nicknames did you come up with for each other?", "Our nicknames"],
    ],
  },
  {
    key: "meet",
    title: "How we became friends",
    questions: [
      ["How and where did you meet?", "How we met"],
      ["What was your first impression of [him|her]?", "My first impression"],
      ["When did you realise this was real friendship?", "When I realised we were friends"],
      ["What moment made you truly close?", "The moment that brought us closer"],
      ["What brought you together?", "What brought us together"],
      ["What was [he|she] like when you first met?", "You then and now"],
    ],
  },
  {
    key: "you",
    title: "You through my eyes",
    questions: [
      ["What kind of friend is [he|she]?", "What kind of friend you are"],
      ["What do you value most in [him|her]?", "What I value in you"],
      ["Which of [his|her] sayings do you keep repeating?", "Your sayings"],
      ["How does [he|she] surprise you?", "How you surprise me"],
      ["What talent does [he|she] have?", "Your talent"],
      ["What does [he|she] do better than anyone?", "You are the best at…"],
      ["Which of [his|her] habits makes you laugh?", "Your habit"],
      ["When were you proud of [him|her]?", "When I was proud of you"],
    ],
  },
  {
    key: "adventures",
    title: "Our adventures",
    questions: [
      ["What is your craziest adventure?", "Our crazy adventure"],
      ["Where did you travel together?", "Our trips"],
      ["Which party or celebration do you remember best?", "The celebration I remember"],
      ["What did not go to plan but turned into a great story?", "Nothing went to plan"],
      ["Which place do you consider “yours”?", "Our place"],
      ["What music did you listen to together?", "Our soundtrack"],
      ["What traditions do you share?", "Our traditions"],
      ["What escapade have you been meaning to pull off for ages?", "An adventure for the future"],
    ],
  },
  {
    key: "fun",
    title: "Funny stories",
    questions: [
      ["What is the funniest thing that ever happened to you two?", "The funniest story"],
      ["What jokes do you have that only the two of you understand?", "Inside jokes"],
      ["What is the most absurd moment you lived through together?", "An absurd moment"],
      ["What did you laugh about until you cried?", "Laughing until we cried"],
      ["What did [he|she] do that you will never let [him|her] forget?", "I will never let you forget this"],
    ],
  },
  {
    key: "support",
    title: "Always there",
    questions: [
      ["How did [he|she] support you at a difficult moment?", "When you were there for me"],
      ["Which of [his|her] pieces of advice do you remember?", "Your advice"],
      ["What secrets did you trust each other with (no details needed)?", "Our secrets"],
      ["Was there an argument after which you became even closer?", "The argument that brought us closer"],
      ["What have you learned from [him|her]?", "What I learned from you"],
      ["How has your friendship changed over the years?", "How our friendship has changed"],
    ],
  },
  {
    key: "future",
    title: "Looking ahead",
    questions: [
      ["What dreams do you share?", "Our dreams"],
      ["Where do you see your friendship in ten years?", "Us in ten years"],
      ["What do you absolutely have to do together?", "Our to-do list for two"],
      ["What will you promise [him|her]?", "My promise"],
    ],
  },
  {
    key: "thanks",
    title: "Thank you",
    questions: [
      ["What are you grateful to [him|her] for?", "Thank you for…"],
      ["What would you like [him|her] to know?", "What you should know"],
      ["Why do you love [him|her]? List the reasons.", "Why I love you"],
      ["Write a letter to your friend from the bottom of your heart.", "A letter to you"],
    ],
  },
];
