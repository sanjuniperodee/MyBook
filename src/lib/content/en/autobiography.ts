import type { ChapterDef } from "../types";

// Autobiography in English: a book about one’s own life. The narrator writes it, or a loved one writes it down from their words.
// The question is addressed to the narrator as “you”; the chapter title in the book is in the first person.
// English has no author-gender verb forms, so the {m|f} markers are removed. [..|..] are not used: an autobiography has no recipient.
// Chapter keys, question counts and the positions of epigraphs and hints match the Russian bank (tests/content.test.ts).
// Epigraphs are folk proverbs (Kazakh original in a comment) or original lines.

export const autobiographyChapters: ChapterDef[] = [
  {
    key: "intro",
    title: "In place of a foreword",
    epigraph: "Every life is a book. This one is mine.",
    questions: [
      [
        "Introduce yourself the way you would to your great-grandchildren: what is your name, where are you from, who are you today?",
        "Who I am",
        "If you are writing down a loved one’s story — your mum’s or your grandfather’s — use their words, in the first person: “I was born…”, “My father was…”. Keep the narrator’s favourite expressions, so the book speaks in their voice.",
      ],
      ["Why did you decide to tell the story of your life, and who do you want to leave it to?", "Who this book is for"],
      ["Describe yourself in three words. And which three words would your loved ones use to describe you?", "Me in three words"],
      [
        "Who gave you your name, and what does it mean? What were you called at home, and what did your friends call you?",
        "My name",
        "Who you were named after, which of your elders chose the name, what affectionate nicknames came later.",
      ],
      [
        "If you had to tell your life story in five minutes, which events would you mention first?",
        "The short version",
      ],
    ],
  },
  {
    key: "roots",
    title: "My roots",
    // «Жеті атасын білмеген — жетесіз»
    epigraph: "Whoever does not know their seven forefathers is a person without roots.",
    questions: [
      [
        "What do you know about your clan? Which ancestors can you name — perhaps back to the seventh generation, as in a shezhire (family tree)?",
        "My clan",
        "Start with yourself and go back: father, grandfather, great-grandfather. Where they lived, what they did, which clan they came from. Gaps are fine — relatives may be able to fill them in.",
      ],
      [
        "Tell us about your grandfathers and grandmothers: what were their names, where did they live, how do you remember them?",
        "My grandparents",
        "In Kazakh families the first child was often raised by the grandparents. If that was you, tell us what life was like in their home.",
      ],
      [
        "How did your family come to live in the place where you were born? Where did your ancestors come from?",
        "Where we come from",
        "Nomadic migrations, resettlement, the Virgin Lands campaign, evacuation, a job assignment after university — every family has its own road.",
      ],
      ["Tell us about your father: what kind of man was he, what did he do, what do you remember most about him?", "My father"],
      ["Tell us about your mother: what was she like, what could she do, which of her words do you still remember?", "My mother"],
      ["Which stories about your ancestors were passed down by word of mouth in your family?", "Family legends"],
    ],
  },
  {
    key: "childhood",
    title: "Childhood",
    // «Ұяда не көрсең, ұшқанда соны ілесің»
    epigraph: "What you see in the nest is what you will pick up in flight.",
    questions: [
      [
        "Where and when were you born? What did your family say about the day you came into the world?",
        "Where I was born",
        "The city or village, the year, the season, who held you first — everything the family memory has kept.",
      ],
      [
        "Describe the home where you spent your childhood: the smells, the sounds, the view from the window.",
        "The home of my childhood",
        "Walk through it in your mind: the yard, the stove, the kitchen, the chest in the corner, the spot where the dastarkhan (family table) was spread.",
      ],
      ["What is your earliest memory? How old were you and who was with you?", "My first memory"],
      [
        "What did you play as a child, and with whom? Which game in the yard or on the street was your favourite?",
        "The games of my childhood",
        "Asyks (knucklebones), lapta, hopscotch, hide-and-seek, cops and robbers — and the games you invented yourselves.",
      ],
      [
        "What chores did you have at home as a child? What were you taught to do from an early age?",
        "My childhood chores",
        "Herding lambs, carrying water, looking after the younger ones, weeding the vegetable patch, queuing for bread.",
      ],
      ["Which dish from your childhood can you still taste today? Who cooked it, and on what occasion?", "The taste of childhood"],
      [
        "What kind of child were you — quiet, mischievous, dreamy? Which story about your childhood does your family still tell?",
        "What I was like as a child",
      ],
    ],
  },
  {
    key: "school",
    title: "School years",
    questions: [
      ["Do you remember your first day at school? Who took you there, what were you wearing, what did you hold in your hands?", "My first day at school"],
      [
        "What kind of pupil were you? Which subjects came easily, and which were a struggle?",
        "What kind of pupil I was",
      ],
      ["Which teacher influenced you most? What do you remember about this person?", "The teacher I remember"],
      ["Who were your friends at school? What did you do together after lessons?", "School friends"],
      [
        "Which school story do you still remember with a smile?",
        "A school story",
        "A prank in class, a hike, a scrap-metal collection drive, the school assembly, the graduation evening — whatever comes to mind first.",
      ],
      [
        "Where and how did you spend your summer holidays?",
        "Summer holidays",
        "At your grandmother’s in the village, at a pioneer camp, at the jailau (summer pasture), by the river with friends — what were your summers like?",
      ],
    ],
  },
  {
    key: "youth",
    title: "Youth",
    questions: [
      ["What did you dream about in your youth? Who did you want to become — and did it come true?", "What I dreamed of"],
      [
        "What did you decide to do after school, and how did you arrive at that choice? Who helped you, and who tried to talk you out of it?",
        "My choice after school",
        "University, technical college, vocational school, army service, a job straight after school — tell us how it was all decided.",
      ],
      ["When did you first feel like a grown-up? What happened then?", "When I grew up"],
      [
        "How did you spend your free time in your youth? Where did you go, what did you listen to, how did you dress?",
        "How we had fun",
        "Dances, the cinema, songs with a guitar, a fashionable item that was impossible to find — anything that captures the spirit of the time.",
      ],
      ["Who were the friends of your youth? Tell us a story from something you lived through together.", "Friends of my youth"],
      ["What is the boldest or most reckless thing you did in your youth?", "My boldest act"],
    ],
  },
  {
    key: "work",
    title: "My life’s work",
    // «Еңбек етсең — емерсің»
    epigraph: "If you work, you will never go hungry.",
    questions: [
      [
        "Where and as what did you start working? Do you remember your first day at work and your first pay?",
        "My first job",
        "What you bought with your first money, who you gave a present to, how you celebrated.",
      ],
      ["What did you do for most of your life? Describe your work so that a grandchild could understand it.", "My work"],
      ["Who taught you to really work? What did you learn from that person?", "My mentor"],
      ["Which piece of work or achievement are you most proud of?", "What I am proud of"],
      [
        "Tell us about the people you worked with best. Which episode from your working life do you remember most often?",
        "The people I worked with",
      ],
      ["Did you ever have to start all over again — change your profession, your place, your line of work? What was that like?", "Starting over"],
    ],
  },
  {
    key: "love",
    title: "Love",
    questions: [
      ["Tell us about your first love. What was the feeling like, and how did it end?", "First love"],
      [
        "How did you meet your husband or wife? Describe that day.",
        "How we met",
        "Where it was, who introduced you, what you were both wearing, what you thought in the first minute.",
      ],
      ["How did your relationship develop? Do you remember the first date, the first letter, the first gift?", "How it all began"],
      [
        "How was your wedding? Which customs, songs and guests do you remember most?",
        "Our wedding",
        "The matchmaking, the kyz uzatu (the bride’s farewell), the betashar (the unveiling of the bride) — or a modest registry-office ceremony. Who was there, what was on the table, what was sung.",
      ],
      [
        "What has married life taught you? What, in your view, helps two people live together for many years?",
        "What love has taught me",
      ],
      ["What would you like to say to your husband or wife — after all these years?", "To you, my dearest"],
    ],
  },
  {
    key: "children",
    title: "Children and grandchildren",
    questions: [
      [
        "Tell us about the birth of your first child. What did you feel when you first held your baby?",
        "When I became a parent",
      ],
      [
        "How did your family welcome babies? Which customs did you hold — shildekhana, besikke salu, tusau keser?",
        "Celebrations for the children",
        "Shildekhana is a celebration for a newborn, besikke salu is the first laying of the baby in the cradle, tusau keser is the cutting of the tether when a little one takes their first steps.",
      ],
      ["What were your children like when they were small? Which story about each of them do you love to remember?", "My children"],
      ["How did you bring up your children? What mattered most to you to pass on to them?", "What I taught my children"],
      ["How did your children surprise or delight you when they grew up?", "When the children grew up"],
      [
        "Tell us about your grandchildren: what are they like, how are they similar to you, what do you like doing together?",
        "My grandchildren",
        "If you do not have grandchildren yet, write about how you imagine them and what you would like to tell them.",
      ],
    ],
  },
  {
    key: "home",
    title: "My home",
    // «Өз үйім — өлең төсегім»
    epigraph: "It is good to be a guest, but better still to be at home.",
    questions: [
      [
        "Which cities and villages have you lived in? Tell us about your moves: where to, why, and how the new place turned out.",
        "Where I lived",
        "You can go in order: the place, the years, what you remember about it. Even a short list will become a map of your life.",
      ],
      ["Which place do you consider your homeland? What do you feel when you go back there?", "My native land"],
      [
        "Do you remember when you got a home of your own — your first flat or your own house? What was that like?",
        "A roof of my own",
        "A housing warrant after years on the waiting list, a house built by the whole extended family, the first night in the new place.",
      ],
      [
        "What was the dastarkhan like in your home? How did you welcome guests, and what did you cook for their visit?",
        "Our dastarkhan",
        "Beshbarmak on holidays, baursaks, kazy, tea with milk — and who sat at the table in the place of honour.",
      ],
      ["Which customs were observed in your home? Which of them did you pass on to your children?", "The customs of our home"],
      [
        "Which things in your home keep the history of your family? Tell us about the one that is dearest to you.",
        "Things with a story",
        "A chest, a kese (tea bowl), a carpet, a dombra, a grandmother’s camisole, old photographs, medals, letters.",
      ],
    ],
  },
  {
    key: "times",
    title: "The times I lived in",
    questions: [
      [
        "How did people live in the years of your childhood and youth? What was normal then and would surprise young people today?",
        "How people lived then",
        "Queues, letters that took weeks to arrive, one telephone for the whole street — small details of daily life capture an era best.",
      ],
      [
        "Which events in the country and the world do you remember as if they were yesterday? Where were you that day?",
        "Days I remember",
        "Tell us not what the textbooks say, but what you saw yourself: where you were, what people were saying, how it affected your family.",
      ],
      [
        "How did your family live in the 1990s? What changed, and how did you cope?",
        "The nineties",
        "How you earned a living, what you put on the table, what you hoped for, who helped.",
      ],
      [
        "Do you remember the first years of independent Kazakhstan? Which changes did you notice first?",
        "The first years of independence",
        "The first tenge banknotes, new passports, new names of streets and cities — what changed in your life.",
      ],
      [
        "How has the world changed before your eyes? Which novelty surprised you most?",
        "What has changed before my eyes",
        "The first telephone in the house, the first television, the first computer, the first video call to the grandchildren.",
      ],
      ["Which songs, films and books mattered most to your generation? Which of them do you still love?", "The songs of my time"],
    ],
  },
  {
    key: "trials",
    title: "Hardships",
    // «Сабыр түбі — сары алтын»
    epigraph: "Patience has a golden bottom.",
    questions: [
      [
        "What was the hardest trial of your life? How did you get through it?",
        "The hardest time",
        "Write as much as you are ready to tell. Sometimes a few lines about what helped you hold on are enough.",
      ],
      ["Who supported you in a difficult moment? Tell us how it happened.", "Who was by my side"],
      ["Which decision was especially hard for you? How do you look at it now?", "A hard choice"],
      ["Which of your loved ones do you miss especially? Tell us about them what you want to preserve.", "In loving memory"],
      ["What helped you not to give up — family, work, faith, humour?", "What helped me hold on"],
    ],
  },
  {
    key: "joys",
    title: "Joys of life",
    questions: [
      ["Which day would you call the happiest of your life? Tell us about it in detail.", "My happiest day"],
      [
        "How did your family celebrate Nauryz, New Year and birthdays? Which celebration do you remember most?",
        "Our celebrations",
        "Nauryz kozhe (the traditional spring dish), guests, new clothes, the New Year tree with tangerines, songs at the table.",
      ],
      ["Which toi (festive gathering) do you still remember — a relative’s wedding, an anniversary, a send-off? What made it special?", "A toi I remember"],
      [
        "What did you love doing for the soul, apart from work?",
        "My hobby",
        "Handicrafts, gardening, fishing, the dombra, chess, singing, books — whatever brought you joy.",
      ],
      [
        "Which trips and journeys do you remember most?",
        "My travels",
        "A sanatorium stay on a voucher, Borovoe, Issyk-Kul, the sea, your first trip abroad.",
      ],
      ["Who are your friends for life? Tell us the story that binds you together.", "Friends for life"],
      ["What brings you joy today — in an ordinary day, in simple things?", "What brings me joy now"],
    ],
  },
  {
    key: "wisdom",
    title: "What I have learned about life",
    // «Көп жасаған білмейді, көпті көрген біледі»
    epigraph: "It is not the one who has lived long who knows, but the one who has seen much.",
    questions: [
      [
        "What has life taught you? Name the three main lessons.",
        "The main lessons",
        "You can make a list: each lesson on a new line, with a short example from your life.",
      ],
      ["Which piece of advice from your elders turned out to be the truest? Who gave it?", "Advice I remembered"],
      [
        "If you could talk to yourself at twenty, what would you say?",
        "A talk with my younger self",
      ],
      [
        "What turned out to be truly important in life, and what was a trifle not worth worrying about?",
        "What matters and what does not",
      ],
      ["Which proverbs and favourite sayings do you repeat most often? Why those in particular?", "My favourite sayings"],
      ["What do you regret — and what would you do again without hesitation?", "What I would do again"],
    ],
  },
  {
    key: "letter",
    title: "A letter to my descendants",
    epigraph: "The most precious thing I can leave you is my story.",
    questions: [
      ["What do you wish for your children, grandchildren and great-grandchildren?", "My wishes for you"],
      ["Which values and traditions do you ask your family to preserve?", "What I ask you to preserve"],
      ["How would you like to be remembered by your loved ones?", "How to remember me"],
      ["Which words have you long wanted to say to one of your loved ones but never said?", "What I have long wanted to say"],
      [
        "Write a letter to those who will read this book many years from now.",
        "A letter to those who come after me",
        "Address them by name or simply: “My dear ones…”. Write the way you would say it out loud.",
      ],
    ],
  },
];
