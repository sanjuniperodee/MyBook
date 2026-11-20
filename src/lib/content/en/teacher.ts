import type { ChapterDef } from "../types";

// A book for a teacher — from a pupil, a graduate, a parent or a whole class. […|…] — the teacher: [he|she] (first = male, second = female).
// Chapter keys and the number of questions are identical to the Russian source.

export const teacherChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "In place of a preface",
    epigraph: "A teacher is someone who sees more in you than you see yourself.",
    questions: [
      [
        "Introduce yourself: who are you — [his|her] pupil, a graduate, a parent or the whole class — and why did you decide to write this book?",
        "Why this book",
        "A few warm lines: who is writing and what the occasion is — Teachers’ Day, graduation, an anniversary.",
      ],
      ["How do you address [him|her]? Does [he|she] have a nickname that [he|she] knows about — or does not?", "What we call you"],
      ["Describe [him|her] in three words.", "You in three words"],
      ["What subject does [he|she] teach, and how many years have you known each other?", "Your subject and our years"],
    ],
  },
  {
    key: "meet",
    title: "First meeting",
    questions: [
      ["Do you remember the first lesson or your first meeting with [him|her]? How was it?", "The first lesson"],
      ["What was your first impression of [him|her]?", "First impression"],
      ["What was [he|she] like then — the voice, the look, the way of carrying [himself|herself]?", "What you were like then"],
      ["What had you heard about [him|her] before you joined [his|her] class?", "What they said about you"],
      ["When did you realise this was a special teacher?", "When I realised you were a special teacher"],
    ],
  },
  {
    key: "lessons",
    title: "Your lessons",
    questions: [
      ["What was a lesson with [him|her] like? Describe a perfectly ordinary lesson.", "Your lesson"],
      ["Which lesson do you still remember?", "The lesson I remember"],
      ["How did [he|she] explain difficult things so that everything became clear?", "How you explained"],
      ["Which of [his|her] phrases and sayings did the whole class know?", "Your sayings"],
      ["How did [he|she] give marks and check homework? What did [he|she] write in the exercise books?", "In red ink"],
      ["What tradition or ritual belonged only to [his|her] lessons?", "Our traditions"],
      ["Which assignment, project or competition do you remember best?", "The assignment I remember"],
      ["How did [he|she] keep order — with strictness, with a joke, or with a single look?", "Just one look from you"],
    ],
  },
  {
    key: "portrait",
    title: "You through your students’ eyes",
    questions: [
      ["What kind of teacher is [he|she]? How did [he|she] differ from the others?", "What kind of teacher you are"],
      ["What do you value most in [him|her]?", "What I value in you"],
      ["What is [he|she] like outside lessons — at break, on trips, at celebrations?", "Outside lessons"],
      ["What is [he|she] passionate about? What did you learn about [him|her] that was not in a textbook?", "Not from the textbook"],
      ["Which of [his|her] habits or traits did everyone remember?", "Your habit"],
      ["What was [his|her] classroom like? What hung on the walls, what stood on the desk?", "Your classroom"],
      ["When were you proud of [him|her]?", "When we were proud of you"],
    ],
  },
  {
    key: "class",
    title: "Our class",
    questions: [
      ["What was your class like? How would [he|she] describe it?", "Our class"],
      ["What is the funniest thing that ever happened in [his|her] lesson?", "The funniest lesson"],
      ["Which prank of the class did [he|she] forgive — or never find out about?", "Our prank"],
      ["Which celebration, trip or outing do you remember with [him|her]?", "Together"],
      ["How did [he|she] make peace in the class and help sort out quarrels?", "How you made peace between us"],
      ["What does the class have left as a keepsake of [him|her]: photos, certificates, a song, jokes?", "What we have left"],
    ],
  },
  {
    key: "support",
    title: "Always there",
    questions: [
      ["How did [he|she] support you at a difficult moment?", "When you were there for me"],
      ["How did [he|she] believe in you when you did not believe in yourself?", "You believed in me"],
      ["Which of [his|her] pieces of advice do you still remember?", "Your advice"],
      ["Was there a time when [he|she] was strict, and you later understood it was the right thing to do?", "Strictness we are thankful for"],
      ["What did [he|she] do beyond the job — for you or for the class?", "More than a job"],
    ],
  },
  {
    key: "legacy",
    title: "What you gave us",
    questions: [
      ["What did [he|she] teach you — apart from the subject?", "What you taught me"],
      ["How did [he|she] influence your choice of profession or path?", "My path began with you"],
      ["What from [his|her] lessons is still useful to you?", "It came in useful in life"],
      ["Which of [his|her] words would you pass on to your own children?", "Words I will pass on"],
      ["Who have [his|her] students become? Tell us about the graduates [he|she] can be proud of.", "Your graduates"],
      ["What did [he|she] change in you as a person?", "Who I became thanks to you"],
    ],
  },
  {
    key: "thanks",
    title: "Thank you",
    questions: [
      ["What are you grateful to [him|her] for?", "Thank you for…"],
      ["What did you want to say to [him|her] but never did?", "What I never said"],
      ["If you could go back to one of [his|her] lessons, which would you choose?", "One more lesson"],
      ["What do you wish [him|her] — in work and in life?", "Our wishes"],
      ["Write a letter to your teacher from the bottom of your heart.", "A letter to you"],
    ],
  },
];
