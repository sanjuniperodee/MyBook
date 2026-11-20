/**
 * Тесты «Как хорошо вы знаете маму/папу/бабушку/любимого человека». Человек отмечает, что знает точно, примерно или не знает;
 * итог — процент близости и список вопросов, которые стоит задать. Эти же вопросы лежат в основе книги.
 */
import type { PublicLocale } from "@/i18n/config";

export type QuizId = "mama" | "papa" | "babushka" | "lyubimyj";
export type Answer = 0 | 1 | 2;

export interface QuizItem {
  /** Что именно спрашиваем: «её любимую песню». Читается после «Вы знаете…». */
  know: string;
  /** Вопрос, который стоит задать вслух. */
  ask: string;
}

interface QuizWho {
  /** «о маме» / «туралы». */
  about: string;
  /** «маму». */
  acc: string;
}

export interface QuizData {
  who: QuizWho;
  items: QuizItem[];
}

export const quizIds: QuizId[] = ["mama", "papa", "babushka", "lyubimyj"];

/** Процент: 2 балла за «знаю точно», 1 за «примерно», 0 за «не знаю». */
export function quizPercent(answers: readonly (Answer | undefined)[], total: number): number {
  const sum = answers.reduce<number>((s, a) => s + (a ?? 0), 0);
  return total ? Math.round((sum / (total * 2)) * 100) : 0;
}

/** Четыре уровня близости: <35, <60, <85, остальное. */
export function quizBand(percent: number): 0 | 1 | 2 | 3 {
  return percent < 35 ? 0 : percent < 60 ? 1 : percent < 85 ? 2 : 3;
}

/** Вопросы, на которые человек не знает ответа, — сначала «не знаю», затем «примерно». */
export function questionsToAsk(items: readonly QuizItem[], answers: readonly (Answer | undefined)[]): { ask: string; level: 0 | 1 }[] {
  const out = items.map((it, i) => ({ ask: it.ask, level: (answers[i] ?? 0) as Answer })).filter((x): x is { ask: string; level: 0 | 1 } => x.level < 2);
  return out.sort((a, b) => a.level - b.level);
}

