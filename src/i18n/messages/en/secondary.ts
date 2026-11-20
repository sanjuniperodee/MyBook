import type { secondary as ru } from "../ru/secondary";
import { enCount } from "../../plural";

/** Secondary storefront pages: the tools catalogue and worksheet, the blog journal. */
export const secondary: typeof ru = {
  tools: {
    hub: {
      groupsLabel: "Catalogue sections",
      groups: [
        { id: "book", title: "For your book", note: "Get ready before you start writing: photos, length, deadlines, family tree and a questionnaire for conversation." },
        { id: "family", title: "Family and dates", note: "Birthdays, mushel (12-year cycle) ages, anniversaries: what to celebrate and when, so that nobody is forgotten." },
        { id: "talk", title: "Words and conversation", note: "A greeting in your own words, questions for conversation and quizzes on how well you know your loved ones." },
      ],
      kind: {
        together: "Counter",
        deadline: "Deadline calculator",
        price: "Price calculator",
        greeting: "Generator",
        cards: "Cards",
        quiz: "Quiz",
        photo: "Checker",
        pages: "Length calculator",
        planner: "Plan",
        shezhire: "Poster",
        mushel: "Calculator",
        family: "Calendar",
        anketa: "Questionnaire",
      },
      count: (n: number) => enCount(n, "tool", "tools"),
      startHere: "Start here",
      guidesNote: "Sets of questions, gift ideas and tips on how to record the stories of your loved ones.",
      bookKicker: "Next",
      bookTitle: "These preparations turn into a book",
      bookText: "Photos, dates, a family tree and questions will come in handy when you sit down to write. We will suggest the questions, you will choose the cover, and we will deliver the printed book.",
    },
    sheet: {
      input: "Your details",
      result: "Result",
      photoEmpty: "A check of every picture will appear here: how many dots per centimetre it has and up to what size it will print sharply.",
      makeBook: "Turn this into a book",
      makeBookNote: "We will suggest the questions, and you will choose the photos and the cover. Writing a book is free.",
    },
    page: {
      onPage: "On this page",
      tool: "Tool",
      aboutKicker: "How it works",
      faqKicker: "Answers",
      facts: ["Works in your browser", "Your data goes nowhere"],
    },
  },
  blog: {
    featured: "Featured article",
    more: "More on the blog",
    all: "All articles",
    count: (n: number) => enCount(n, "article", "articles"),
    updated: (d: string) => `updated ${d}`,
    readNext: "Keep reading",
    startBook: "Start your book",
    toc: "Jump to sections",
    ctaKicker: "Next — a book",
    published: "Published",
    next: "Next article",
  },
};
