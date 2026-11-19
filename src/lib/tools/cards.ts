/**
 * Карточки с вопросами для разговора. Для мамы, папы, любимого человека и друга вопросы написаны для живой беседы
 * («расскажи…»), а для бабушек и дедушек взяты из банка вопросов книги о жизни: они на «вы» и подходят старшим.
 * Банк книги обращён к автору, а не к собеседнику, поэтому другие его темы здесь не используются.
 */
import type { Locale, PublicLocale } from "@/i18n/config";
import { toPublic } from "@/i18n/config";
import { quizData } from "./quiz";
import { chapterTitle, getTheme } from "@/lib/content/themes";

export interface CardQuestion {
  chapter: string;
  text: string;
}

export type CardThemeId = "mom" | "dad" | "love" | "friend" | "autobiography";
export const cardThemeIds: CardThemeId[] = ["mom", "dad", "love", "friend", "autobiography"];

const extra: Record<PublicLocale, Record<Exclude<CardThemeId, "autobiography">, string[]>> = {
  ru: {
    mom: [
      "Какой запах сразу возвращает тебя в детство?",
      "Что из нашего детства ты вспоминаешь с улыбкой чаще всего?",
      "Чему ты хотела меня научить, но не успела?",
      "Какой день в твоей жизни был самым счастливым?",
      "Если бы можно было вернуться на один день в прошлое, какой бы ты выбрала?",
      "Что тебе хочется, чтобы мы помнили о тебе?",
    ],
    dad: [
      "Какой совет твоего отца ты не послушал, а потом понял, что он был прав?",
      "Что в детстве удивляло тебя в мире больше всего?",
      "Какое своё решение ты считаешь лучшим в жизни?",
      "Каким ты запомнил меня маленьким?",
      "Какое место тебе хочется увидеть, но ты ещё там не был?",
      "Какую песню ты бы включил на семейном празднике, чтобы все подпевали?",
    ],
    love: [
      "Какой момент нашей жизни тебе хочется пережить ещё раз?",
      "Какая наша общая привычка нравится тебе больше всего?",
      "Куда тебе хочется поехать вместе, если не думать о деньгах и времени?",
      "Что я делаю, от чего тебе становится тепло?",
      "Что тебе хочется вспоминать о нас через сорок лет?",
      "Какая наша ссора теперь кажется смешной?",
    ],
    friend: [
      "Какой наш общий момент ты вспоминаешь чаще всего?",
      "Что в нашей дружбе тебе дороже всего?",
      "В какой момент мы стали настоящими друзьями?",
      "Какая наша общая шутка живёт дольше всех?",
      "Что бы ты сказал мне, если бы мы не виделись десять лет?",
      "Чему мы научились друг у друга?",
      "Какой совет друга остался с тобой навсегда?",
      "О чём ты мечтаешь, но редко говоришь вслух?",
      "Какое приключение мы устроили бы, если бы завтра не нужно было на работу?",
      "Что тебя в людях радует больше всего?",
    ],
  },
  kk: {
    mom: [
      "Қандай иіс сені бірден балалыққа қайтарады?",
      "Біздің балалығымыздан не есіңе түссе, жиі күлімсірейсің?",
      "Маған нені үйреткің келді, бірақ үлгермедің?",
      "Өміріңдегі ең бақытты күн қайсы болды?",
      "Өткенге бір күнге қайта оралуға болса, қай күнді таңдар едің?",
      "Біз сен туралы нені есте сақтағанымызды қалайсың?",
    ],
    dad: [
      "Әкеңнің қандай кеңесін тыңдамадың, кейін оның дұрыс екенін түсіндің?",
      "Балалық шағыңда дүниеде сені ең көп не таңғалдырды?",
      "Өміріңдегі қай шешімді ең жақсы деп санайсың?",
      "Мені кішкентай кезімде қалай есіңде сақтадың?",
      "Қай жерді көргің келеді, бірақ әлі болмадың?",
      "Отбасылық мерекеде бәрі қосылып айтуы үшін қандай әнді қояр едің?",
    ],
    love: [
      "Біздің өмірімізден қай сәтті тағы бір рет бастан кешкің келеді?",
      "Біздің ортақ әдетіміздің қайсысы саған ең көп ұнайды?",
      "Ақша мен уақытты ойламасаң, қайда бірге барғың келеді?",
      "Мен не істегенде саған жылы болады?",
      "Қырық жылдан кейін біз туралы нені еске алғың келеді?",
      "Біздің қай ұрысымыз енді күлкілі болып көрінеді?",
    ],
    friend: [
      "Біздің қай ортақ сәтімізді жиі еске аласың?",
      "Біздің достығымыздағы ең қымбат нәрсе не?",
      "Біз қай сәтте нағыз дос болдық?",
      "Біздің қай ортақ әзілімізді ұзақ айтып жүрміз?",
      "Он жыл көріспесек, маған не айтар едің?",
      "Біз бір-бірімізден не үйрендік?",
      "Досыңның қандай кеңесі саған мәңгі қалды?",
      "Нені армандайсың, бірақ дауыстап сирек айтасың?",
      "Ертең жұмысқа бармасақ, қандай шытырман оқиға ұйымдастырар едік?",
      "Адамдардың қай қасиеті сені ең көп қуантады?",
    ],
  },
  uz: {
    mom: [
      "Qanday hid sizni birdan bolalikka qaytaradi?",
      "Bolaligimizdan nimani eslaganingizda tez-tez jilmayasiz?",
      "Menga nimani o‘rgatmoqchi edingiz, lekin ulgurmadingiz?",
      "Hayotingizdagi eng baxtli kun qaysi bo‘lgan?",
      "Agar o‘tmishga bir kunga qaytish mumkin bo‘lsa, qaysi kunni tanlagan bo‘lardingiz?",
      "Biz sizni qanday eslab yurishimizni istaysiz?",
    ],
    dad: [
      "Otangizning qaysi maslahatiga quloq solmagan edingiz-u, keyin uning haq ekanini tushundingiz?",
      "Bolaligingizda dunyodagi nima sizni eng ko‘p hayratga solgan?",
      "Hayotingizdagi qaysi qarorni eng yaxshisi deb bilasiz?",
      "Meni kichkinaligimda qanday eslaysiz?",
      "Qaysi joyni ko‘rishni istaysiz-u, hali bormagansiz?",
      "Oilaviy bayramda hamma jo‘r bo‘lib kuylashi uchun qaysi qo‘shiqni qo‘yardingiz?",
    ],
    love: [
      "Hayotimizning qaysi lahzasini yana bir bor boshdan kechirging keladi?",
      "Umumiy odatlarimizdan qaysi biri senga eng ko‘p yoqadi?",
      "Pul va vaqtni o‘ylamasang, birga qayerga borging keladi?",
      "Men nima qilsam, senga iliq bo‘ladi?",
      "Qirq yildan keyin biz haqimizda nimani eslashni istaysan?",
      "Qaysi janjalimiz endi kulgili bo‘lib tuyuladi?",
    ],
    friend: [
      "Umumiy lahzalarimizdan qaysi birini tez-tez eslaysan?",
      "Do‘stligimizda sen uchun eng qadrlisi nima?",
      "Qaysi paytda biz chin do‘st bo‘ldik?",
      "Qaysi umumiy hazlimiz eng uzoq yashayapti?",
      "O‘n yil ko‘rishmasak, menga nima der eding?",
      "Biz bir-birimizdan nimani o‘rgandik?",
      "Do‘stingning qaysi maslahati senda abadiy qoldi?",
      "Nimani orzu qilasan-u, ovoz chiqarib kam aytasan?",
      "Ertaga ishga bormasak, qanday sarguzasht uyushtirardik?",
      "Odamlarning qaysi xislati seni eng ko‘p xursand qiladi?",
    ],
  },
};

/** Темы карточек на языке страницы. Вопросы бабушкам и дедушкам — без глав-«предисловий» и без вопросов с родовыми формами. */
export function cardThemes(locale: Locale): Record<CardThemeId, CardQuestion[]> {
  const speak = (from: "mama" | "papa" | "lyubimyj") => quizData[toPublic(locale)][from].items.map((i) => ({ chapter: "", text: i.ask }));
  const plain = (list: string[]) => list.map((text) => ({ chapter: "", text }));
  const bank = getTheme("autobiography", locale);
  const elders = bank.chapters
    .filter((c) => c.key !== "intro")
    .flatMap((c) => c.questions.filter((q) => !/[{[]/.test(q[0])).map((q) => ({ chapter: chapterTitle(bank, c.key, locale), text: q[0] })));
  return {
    mom: [...speak("mama"), ...plain(extra[toPublic(locale)].mom)],
    dad: [...speak("papa"), ...plain(extra[toPublic(locale)].dad)],
    love: [...speak("lyubimyj"), ...plain(extra[toPublic(locale)].love)],
    friend: plain(extra[toPublic(locale)].friend),
    autobiography: elders,
  };
}