export const quizData: Record<PublicLocale, Record<QuizId, QuizData>> = {
  ru: {
    mama: {
      who: { about: "маме", acc: "маму" },
      items: [
        { know: "её любимую песню или мелодию", ask: "Мам, какая песня для тебя самая родная и почему?" },
        { know: "как мама с папой познакомились", ask: "Расскажи, как вы с папой познакомились — что ты почувствовала в тот день?" },
        { know: "о чём мама мечтала в юности", ask: "О чём ты мечтала, когда тебе было шестнадцать?" },
        { know: "кем она хотела стать в детстве", ask: "Кем ты хотела стать, когда была маленькой?" },
        { know: "самое счастливое воспоминание из её детства", ask: "Какой день из детства ты вспоминаешь с самой тёплой улыбкой?" },
        { know: "чего мама боится больше всего", ask: "Чего ты боишься, но обычно об этом молчишь?" },
        { know: "её любимое место на земле", ask: "Какое место на земле тебе дороже всего?" },
        { know: "какой совет ей дала её мама", ask: "Какой совет твоей мамы ты запомнила на всю жизнь?" },
        { know: "самый трудный период её жизни и что помогло его пережить", ask: "Что помогло тебе пройти самый трудный период в жизни?" },
        { know: "каким своим поступком она гордится больше всего", ask: "Каким своим поступком ты гордишься больше всего?" },
      ],
    },
    papa: {
      who: { about: "папе", acc: "папу" },
      items: [
        { know: "как он выбирал профессию", ask: "Пап, как ты выбирал профессию — и не жалеешь ли об этом?" },
        { know: "его первую работу и первую зарплату", ask: "Помнишь свою первую работу и первую зарплату? На что ты её потратил?" },
        { know: "о чём он мечтал в юности", ask: "О чём ты мечтал, когда был молодым?" },
        { know: "самый страшный и самый смешной случай в его жизни", ask: "Какой случай в твоей жизни был самым страшным, а какой — самым смешным?" },
        { know: "каким был его отец, ваш дедушка", ask: "Каким был твой отец и чему он тебя научил?" },
        { know: "что он считает главным уроком жизни", ask: "Какой урок жизни ты считаешь самым важным?" },
        { know: "его любимую книгу, фильм или песню", ask: "Какая книга, фильм или песня значат для тебя больше всего?" },
        { know: "какой момент он называет самым счастливым", ask: "Какой момент своей жизни ты называешь самым счастливым?" },
        { know: "чем он гордится в себе", ask: "Чем ты гордишься больше всего?" },
        { know: "какой совет ему хотелось бы вам дать", ask: "Какой совет ты хотел бы дать мне на всю жизнь?" },
      ],
    },
    babushka: {
      who: { about: "бабушке", acc: "бабушку" },
      items: [
        { know: "где и как она росла", ask: "Бабушка, расскажи, где ты выросла и каким был дом твоего детства." },
        { know: "как она встретила своего будущего мужа", ask: "Как ты познакомилась с дедушкой и что в нём тебя покорило?" },
        { know: "какие игры и песни она любила в детстве", ask: "Какие игры и песни ты любила в детстве? Споёшь одну?" },
        { know: "какой была её свадьба и что на ней было надето", ask: "Какой была твоя свадьба? Что на тебе было надето?" },
        { know: "что она считает главным в жизни", ask: "Что для тебя в жизни самое главное?" },
        { know: "какие семейные традиции она хранит", ask: "Какие семейные традиции ты хочешь, чтобы мы сохранили?" },
        { know: "её самый трудный год и как она его пережила", ask: "Какой год в твоей жизни был самым трудным и как ты его пережила?" },
        { know: "самые яркие праздники её детства", ask: "Какие праздники в детстве были самыми яркими?" },
        { know: "что она хотела бы пожелать внукам", ask: "Что ты хотела бы пожелать нам, своим внукам?" },
        { know: "её рецепт, который никогда не был записан", ask: "Какой рецепт ты никогда не записывала? Продиктуй!" },
      ],
    },
    lyubimyj: {
      who: { about: "любимом человеке", acc: "любимого человека" },
      items: [
        { know: "что было вокруг в день вашего знакомства", ask: "Что ты помнишь о дне, когда мы познакомились?" },
        { know: "что ему или ей понравилось в вас сразу", ask: "Что тебя во мне зацепило сразу?" },
        { know: "любимое блюдо или лакомство, о котором он или она не просит", ask: "Какое блюдо или лакомство ты любишь, но никогда не просишь?" },
        { know: "мечту, о которой он или она редко говорит вслух", ask: "О какой мечте ты редко говоришь вслух?" },
        { know: "самый большой страх", ask: "Чего ты боишься больше всего?" },
        { know: "главную историю его или её детства", ask: "Какая история из твоего детства самая запоминающаяся?" },
        { know: "что помогает в трудный день", ask: "Что тебе помогает, когда день не задался?" },
        { know: "каким он или она видит ваш дом через десять лет", ask: "Каким ты видишь наш дом и нашу жизнь через десять лет?" },
        { know: "какой подарок стал бы самым дорогим", ask: "Какой подарок стал бы для тебя самым дорогим?" },
        { know: "что он или она ценит в вас больше всего", ask: "Что ты ценишь во мне больше всего?" },
      ],
    },
  },
  kk: {
    mama: {
      who: { about: "анаңыз", acc: "анаңызды" },
      items: [
        { know: "оның сүйікті әні мен әуенін", ask: "Анашым, саған ең қымбат ән қайсы және неге?" },
        { know: "анаңыз бен әкеңіздің қалай танысқанын", ask: "Әкеммен қалай таныстыңдар — сол күні не сезіндің?" },
        { know: "оның жастық шағында нені армандағанын", ask: "Он алты жасыңда нені армандадың?" },
        { know: "кішкентайында кім болғысы келгенін", ask: "Кішкентай кезіңде кім болғың келді?" },
        { know: "балалық шағының ең бақытты естелігін", ask: "Балалық шағыңнан қай күнді ең жылы күлкімен еске аласың?" },
        { know: "ол неден ең көп қорқатынын", ask: "Неден қорқасың, бірақ көбіне айтпай жүресің?" },
        { know: "оның жер бетіндегі сүйікті жерін", ask: "Жер бетінде саған ең қымбат жер қайсы?" },
        { know: "оған өз анасы қандай кеңес бергенін", ask: "Анаң берген қандай кеңесті өмір бойы есіңде сақтадың?" },
        { know: "өмірінің ең қиын кезеңін және оны не еңсерткенін", ask: "Өмірдегі ең қиын кезеңнен өтуге саған не көмектесті?" },
        { know: "ол қандай ісімен ең көп мақтанатынын", ask: "Қай ісіңмен ең көп мақтанасың?" },
      ],
    },
    papa: {
      who: { about: "әкеңіз", acc: "әкеңізді" },
      items: [
        { know: "ол мамандықты қалай таңдағанын", ask: "Әке, мамандықты қалай таңдадың — өкінбейсің бе?" },
        { know: "оның алғашқы жұмысы мен алғашқы жалақысын", ask: "Алғашқы жұмысың мен алғашқы жалақың есіңде ме? Оны неге жұмсадың?" },
        { know: "жастық шағында нені армандағанын", ask: "Жас кезіңде нені армандадың?" },
        { know: "өміріндегі ең қорқынышты және ең күлкілі оқиғаны", ask: "Өміріңдегі ең қорқынышты және ең күлкілі оқиға қандай?" },
        { know: "оның әкесі, яғни сіздің атаңыз, қандай болғанын", ask: "Әкең қандай адам болды және саған не үйретті?" },
        { know: "оның өмірдегі басты сабағын", ask: "Өмірдің басты сабағы деп нені санайсың?" },
        { know: "оның сүйікті кітабын, фильмін немесе әнін", ask: "Сүйікті кітабың, фильмің немесе әнің қайсы?" },
        { know: "қай сәтті ол ең бақытты деп атайтынын", ask: "Өміріңдегі ең бақытты сәт қайсы?" },
        { know: "ол өзінен нені мақтан тұтатынын", ask: "Өзіңнен нені ең көп мақтан тұтасың?" },
        { know: "ол сізге қандай кеңес бергісі келетінін", ask: "Маған өмір бойы қандай кеңес бергің келеді?" },
      ],
    },
    babushka: {
      who: { about: "әжеңіз", acc: "әжеңізді" },
      items: [
        { know: "ол қайда және қалай өскенін", ask: "Әже, қайда өстің және балалық шағыңдағы үй қандай еді?" },
        { know: "ол болашақ жарымен қалай кездескенін", ask: "Атамен қалай кездестіңдер және оның несі ұнады?" },
        { know: "оның балалықта қандай ойындар мен әндерді жақсы көргенін", ask: "Балалығыңда қандай ойындар мен әндерді жақсы көрдің? Біреуін айтып берші." },
        { know: "оның тойы қалай өткенін және не кигенін", ask: "Тойың қалай өтті? Үстіңе не кидің?" },
        { know: "ол өмірде нені ең маңызды деп санайтынын", ask: "Өмірде сен үшін ең маңыздысы не?" },
        { know: "ол қандай отбасылық дәстүрлерді сақтайтынын", ask: "Қандай отбасылық дәстүрлерді біз сақтап қалуымыз керек деп ойлайсың?" },
        { know: "оның ең қиын жылы қандай болғанын және оны қалай өткергенін", ask: "Өміріңдегі ең қиын жыл қандай болды және оны қалай өткердің?" },
        { know: "балалық шағындағы ең жарқын мерекелерді", ask: "Балалық шағыңдағы ең жарқын мереке қандай еді?" },
        { know: "ол немерелеріне не тілегісі келетінін", ask: "Немерелеріңе қандай тілек айтқың келеді?" },
        { know: "ол ешқашан жазбаған рецептін", ask: "Ешқашан жазбаған қандай рецептің бар? Айтып берші!" },
      ],
    },
    lyubimyj: {
      who: { about: "сүйікті адамыңыз", acc: "сүйікті адамыңызды" },
      items: [
        { know: "алғаш танысқан күні айналада не болғанын", ask: "Біз танысқан күннен не есіңде?" },
        { know: "сізде оған бірден не ұнағанын", ask: "Менде саған бірден не ұнады?" },
        { know: "ол сұрамайтын, бірақ жақсы көретін тағамын", ask: "Қандай тағамды жақсы көресің, бірақ ешқашан сұрамайсың?" },
        { know: "ол дауыстап сирек айтатын арманын", ask: "Қай арманыңды дауыстап сирек айтасың?" },
        { know: "оның ең үлкен қорқынышын", ask: "Ең үлкен қорқынышың не?" },
        { know: "оның балалығындағы ең басты оқиғаны", ask: "Балалығыңнан ең есте қалған оқиға қайсы?" },
        { know: "күн сәтсіз болғанда оған не көмектесетінін", ask: "Күн ауыр болғанда саған не көмектеседі?" },
        { know: "ол он жылдан кейін үйіңізді қалай көретінін", ask: "Он жылдан кейін біздің үйді және өмірімізді қалай елестетесің?" },
        { know: "оған қандай сыйлық бәрінен қымбат болатынын", ask: "Саған қандай сыйлық бәрінен қымбат болар еді?" },
        { know: "ол сізде нені бәрінен көп бағалайтынын", ask: "Менде нені бәрінен көп бағалайсың?" },
      ],
    },
  },
  uz: {
    mama: {
      who: { about: "onangiz", acc: "onangizni" },
      items: [
        { know: "uning sevimli qo‘shig‘i yoki kuyini", ask: "Oyi, siz uchun eng aziz qo‘shiq qaysi va nima uchun?" },
        { know: "onangiz bilan dadangiz qanday tanishganini", ask: "Dada bilan qanday tanishgansiz — o‘sha kuni nimani his qilgan edingiz?" },
        { know: "onangiz yoshligida nimani orzu qilganini", ask: "O‘n olti yoshingizda nimani orzu qilgan edingiz?" },
        { know: "u bolaligida kim bo‘lishni xohlaganini", ask: "Kichikligingizda kim bo‘lishni xohlardingiz?" },
        { know: "bolaligining eng baxtli xotirasini", ask: "Bolaligingizdagi qaysi kunni eng iliq tabassum bilan eslaysiz?" },
        { know: "onangiz nimadan hammadan ko‘proq qo‘rqishini", ask: "Nimadan qo‘rqasiz, lekin odatda bu haqda indamaysiz?" },
        { know: "uning yer yuzidagi sevimli joyini", ask: "Yer yuzida qaysi joy siz uchun hammasidan aziz?" },
        { know: "unga onasi qanday maslahat berganini", ask: "Onangizning qaysi maslahati butun umringizga yodingizda qoldi?" },
        { know: "hayotidagi eng og‘ir davrni va uni nima yengib o‘tishga yordam berganini", ask: "Hayotingizdagi eng og‘ir davrdan o‘tishingizga nima yordam berdi?" },
        { know: "u qaysi ishi bilan eng ko‘p faxrlanishini", ask: "Qaysi ishingiz bilan eng ko‘p faxrlanasiz?" },
      ],
    },
    papa: {
      who: { about: "otangiz", acc: "otangizni" },
      items: [
        { know: "u kasbni qanday tanlaganini", ask: "Dada, kasbni qanday tanlagan edingiz — afsuslanmaysizmi?" },
        { know: "uning birinchi ishi va birinchi maoshini", ask: "Birinchi ishingiz va birinchi maoshingiz esingizdami? Uni nimaga sarflagan edingiz?" },
        { know: "yoshligida nimani orzu qilganini", ask: "Yosh vaqtingizda nimani orzu qilgan edingiz?" },
        { know: "hayotidagi eng qo‘rqinchli va eng kulgili voqeani", ask: "Hayotingizdagi eng qo‘rqinchli voqea qaysi, eng kulgilisi-chi?" },
        { know: "uning otasi, ya’ni sizning bobongiz, qanday inson bo‘lganini", ask: "Otangiz qanday inson edi va sizga nimani o‘rgatdi?" },
        { know: "u hayotning asosiy saboqi deb nimani hisoblashini", ask: "Hayotning eng muhim saboqi deb nimani hisoblaysiz?" },
        { know: "uning sevimli kitobi, filmi yoki qo‘shig‘ini", ask: "Qaysi kitob, film yoki qo‘shiq siz uchun hammasidan qadrli?" },
        { know: "qaysi lahzani u eng baxtli deb atashini", ask: "Hayotingizning qaysi lahzasini eng baxtli deb ataysiz?" },
        { know: "u o‘zida nima bilan faxrlanishini", ask: "Nima bilan eng ko‘p faxrlanasiz?" },
        { know: "u sizga qanday maslahat bermoqchi ekanini", ask: "Menga butun umrga qanday maslahat bermoqchi bo‘lardingiz?" },
      ],
    },
    babushka: {
      who: { about: "buvingiz", acc: "buvingizni" },
      items: [
        { know: "u qayerda va qanday o‘sganini", ask: "Buvijon, qayerda o‘sganingizni va bolalik uyingiz qanday bo‘lganini aytib bering." },
        { know: "u bo‘lajak turmush o‘rtog‘i bilan qanday uchrashganini", ask: "Bobom bilan qanday tanishgansiz va u kishining nimasi sizga yoqqan?" },
        { know: "u bolaligida qanday o‘yin va qo‘shiqlarni yoqtirganini", ask: "Bolaligingizda qanday o‘yin va qo‘shiqlarni yoqtirgansiz? Bittasini aytib berasizmi?" },
        { know: "to‘yi qanday o‘tganini va u nima kiyganini", ask: "To‘yingiz qanday o‘tgan edi? Egningizda nima bor edi?" },
        { know: "u hayotda nimani eng muhim deb bilishini", ask: "Hayotda siz uchun eng muhimi nima?" },
        { know: "u qanday oilaviy an’analarni saqlashini", ask: "Qanday oilaviy an’analarni biz saqlab qolishimizni istaysiz?" },
        { know: "uning eng og‘ir yili qanday bo‘lganini va uni qanday yengib o‘tganini", ask: "Hayotingizdagi eng og‘ir yil qaysi edi va uni qanday yengib o‘tdingiz?" },
        { know: "bolaligidagi eng yorqin bayramlarni", ask: "Bolaligingizdagi qaysi bayramlar eng yorqin edi?" },
        { know: "u nevaralariga nima tilashini", ask: "Bizga, nevaralaringizga, nima tilagingiz keladi?" },
        { know: "u hech qachon yozib qo‘ymagan retseptini", ask: "Hech qachon yozib qo‘ymagan qaysi retseptingiz bor? Aytib turing!" },
      ],
    },
    lyubimyj: {
      who: { about: "sevgan insoningiz", acc: "sevgan insoningizni" },
      items: [
        { know: "tanishgan kuningizda atrofda nima bo‘lganini", ask: "Tanishgan kunimizdan nimalarni eslaysan?" },
        { know: "u sizning nimangizni birinchi daqiqadayoq yoqtirib qolganini", ask: "Menda senga nima birdaniga yoqqan edi?" },
        { know: "u so‘ramaydigan, lekin yaxshi ko‘radigan taomi yoki shirinligini", ask: "Qaysi taom yoki shirinlikni yaxshi ko‘rasan-u, hech qachon so‘ramaysan?" },
        { know: "u kamdan-kam ovoz chiqarib aytadigan orzusini", ask: "Qaysi orzuingni kamdan-kam ovoz chiqarib aytasan?" },
        { know: "uning eng katta qo‘rquvini", ask: "Eng katta qo‘rquving nima?" },
        { know: "uning bolaligidagi eng esda qolarli voqeani", ask: "Bolaligingdagi qaysi voqea eng esda qolarli?" },
        { know: "og‘ir kunda unga nima yordam berishini", ask: "Kuning yaxshi o‘tmaganda senga nima yordam beradi?" },
        { know: "u o‘n yildan keyin uyingizni qanday ko‘rishini", ask: "O‘n yildan keyin uyimiz va hayotimizni qanday tasavvur qilasan?" },
        { know: "unga qanday sovg‘a hammasidan qadrli bo‘lishini", ask: "Senga qanday sovg‘a hammasidan qadrli bo‘lardi?" },
        { know: "u sizda nimani hammasidan ko‘proq qadrlashini", ask: "Menda nimani hammasidan ko‘proq qadrlaysan?" },
      ],
    },
  },
  en: {
    mama: {
      who: { about: "your mum", acc: "your mum" },
      items: [
        { know: "her favourite song or melody", ask: "Mum, which song is dearest to you, and why?" },
        { know: "how Mum and Dad met", ask: "Tell me how you and Dad met — what did you feel that day?" },
        { know: "what she dreamed about when she was young", ask: "What did you dream about when you were sixteen?" },
        { know: "what she wanted to be as a child", ask: "What did you want to be when you were little?" },
        { know: "the happiest memory of her childhood", ask: "Which day from your childhood do you remember with the warmest smile?" },
        { know: "what she is most afraid of", ask: "What are you afraid of but usually keep quiet about?" },
        { know: "her favourite place on earth", ask: "Which place on earth is dearest to you?" },
        { know: "what advice her own mum gave her", ask: "Which piece of advice from your mum have you remembered all your life?" },
        { know: "the hardest period of her life and what helped her through it", ask: "What helped you get through the hardest period of your life?" },
        { know: "what she is proudest of having done", ask: "What are you proudest of having done?" },
      ],
    },
    papa: {
      who: { about: "your dad", acc: "your dad" },
      items: [
        { know: "how he chose his career", ask: "Dad, how did you choose your career — and do you ever regret it?" },
        { know: "his first job and his first pay", ask: "Do you remember your first job and your first pay? What did you spend it on?" },
        { know: "what he dreamed about when he was young", ask: "What did you dream about when you were young?" },
        { know: "the scariest and the funniest thing that ever happened to him", ask: "What was the scariest thing that ever happened to you, and what was the funniest?" },
        { know: "what his father, your grandfather, was like", ask: "What was your father like, and what did he teach you?" },
        { know: "what he considers the most important lesson in life", ask: "Which lesson in life do you consider the most important?" },
        { know: "his favourite book, film or song", ask: "Which book, film or song means the most to you?" },
        { know: "which moment he calls the happiest", ask: "Which moment of your life do you call the happiest?" },
        { know: "what he is proud of in himself", ask: "What are you proudest of?" },
        { know: "what advice he would like to give you", ask: "What advice would you like to give me for life?" },
      ],
    },
    babushka: {
      who: { about: "your grandmother", acc: "your grandmother" },
      items: [
        { know: "where and how she grew up", ask: "Grandma, tell me where you grew up and what the home of your childhood was like." },
        { know: "how she met her future husband", ask: "How did you meet Grandad, and what won you over about him?" },
        { know: "which games and songs she loved as a child", ask: "Which games and songs did you love as a child? Will you sing one for me?" },
        { know: "what her wedding was like and what she wore", ask: "What was your wedding like? What did you wear?" },
        { know: "what she considers the most important thing in life", ask: "What is the most important thing in life for you?" },
        { know: "which family traditions she keeps", ask: "Which family traditions would you like us to keep alive?" },
        { know: "her hardest year and how she got through it", ask: "Which year of your life was the hardest, and how did you get through it?" },
        { know: "the brightest celebrations of her childhood", ask: "Which celebrations were the brightest in your childhood?" },
        { know: "what she would like to wish her grandchildren", ask: "What would you like to wish us, your grandchildren?" },
        { know: "her recipe that was never written down", ask: "Which recipe have you never written down? Dictate it to me!" },
      ],
    },
    lyubimyj: {
      who: { about: "your loved one", acc: "your loved one" },
      items: [
        { know: "what was around you on the day you met", ask: "What do you remember about the day we met?" },
        { know: "what they liked about you straight away", ask: "What caught your attention about me straight away?" },
        { know: "a favourite dish or treat they never ask for", ask: "Which dish or treat do you love but never ask for?" },
        { know: "a dream they rarely talk about out loud", ask: "Which dream do you rarely talk about out loud?" },
        { know: "their biggest fear", ask: "What are you most afraid of?" },
        { know: "the main story of their childhood", ask: "Which story from your childhood is the most memorable?" },
        { know: "what helps them on a hard day", ask: "What helps you when the day goes wrong?" },
        { know: "how they picture your home ten years from now", ask: "How do you see our home and our life ten years from now?" },
        { know: "which gift would mean the most to them", ask: "Which gift would mean the most to you?" },
        { know: "what they value most about you", ask: "What do you value most about me?" },
      ],
    },
  },
};
