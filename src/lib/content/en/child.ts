import type { ChapterDef } from "../types";

// A book for a daughter or son — from Mum or Dad. […|…] — the child: [he|she] (first = son, second = daughter).
// Chapter keys and the number of questions are identical to the Russian source.

export const childChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "In place of a preface",
    epigraph: "You are the best story that ever happened to me.",
    questions: [
      [
        "Introduce yourself: who are you to [him|her], and why did you decide to write this book?",
        "Why I am writing this book",
        "A few warm lines: what the occasion is — a birthday, graduation, coming of age, a wedding.",
      ],
      ["Describe [him|her] in three words.", "You in three words"],
      ["What pet names do you have for [him|her]? Where did they come from?", "What I call you"],
      ["How old is [he|she] now, and what is [he|she] like at this age?", "You now"],
    ],
  },
  {
    key: "waiting",
    title: "While we waited for you",
    questions: [
      ["How did you find out you were going to have a child? What did you feel?", "The day I found out about you"],
      ["What did you imagine your child would be like?", "How I imagined you"],
      ["How did you choose the name? What does it mean?", "Your name"],
      ["How did you get ready for [his|her] arrival — what did you buy, what did you prepare, who was the most excited?", "We got ready"],
      ["How did the day [he|she] was born go?", "The day you were born"],
      ["What did you feel when you first held [him|her]?", "Our first meeting"],
    ],
  },
  {
    key: "baby",
    title: "Your first years",
    questions: [
      ["What was [he|she] like as a tiny baby? How did [he|she] sleep, eat, fuss?", "You as a little one"],
      ["Do you remember the first smile, the first word, the first steps?", "First smile, first word"],
      ["Which toy, fairy tale or song did [he|she] love most?", "Your favourite story"],
      ["What funny words and phrases did [he|she] come out with as a small child?", "Your funny words"],
      ["Which story from [his|her] early childhood do you tell everyone?", "The story I tell everyone"],
      ["Do you remember the sleepless nights? What kept you awake, and what helped?", "Sleepless nights"],
      ["What family rituals began back then — at bedtime, at weekends?", "Our rituals"],
    ],
  },
  {
    key: "growing",
    title: "You are growing up",
    questions: [
      ["How did [his|her] first day at nursery or school go?", "The first day of school"],
      ["What was [he|she] passionate about in different years?", "Your interests"],
      ["Which of [his|her] friends do you remember?", "Your friends"],
      ["What did [he|she] do that surprised or touched you?", "When you surprised me"],
      ["When were you especially proud of [him|her]?", "When I was proud of you"],
      ["What difficulties did [he|she] overcome? How were you there for [him|her]?", "You got through it"],
      ["What is the funniest thing that ever happened to [him|her]?", "The funniest story"],
      ["What was [he|she] like as a teenager? What was hard — for [him|her] and for you?", "You as a teenager"],
    ],
  },
  {
    key: "family",
    title: "Our family",
    questions: [
      ["Which family traditions does [he|she] love most?", "Our traditions"],
      ["Where did you travel together? Which trip do you remember best?", "Our travels"],
      ["Which of [his|her] birthdays or celebrations do you remember best?", "That special celebration"],
      ["What do you both love doing together?", "Our thing together"],
      ["What does [he|she] have from you, and what is entirely [his|her] own?", "You are like me — and not"],
      ["What has [he|she] taught you?", "What you taught me"],
    ],
  },
  {
    key: "you",
    title: "You through my eyes",
    questions: [
      ["What kind of person is [he|she] — what character, what heart?", "What kind of person you are"],
      ["What do you value most in [him|her]?", "What I value in you"],
      ["What talent does [he|she] have — one everyone notices, or one only you know about?", "Your talent"],
      ["Which of [his|her] habits melts your heart?", "Your habit"],
      ["Which of [his|her] sayings have become family favourites?", "Your sayings"],
    ],
  },
  {
    key: "advice",
    title: "What I want to pass on to you",
    questions: [
      ["What is the main piece of advice you want to give [him|her]?", "My main advice"],
      ["What have you learned about life that will be useful to [him|her]?", "What I learned about life"],
      ["Which of your mistakes would you not want [him|her] to repeat?", "My mistakes"],
      ["What do you want to tell [him|her] about love and family?", "About love"],
      ["What would you like to tell [him|her] about your roots — grandmothers, grandfathers, the family line?", "Where we come from"],
      ["What would you like to say to [him|her] for the times when things get hard?", "When things get hard"],
    ],
  },
  {
    key: "future",
    title: "Looking ahead",
    questions: [
      ["What do you dream of for [him|her]?", "My dreams for you"],
      ["How do you picture [him|her] in ten years?", "You in ten years"],
      ["What do you definitely want to do together?", "What we will do together"],
      ["What will you promise [him|her]?", "My promise"],
    ],
  },
  {
    key: "thanks",
    title: "Thank you for being you",
    questions: [
      ["What are you grateful to [him|her] for?", "Thank you for…"],
      ["What should [he|she] always know, whatever happens?", "What you should know"],
      ["Why do you love [him|her]? List the reasons.", "Why I love you"],
      ["Write a letter to your [son|daughter] from the bottom of your heart.", "A letter to you"],
    ],
  },
];
