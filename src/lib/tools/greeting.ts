/**
 * Генератор поздравлений: тексты собираются из заготовок (обращение + повод + пожелания + концовка) без сети и без ИИ,
 * поэтому работают мгновенно и бесплатно. Один и тот же набор параметров и номер варианта дают один и тот же текст.
 * Тексты каждого языка написаны отдельно, а не переведены дословно.
 */
import type { Locale, PublicLocale } from "@/i18n/config";
import { toPublic } from "@/i18n/config";

export const recipientIds = ["mama", "papa", "babushka", "dedushka", "zhena", "muzh", "podruga", "drug", "uchitelnitsa", "uchitel"] as const;
export type RecipientId = (typeof recipientIds)[number];

export const occasionIds = ["birthday", "jubilee", "march8", "defender", "teachers", "anniversary", "newyear"] as const;
export type OccasionId = (typeof occasionIds)[number];

export type ToneId = "warm" | "funny";

const female: RecipientId[] = ["mama", "babushka", "zhena", "podruga", "uchitelnitsa"];
const male: RecipientId[] = ["papa", "dedushka", "muzh", "drug", "uchitel"];

/** Какие поводы уместны получателю: 8 Марта — женщинам, 23 февраля — мужчинам, день учителя — учителям, годовщина — супругам. */
export function occasionsFor(r: RecipientId): OccasionId[] {
  const list: OccasionId[] = ["birthday", "jubilee"];
  if (female.includes(r)) list.push("march8");
  if (male.includes(r)) list.push("defender");
  if (r === "uchitelnitsa" || r === "uchitel") list.push("teachers");
  if (r === "zhena" || r === "muzh") list.push("anniversary");
  list.push("newyear");
  return list;
}

interface Pool {
  /** Обращение без имени и с именем ({name}). */
  plain: string[];
  named: string[];
  warm: string[];
  funny: string[];
  /** Обращение на «Вы»: другие концовки. */
  formal?: boolean;
}

interface OccasionText {
  /** С возрастом ({age}) и без него. */
  titles: string[];
  titlesAge?: string[];
  follow: string;
}

interface LocaleData {
  recipients: Record<RecipientId, Pool>;
  occasions: Record<OccasionId, OccasionText>;
  closings: Record<ToneId, { family: string[]; formal: string[] }>;
}

const teacherRu: Pick<Pool, "warm" | "funny" | "formal"> = {
  formal: true,
  warm: [
    "Спасибо Вам за терпение, знания и веру в нас.",
    "Желаю здоровья, вдохновения и благодарных учеников.",
    "Вы научили нас не только предмету, но и умению думать и уважать людей.",
    "Пусть каждый день в классе приносит радость, а работа — признание.",
    "Мы всегда будем помнить Ваши уроки.",
  ],
  funny: [
    "Желаю, чтобы тетради проверялись сами, а ученики приходили с выученным домашним заданием.",
    "Пусть звонок на перемену звучит чаще, чем звонок с замечанием.",
    "Обещаем в этот день не опаздывать и не списывать.",
  ],
};

const teacherKk: Pick<Pool, "warm" | "funny" | "formal"> = {
  formal: true,
  warm: [
    "Сіздің сабырыңыз, біліміңіз және бізге деген сеніміңіз үшін алғыс айтамыз.",
    "Сізге денсаулық, шабыт және алғыс білдіретін шәкірттер тілейміз.",
    "Сіз бізге тек пәнді емес, ойлануды және адамдарды сыйлауды үйреттіңіз.",
    "Сыныптағы әр күн қуаныш әкеліп, еңбегіңіз мойындалсын.",
    "Сіздің сабақтарыңызды біз әрдайым есте сақтаймыз.",
  ],
  funny: [
    "Дәптерлер өздігінен тексеріліп, оқушылар үй тапсырмасын үйреніп келсін.",
    "Үзіліс қоңырауы ескертуші қоңыраудан жиірек соқсын.",
    "Бұл күні кешікпеуге және көшіріп алмауға уәде береміз.",
  ],
};

const teacherUz: Pick<Pool, "warm" | "funny" | "formal"> = {
  formal: true,
  warm: [
    "Sabringiz, bilimingiz va bizga bo‘lgan ishonchingiz uchun rahmat.",
    "Sizga sog‘lik, ilhom va minnatdor shogirdlar tilayman.",
    "Siz bizga nafaqat fanni, balki fikrlashni va odamlarni hurmat qilishni ham o‘rgatdingiz.",
    "Sinfdagi har bir kun quvonch, mehnatingiz esa e’tirof olib kelsin.",
    "Darslaringizni biz doim eslaymiz.",
  ],
  funny: [
    "Daftarlar o‘zi tekshirilsin, o‘quvchilar esa uy vazifasini o‘rganib kelsin.",
    "Tanaffus qo‘ng‘irog‘i tez-tez jaranglasin, tanbeh uchun chaqiruv esa kam bo‘lsin.",
    "Bugun kechikmaslikka va ko‘chirmaslikka va’da beramiz.",
  ],
};

const teacherEn: Pick<Pool, "warm" | "funny" | "formal"> = {
  formal: true,
  warm: [
    "Thank you for your patience, your knowledge and your belief in us.",
    "I wish you good health, inspiration and grateful students.",
    "You taught us not only your subject, but also how to think and how to respect other people.",
    "May every day in the classroom bring you joy, and may your work be recognised.",
    "We will always remember your lessons.",
  ],
  funny: [
    "I wish you homework that marks itself and students who turn up with theirs already done.",
    "May the bell for break ring more often than the bell for a telling-off.",
    "We promise not to be late and not to copy anyone’s work today.",
  ],
};

const data: Record<PublicLocale, LocaleData> = {
  ru: {
    recipients: {
      mama: {
        plain: ["Дорогая мамочка!", "Мама, родная моя!"],
        named: ["Дорогая мамочка!", "Мама, родная моя!"],
        warm: [
          "Спасибо тебе за заботу, которая всегда рядом, даже когда мы далеко.",
          "Желаю здоровья — самого главного, — спокойных дней и поводов для улыбки каждый день.",
          "Ты научила меня доброте и терпению, и всё хорошее во мне — от тебя.",
          "Пусть дом будет полон тепла, а рядом всегда будут те, кто тебя любит.",
          "Я очень тебя люблю и горжусь тем, что у меня такая мама.",
        ],
        funny: [
          "Желаю, чтобы холодильник всегда был полон, а мы звонили чаще, чем ты успеваешь спросить «почему не звонишь».",
          "Обещаю не спорить про шапку и надевать её. Ну, почти обещаю.",
          "Ты всегда знала, что мы поели не то, и всегда оказывалась права. Оставайся такой же всевидящей!",
        ],
      },
      papa: {
        plain: ["Дорогой папа!", "Папа, дорогой мой человек!"],
        named: ["Дорогой папа!", "Папа, дорогой мой человек!"],
        warm: [
          "Спасибо, что ты всегда был опорой и примером.",
          "Желаю крепкого здоровья, бодрости и сил на всё, что задумал.",
          "Пусть работа приносит радость, а дом — покой.",
          "Твои советы я помню и ценю, даже когда делаю по-своему.",
          "Я горжусь тем, что ты мой папа.",
        ],
        funny: [
          "Желаю, чтобы пульт от телевизора всегда оказывался на месте, а рыба на рыбалке сама лезла на крючок.",
          "Пусть шутки у тебя будут такие же смешные, как раньше, а мы будем смеяться искренне, а не из вежливости.",
          "Чтобы машина не ломалась, а запчасти не дорожали. Остальное мы как-нибудь решим.",
        ],
      },
      babushka: {
        plain: ["Дорогая бабушка!", "Бабулечка любимая!"],
        named: ["Дорогая бабушка!", "Бабулечка любимая!"],
        warm: [
          "Спасибо за твои сказки, пироги и тепло, которое с тобой всегда.",
          "Желаю здоровья, радости и долгих лет рядом с нами.",
          "Твоя мудрость и доброта — наше семейное богатство.",
          "Пусть внуки радуют звонками и визитами, а дом будет полон гостей.",
          "Мы любим тебя и бережём каждый вечер рядом с тобой.",
        ],
        funny: [
          "Желаю, чтобы пироги получались сами собой, а внуки — только слушались.",
          "Пусть варенья будет столько, чтобы хватило и нам, и соседям, и ещё осталось на зиму.",
          "Обещаем звонить чаще, чем ты успеваешь сказать «а я уже и не жду».",
        ],
      },
      dedushka: {
        plain: ["Дорогой дедушка!", "Дедушка, родной!"],
        named: ["Дорогой дедушка!", "Дедушка, родной!"],
        warm: [
          "Спасибо за мудрость, истории и умение делать мир надёжнее.",
          "Желаю крепкого здоровья, бодрости духа и долгих лет.",
          "Твои рассказы о прошлом — наше семейное сокровище.",
          "Пусть рядом всегда будут дети и внуки, а в доме — мир и уют.",
          "Мы гордимся тобой и очень тебя любим.",
        ],
        funny: [
          "Желаю, чтобы очки всегда находились, а шахматные партии заканчивались твоей победой — иногда по-честному.",
          "Пусть газета будет свежей, чай горячим, а внуки послушными. Хотя бы в этот день.",
          "Желаю бодрости, как у молодого, и мудрости, как у тебя, — то есть менять ничего не нужно.",
        ],
      },
      zhena: {
        plain: ["Любимая моя!", "Дорогая жена!"],
        named: ["Любимая {name}!", "Дорогая {name}!"],
        warm: [
          "Ты делаешь наш дом уютным, а меня — лучше.",
          "Желаю тебе здоровья, радости и исполнения всех желаний.",
          "Рядом с тобой я чувствую себя самым счастливым.",
          "Пусть каждый день будет наполнен улыбками, цветами и добрыми новостями.",
          "Я люблю тебя — и это самое важное, что хочется сказать.",
        ],
        funny: [
          "Желаю, чтобы шопинг был приятным, а скидки — бесконечными.",
          "Обещаю не говорить «а я же предупреждал» — по крайней мере сегодня.",
          "Желаю сил на всех нас, потому что без тебя мы бы пропали.",
        ],
      },
      muzh: {
        plain: ["Любимый мой!", "Дорогой муж!"],
        named: ["Любимый {name}!", "Дорогой {name}!"],
        warm: [
          "Ты — моя опора, и рядом с тобой я ничего не боюсь.",
          "Желаю здоровья, успехов и исполнения всех замыслов.",
          "Спасибо за заботу, терпение и твою надёжность.",
          "Пусть дома тебя всегда ждут, а в делах сопутствует удача.",
          "Как хорошо, что мы вместе.",
        ],
        funny: [
          "Желаю, чтобы носки находились парами, а футбол радовал победами.",
          "Пусть пульт будет у тебя в руках, а я — в твоём сердце.",
          "Обещаю не напоминать про мусор. Сегодня.",
        ],
      },
      podruga: {
        plain: ["Дорогая подруга!", "Подруга моя дорогая!"],
        named: ["Дорогая {name}!", "Милая {name}!"],
        warm: [
          "Ты — человек, с которым можно молчать и смеяться одинаково легко.",
          "Желаю здоровья, любви, вдохновения и добрых людей рядом.",
          "Спасибо, что ты рядом в радости и в трудные дни.",
          "Пусть мечты сбываются, а на пути встречаются только хорошие люди.",
          "Дружба с тобой — одно из лучших, что у меня есть.",
        ],
        funny: [
          "Желаю, чтобы возраст был только в паспорте, а в душе — вечные двадцать.",
          "Пусть кофе всегда будет горячим, а новости — хорошими, и подруга рядом, чтобы всё это обсудить.",
          "Чтобы морщинки появлялись только от смеха, а с лишним весом пусть борются другие.",
        ],
      },
      drug: {
        plain: ["Дорогой друг!", "Друг мой!"],
        named: ["Дорогой {name}!", "Друг мой {name}!"],
        warm: [
          "Ты настоящий друг: на тебя можно положиться.",
          "Желаю здоровья, удачи и больших побед.",
          "Спасибо за поддержку и честность.",
          "Пусть дела идут в гору, а рядом будут верные люди.",
          "Хорошо, что у меня есть такой друг.",
        ],
        funny: [
          "Желаю, чтобы зарплата росла быстрее цен, а друзья — только в хорошем смысле.",
          "Пусть шашлык будет сочным, а погода — на нашей стороне.",
          "Обещаю не пересказывать твои истории твоей маме. Сегодня.",
        ],
      },
      uchitelnitsa: { plain: ["Уважаемая учительница!", "Дорогая наша учительница!"], named: ["Уважаемая {name}!", "Дорогая {name}!"], ...teacherRu },
      uchitel: { plain: ["Уважаемый учитель!", "Дорогой наш учитель!"], named: ["Уважаемый {name}!", "Дорогой {name}!"], ...teacherRu },
    },
    occasions: {
      birthday: { titles: ["С днём рождения!", "Поздравляю с днём рождения!"], follow: "Сегодня особенный день — и хочется сказать самые тёплые слова." },
      jubilee: {
        titles: ["С юбилеем!", "Поздравляю с юбилеем!"],
        titlesAge: ["С юбилеем — {age}!", "Поздравляю с юбилеем: {age}!"],
        follow: "Такая дата — повод оглянуться на пройденный путь и порадоваться ему.",
      },
      march8: { titles: ["С 8 Марта!", "Поздравляю с 8 Марта!"], follow: "Пусть весна приходит не только в календарь, но и в душу." },
      defender: { titles: ["С 23 февраля!", "Поздравляю с 23 февраля!"], follow: "В этот день хочется сказать спасибо за силу, надёжность и заботу." },
      teachers: { titles: ["С Днём учителя!", "Поздравляем с Днём учителя!"], follow: "В этот день мы особенно ясно помним, кто вложил в нас знания и добро." },
      anniversary: { titles: ["С годовщиной свадьбы!", "Поздравляю с годовщиной нашей свадьбы!"], follow: "Каждый прожитый вместе год — наше общее богатство." },
      newyear: { titles: ["С Новым годом!", "Поздравляю с Новым годом!"], follow: "Пусть он принесёт больше тепла, света и добрых новостей." },
    },
    closings: {
      warm: { family: ["С любовью и теплом.", "Обнимаю тебя крепко."], formal: ["С глубоким уважением и благодарностью.", "С искренней признательностью."] },
      funny: { family: ["И помни: возраст — это просто число. Большое, но число.", "Ура! Тортик уже ждёт."], formal: ["С уважением и любовью — Ваши ученики."] },
    },
  },
  kk: {
    recipients: {
      mama: {
        plain: ["Қымбатты анашым!", "Сүйікті анашым!"],
        named: ["Қымбатты анашым!", "Сүйікті анашым!"],
        warm: [
          "Сенің қамқорлығың үшін рахмет — алыс жүрсек те, ол әрдайым жанымда.",
          "Ең бастысы — денсаулық, тыныш күндер және күнде күлетін себептер тілеймін.",
          "Сен маған мейірімділік пен төзімділікті үйреттің, менің бойымдағы жақсының бәрі — сенен.",
          "Үйің жылуға толсын, жаныңда сені жақсы көретіндер әрқашан болсын.",
          "Мен сені қатты жақсы көремін және сендей анам барына мақтанамын.",
        ],
        funny: [
          "Тоңазытқышың әрдайым толы болсын, ал біз «неге қоңырау шалмайсың» деп сұрамай тұрып қоңырау шалатын болайық.",
          "Қалпақ туралы дауласпауға уәде беремін. Сенің айтқаныңды тыңдап киемін. Шамамен.",
          "Біздің дұрыс тамақтанбағанымызды әрқашан білетінсің және әрқашан дұрыс шығатынсың. Осындай көреген болып қал!",
        ],
      },
      papa: {
        plain: ["Қымбатты әке!", "Құрметті әкетай!"],
        named: ["Қымбатты әке!", "Құрметті әкетай!"],
        warm: [
          "Әрдайым тірегім әрі үлгі болғаның үшін рахмет.",
          "Мықты денсаулық, күш-қуат және ойлағаныңның бәріне жетуіңді тілеймін.",
          "Жұмысың қуаныш әкелсін, үйің тыныштық берсін.",
          "Кеңестеріңді есімде сақтаймын және бағалаймын, өз білгенімше жасасам да.",
          "Сендей әкем барына мақтанамын.",
        ],
        funny: [
          "Теледидардың пульті әрдайым өз орнында болсын, ал балық аулағанда балық өзі қармаққа ілінсін.",
          "Әзілдерің бұрынғыдай күлкілі болсын, ал біз сыпайылықтан емес, шын жүректен күлейік.",
          "Көлігің бұзылмасын, қосалқы бөлшектер қымбаттамасын. Қалғанын өзіміз шешеміз.",
        ],
      },
      babushka: {
        plain: ["Қымбатты әже!", "Сүйікті әжетай!"],
        named: ["Қымбатты әже!", "Сүйікті әжетай!"],
        warm: [
          "Ертегілерің, тамақтарың және сенімен бірге жүретін жылулық үшін рахмет.",
          "Денсаулық, қуаныш және біздің қасымызда ұзақ жылдар тілеймін.",
          "Сенің даналығың мен мейірімің — біздің отбасымыздың байлығы.",
          "Немерелерің қоңыраумен қуантып, үйіңе жиі келіп тұрсын.",
          "Біз сені жақсы көреміз және жаныңдағы әр кешті қадірлейміз.",
        ],
        funny: [
          "Тағамдарың өзінен-өзі дәмді болып шықсын, ал немерелерің тек тыңдаушы болсын.",
          "Дайындаған тосабың бізге де, көршілерге де жетіп, қысқа да қалсын.",
          "Сен «енді күтпей-ақ қойдым» деп айтып үлгермей, қоңырау шалып тұруға уәде береміз.",
        ],
      },
      dedushka: {
        plain: ["Қымбатты ата!", "Сүйікті атажан!"],
        named: ["Қымбатты ата!", "Сүйікті атажан!"],
        warm: [
          "Даналығың, әңгімелерің және өмірді сенімдірек ететін қасиетің үшін рахмет.",
          "Мықты денсаулық, рухтың жігері және ұзақ өмір тілеймін.",
          "Өткен күндер туралы әңгімелерің — біздің отбасымыздың қазынасы.",
          "Жаныңда балалар мен немерелер әрқашан болсын, үйіңде тыныштық пен жайлылық орнасын.",
          "Біз сені мақтан тұтамыз және қатты жақсы көреміз.",
        ],
        funny: [
          "Көзілдірігің әрқашан табылсын, ал шахмат партиялары сенің жеңісіңмен бітсін — кейде адал жолмен.",
          "Газетің жаңа, шайың ыстық, немерелерің тыңдаушы болсын. Кем дегенде осы күні.",
          "Жастардай жігер мен өзіңдей даналық тілеймін — яғни ештеңені өзгертудің қажеті жоқ.",
        ],
      },
      zhena: {
        plain: ["Қымбатты жарым!", "Сүйікті жан жарым!"],
        named: ["Қымбатты {name}!", "Сүйікті {name}!"],
        warm: [
          "Сен біздің үйді жайлы етесің, ал мені — жақсырақ.",
          "Саған денсаулық, қуаныш және барлық тілегіңнің орындалуын тілеймін.",
          "Сенің жаныңда өзімді ең бақытты сезінемін.",
          "Әр күнің күлкі, гүл және жақсы жаңалықтарға толы болсын.",
          "Мен сені сүйемін — айтқым келгеннің ең маңыздысы осы.",
        ],
        funny: [
          "Сауда-саттық қуаныш әкелсін, ал жеңілдіктер таусылмасын.",
          "«Мен ескерткен едім» демеуге уәде беремін — кем дегенде бүгін.",
          "Барлығымызға жететін күш тілеймін, өйткені сенсіз біз жоғалып кетер едік.",
        ],
      },
      muzh: {
        plain: ["Қымбатты жарым!", "Сүйікті жан жарым!"],
        named: ["Қымбатты {name}!", "Сүйікті {name}!"],
        warm: [
          "Сен — менің тірегімсің, сенің жаныңда ештеңеден қорықпаймын.",
          "Денсаулық, табыс және барлық ниетіңнің орындалуын тілеймін.",
          "Қамқорлығың, төзімділігің және сенімділігің үшін рахмет.",
          "Үйде сені әрқашан күтіп, ісіңде бақ қосылсын.",
          "Бірге болғанымыз қандай жақсы.",
        ],
        funny: [
          "Шұлықтарың жұп-жұбымен табылсын, ал футбол жеңіспен қуантсын.",
          "Пульт сенің қолыңда болсын, ал мен — сенің жүрегіңде.",
          "Қоқыс туралы еске салмауға уәде беремін. Бүгін.",
        ],
      },
      podruga: {
        plain: ["Қымбатты құрбым!", "Жақын құрбым!"],
        named: ["Қымбатты {name}!", "Құрбым {name}!"],
        warm: [
          "Сенімен үнсіз отыру да, күлу де бірдей оңай.",
          "Денсаулық, махаббат, шабыт және жаныңда жақсы адамдар тілеймін.",
          "Қуанышта да, қиын күндерде де қасымда болғаның үшін рахмет.",
          "Армандарың орындалып, жолыңа тек жақсы адамдар кездесін.",
          "Сенімен достығым — менде бар ең жақсы нәрселердің бірі.",
        ],
        funny: [
          "Жас тек төлқұжатта болсын, ал жүрегіңде мәңгі жиырма болсын.",
          "Кофең әрдайым ыстық, жаңалықтарың жақсы болсын, ал бәрін талқылайтын құрбың қасыңда болсын.",
          "Әжімдер тек күлкіден пайда болсын, ал артық салмақпен басқалар айналыссын.",
        ],
      },
      drug: {
        plain: ["Қымбатты досым!", "Жақын досым!"],
        named: ["Қымбатты {name}!", "Досым {name}!"],
        warm: [
          "Сен нағыз досың: саған сенуге болады.",
          "Денсаулық, сәттілік және үлкен жеңістер тілеймін.",
          "Қолдауың мен турашылдығың үшін рахмет.",
          "Істерің өрге жүріп, қасыңда адал адамдар болсын.",
          "Сендей досым барына қуаныштымын.",
        ],
        funny: [
          "Жалақың бағадан тез өссін, ал достарың — тек жақсы мағынада.",
          "Шашлық шырынды, ауа райы біздің жағымызда болсын.",
          "Сенің әңгімелеріңді анаңа айтпауға уәде беремін. Бүгін.",
        ],
      },
      uchitelnitsa: { plain: ["Құрметті ұстазым!", "Қымбатты ұстаз!"], named: ["Құрметті {name}!", "Қымбатты {name}!"], ...teacherKk },
      uchitel: { plain: ["Құрметті ұстазым!", "Қымбатты ұстаз!"], named: ["Құрметті {name}!", "Қымбатты {name}!"], ...teacherKk },
    },
    occasions: {
      birthday: { titles: ["Туған күн құтты болсын!", "Туған күніңмен құттықтаймын!"], follow: "Бүгін ерекше күн, ең жылы сөздерімді айтқым келеді." },
      jubilee: {
        titles: ["Мерейтой құтты болсын!", "Мерейтойыңмен құттықтаймын!"],
        titlesAge: ["{age} жас мерейтойы құтты болсын!", "{age} жасқа толған мерейтойыңмен құттықтаймын!"],
        follow: "Мұндай күн — өткен жолға көз жіберіп, оған қуануға себеп.",
      },
      march8: { titles: ["8 наурыз құтты болсын!", "8 наурызбен құттықтаймын!"], follow: "Көктем тек күнтізбеде емес, жүректе де болсын." },
      defender: { titles: ["23 ақпан құтты болсын!", "23 ақпанмен құттықтаймын!"], follow: "Бүгін күшіңе, сенімділігіңе және қамқорлығыңа алғыс айтқым келеді." },
      teachers: { titles: ["Ұстаздар күні құтты болсын!", "Ұстаздар күнімен құттықтаймыз!"], follow: "Бұл күні бізге білім мен мейірім сыйлағандарды ерекше есімізге аламыз." },
      anniversary: { titles: ["Неке жылдығы құтты болсын!", "Үйлену тойымыздың жылдығымен құттықтаймын!"], follow: "Бірге өткен әр жыл — біздің ортақ байлығымыз." },
      newyear: { titles: ["Жаңа жыл құтты болсын!", "Жаңа жылмен құттықтаймын!"], follow: "Ол көбірек жылулық, жарық және жақсы жаңалық әкелсін." },
    },
    closings: {
      warm: { family: ["Сүйіспеншілікпен және жылулықпен.", "Мықтап құшақтаймын."], formal: ["Терең құрметпен және алғыспен.", "Шын ризашылықпен."] },
      funny: { family: ["Есіңде болсын: жас — жай ғана сан. Үлкен, бірақ сан.", "Ура! Торт күтіп тұр."], formal: ["Құрметпен және сүйіспеншілікпен — шәкірттеріңіз."] },
    },
  },
  uz: {
    recipients: {
      mama: {
        plain: ["Aziz onajon!", "Qadrdon oyijonim!"],
        named: ["Aziz onajon!", "Qadrdon oyijonim!"],
        warm: [
          "Har doim yonimda bo‘lgan g‘amxo‘rligingiz uchun rahmat — uzoqda bo‘lsak ham.",
          "Eng muhimi — sog‘-salomatlik, tinch kunlar va har kuni jilmayishga sabab tilayman.",
          "Siz menga mehr va sabrni o‘rgatdingiz, menda bor yaxshilikning hammasi o‘zingizdan.",
          "Uyingiz doim iliqlikka to‘la bo‘lsin, yoningizda sizni yaxshi ko‘rganlar hamisha bo‘lsin.",
          "Sizni juda yaxshi ko‘raman va shunday onam borligi bilan faxrlanaman.",
        ],
        funny: [
          "Muzlatgichingiz doim to‘la bo‘lsin, biz esa «nega qo‘ng‘iroq qilmaysiz» deb so‘rashga ulgurmasingizdan oldin qo‘ng‘iroq qilaylik.",
          "Qalpoq haqida bahslashmayman, kiyaman deb va’da beraman. Deyarli.",
          "Biz noto‘g‘ri ovqatlanganimizni har doim bilardingiz va har doim haq bo‘lardingiz. Shunday sezgir bo‘lib qoling!",
        ],
      },
      papa: {
        plain: ["Aziz dadajon!", "Otajon, qadrdonim!"],
        named: ["Aziz dadajon!", "Otajon, qadrdonim!"],
        warm: [
          "Doim suyanchig‘im va o‘rnak bo‘lganingiz uchun rahmat.",
          "Baquvvat sog‘lik, shijoat va rejalaringizning hammasiga yetadigan kuch tilayman.",
          "Ish sizga quvonch, uyingiz esa tinchlik olib kelsin.",
          "Maslahatlaringizni eslayman va qadrlayman, garchi o‘zimcha qilsam ham.",
          "Siz kabi otam borligi bilan faxrlanaman.",
        ],
        funny: [
          "Televizor pulti doim joyida bo‘lsin, baliq ovlaganda baliq o‘zi ilmoqqa ilinsin.",
          "Hazillaringiz avvalgidek kulgili bo‘lsin, biz esa xushmuomalalikdan emas, chin dildan kulaylik.",
          "Mashinangiz buzilmasin, ehtiyot qismlar qimmatlashmasin. Qolganini o‘zimiz hal qilamiz.",
        ],
      },
      babushka: {
        plain: ["Aziz buvijon!", "Mehribon buvim!"],
        named: ["Aziz buvijon!", "Mehribon buvim!"],
        warm: [
          "Ertaklaringiz, pishiriqlaringiz va doim o‘zingiz bilan olib yuradigan iliqligingiz uchun rahmat.",
          "Sog‘lik, quvonch va yonimizda uzoq yillar tilayman.",
          "Donoligingiz va mehribonligingiz — oilamizning boyligi.",
          "Nevaralaringiz qo‘ng‘iroq va tashriflar bilan xursand qilib tursin, uyingiz mehmonlarga to‘la bo‘lsin.",
          "Biz sizni yaxshi ko‘ramiz va yoningizdagi har bir oqshomni asraymiz.",
        ],
        funny: [
          "Pishiriqlar o‘zi pishib chiqsin, nevaralar esa faqat aytganingizni qilsin.",
          "Murabbo shunchalik ko‘p bo‘lsinki, bizga ham, qo‘shnilarga ham yetsin, qishga ham qolsin.",
          "«Endi kutmay ham qo‘ydim» deyishga ulgurmasingizdan oldin qo‘ng‘iroq qilishga va’da beramiz.",
        ],
      },
      dedushka: {
        plain: ["Aziz bobojon!", "Qadrdon bobom!"],
        named: ["Aziz bobojon!", "Qadrdon bobom!"],
        warm: [
          "Donoligingiz, hikoyalaringiz va dunyoni ishonchliroq qila olishingiz uchun rahmat.",
          "Baquvvat sog‘lik, ruhiy tetiklik va uzoq umr tilayman.",
          "O‘tmish haqidagi hikoyalaringiz — oilamizning xazinasi.",
          "Yoningizda doim farzandlar va nevaralar bo‘lsin, uyingizda tinchlik va fayz hukm sursin.",
          "Biz sizdan faxrlanamiz va juda yaxshi ko‘ramiz.",
        ],
        funny: [
          "Ko‘zoynagingiz doim topilsin, shaxmat partiyalari sizning g‘alabangiz bilan tugasin — ba’zan halol yo‘l bilan.",
          "Gazeta yangi, choy issiq, nevaralar esa itoatkor bo‘lsin. Hech bo‘lmasa shu kuni.",
          "Yoshlardek shijoat va o‘zingizdek donolik tilayman — ya’ni hech narsani o‘zgartirish shart emas.",
        ],
      },
      zhena: {
        plain: ["Jonim mening!", "Aziz rafiqam!"],
        named: ["Jonim {name}!", "Aziz {name}!"],
        warm: [
          "Sen uyimizni shinam qilasan, meni esa yaxshiroq.",
          "Senga sog‘lik, quvonch va barcha orzularing ushalishini tilayman.",
          "Sen bilan o‘zimni eng baxtli his qilaman.",
          "Har kuning tabassum, gul va yaxshi xabarlarga to‘la bo‘lsin.",
          "Seni sevaman — aytmoqchi bo‘lganimning eng muhimi shu.",
        ],
        funny: [
          "Xarid zavqli, chegirmalar esa cheksiz bo‘lsin.",
          "«Men aytgan edim» demayman deb va’da beraman — hech bo‘lmasa bugun.",
          "Hammamizga yetadigan kuch tilayman, chunki sensiz biz yo‘qolib qolardik.",
        ],
      },
      muzh: {
        plain: ["Suyukli yorim!", "Aziz erim!"],
        named: ["Suyukli {name}!", "Aziz {name}!"],
        warm: [
          "Sen mening tayanchimsan, sen bilan hech narsadan qo‘rqmayman.",
          "Sog‘lik, muvaffaqiyat va barcha rejalaring ro‘yobga chiqishini tilayman.",
          "G‘amxo‘rliging, sabring va ishonchliliging uchun rahmat.",
          "Uyda seni doim kutishsin, ishlaringda omad hamroh bo‘lsin.",
          "Birga ekanimiz naqadar yaxshi.",
        ],
        funny: [
          "Paypoqlar juft-juft topilsin, futbol esa g‘alabalar bilan quvontirsin.",
          "Pult qo‘lingda bo‘lsin, men esa yuragingda.",
          "Axlat haqida eslatmayman deb va’da beraman. Bugun.",
        ],
      },
      podruga: {
        plain: ["Aziz dugonam!", "Qadrdon dugonam!"],
        named: ["Aziz {name}!", "Mehribon {name}!"],
        warm: [
          "Sen bilan jim o‘tirish ham, kulish ham baravar oson.",
          "Sog‘lik, muhabbat, ilhom va yoningda yaxshi insonlar tilayman.",
          "Quvonchda ham, qiyin kunlarda ham yonimda bo‘lganing uchun rahmat.",
          "Orzularing ushalsin, yo‘lingda faqat yaxshi odamlar uchrasin.",
          "Sen bilan do‘stligim — menda bor eng yaxshi narsalardan biri.",
        ],
        funny: [
          "Yosh faqat pasportda bo‘lsin, qalbingda esa abadiy yigirma.",
          "Qahva doim issiq, xabarlar yaxshi bo‘lsin, bularning hammasini muhokama qiladigan dugona esa yoningda.",
          "Ajinlar faqat kulgidan paydo bo‘lsin, ortiqcha vazn bilan esa boshqalar kurashsin.",
        ],
      },
      drug: {
        plain: ["Aziz do‘stim!", "Do‘stim!"],
        named: ["Aziz {name}!", "Do‘stim {name}!"],
        warm: [
          "Sen haqiqiy do‘stsan: senga ishonsa bo‘ladi.",
          "Sog‘lik, omad va katta g‘alabalar tilayman.",
          "Qo‘llab-quvvatlaganing va rostgo‘yliging uchun rahmat.",
          "Ishlaring yurishib ketsin, yoningda sodiq insonlar bo‘lsin.",
          "Shunday do‘stim borligi yaxshi.",
        ],
        funny: [
          "Oylik narxlardan tezroq o‘ssin, do‘stlar esa — faqat yaxshi ma’noda.",
          "Shashlik shirali, ob-havo esa bizning tomonimizda bo‘lsin.",
          "Voqealaringni onangga aytmayman deb va’da beraman. Bugun.",
        ],
      },
      uchitelnitsa: { plain: ["Hurmatli ustoz!", "Aziz ustozimiz!"], named: ["Hurmatli {name}!", "Aziz {name}!"], ...teacherUz },
      uchitel: { plain: ["Hurmatli ustoz!", "Aziz ustozimiz!"], named: ["Hurmatli {name}!", "Aziz {name}!"], ...teacherUz },
    },
    occasions: {
      birthday: { titles: ["Tug‘ilgan kun muborak!", "Tug‘ilgan kun bilan tabriklayman!"], follow: "Bugun alohida kun — eng iliq so‘zlarni aytishni istayman." },
      jubilee: {
        titles: ["Yubiley muborak!", "Yubiley bilan tabriklayman!"],
        titlesAge: ["{age} yoshlik yubiley muborak!", "{age} yoshlik yubiley bilan tabriklayman!"],
        follow: "Bunday sana — bosib o‘tilgan yo‘lga nazar tashlab, undan quvonishga sabab.",
      },
      march8: { titles: ["8-mart muborak!", "8-mart bayrami bilan tabriklayman!"], follow: "Bahor faqat taqvimda emas, qalbda ham kelsin." },
      defender: { titles: ["23-fevral muborak!", "23-fevral bilan tabriklayman!"], follow: "Bugun kuch, ishonchlilik va g‘amxo‘rlik uchun rahmat aytishni istayman." },
      teachers: { titles: ["Ustozlar kuni muborak!", "Ustozlar kuni bilan tabriklaymiz!"], follow: "Bu kunda bizga bilim va mehr bergan insonlarni ayniqsa yaqqol eslaymiz." },
      anniversary: { titles: ["To‘y yilligi muborak!", "To‘yimiz yilligi bilan tabriklayman!"], follow: "Birga o‘tgan har bir yil — umumiy boyligimiz." },
      newyear: { titles: ["Yangi yil muborak!", "Yangi yil bilan tabriklayman!"], follow: "U ko‘proq iliqlik, nur va yaxshi xabarlar olib kelsin." },
    },
    closings: {
      warm: { family: ["Mehr va iliqlik bilan.", "Qattiq quchoqlayman."], formal: ["Chuqur hurmat va minnatdorchilik bilan.", "Samimiy minnatdorchilik bilan."] },
      funny: { family: ["Esdan chiqmasin: yosh — shunchaki raqam. Katta, ammo baribir raqam.", "Ura! Tort allaqachon kutyapti."], formal: ["Hurmat va mehr bilan — shogirdlaringiz."] },
    },
  },
  en: {
    recipients: {
      mama: {
        plain: ["Dear Mum,", "Mum, my darling,"],
        named: ["Dear Mum,", "Mum, my darling,"],
        warm: [
          "Thank you for your care, which is always with me, even when we are far apart.",
          "I wish you health, which matters most, peaceful days and a reason to smile every day.",
          "You taught me kindness and patience, and everything good in me comes from you.",
          "May your home be full of warmth, and may the people who love you always be close.",
          "I love you very much and I am proud to have you as my mum.",
        ],
        funny: [
          "I wish you a fridge that is always full, and calls from us that come before you can ask “why don’t you ever ring?”",
          "I promise not to argue about the hat and to wear it. Well, I almost promise.",
          "You always knew when we had eaten the wrong thing, and you were always right. Stay just as all-seeing!",
        ],
      },
      papa: {
        plain: ["Dear Dad,", "Dad, the dearest person to me,"],
        named: ["Dear Dad,", "Dad, the dearest person to me,"],
        warm: [
          "Thank you for always being my support and my example.",
          "I wish you strong health, energy and strength for everything you have planned.",
          "May your work bring you joy and your home bring you peace.",
          "I remember your advice and value it, even when I do things my own way.",
          "I am proud that you are my dad.",
        ],
        funny: [
          "I wish you a TV remote that is always where you left it, and fish that jump onto your hook all by themselves.",
          "May your jokes be as funny as they ever were, and may we laugh for real, not just to be polite.",
          "May the car never break down and the spare parts never get dearer. We will sort out the rest somehow.",
        ],
      },
      babushka: {
        plain: ["Dear Grandma,", "My beloved Granny,"],
        named: ["Dear Grandma,", "My beloved Granny,"],
        warm: [
          "Thank you for your stories, your pies and the warmth that is always with you.",
          "I wish you health, joy and many more years with us.",
          "Your wisdom and kindness are our family’s treasure.",
          "May your grandchildren cheer you with calls and visits, and may your home be full of guests.",
          "We love you and treasure every evening spent with you.",
        ],
        funny: [
          "I wish you pies that bake themselves, and grandchildren who simply do as they are told.",
          "May there be so much jam that it is enough for us, for the neighbours and still some left for winter.",
          "We promise to ring more often than you can say “well, I had stopped expecting you to.”",
        ],
      },
      dedushka: {
        plain: ["Dear Grandpa,", "Grandpa, my dear,"],
        named: ["Dear Grandpa,", "Grandpa, my dear,"],
        warm: [
          "Thank you for your wisdom, your stories and your gift for making the world feel safer.",
          "I wish you strong health, a cheerful spirit and many long years.",
          "Your stories of the past are our family’s treasure.",
          "May your children and grandchildren always be close, and may your home be full of peace and comfort.",
          "We are proud of you and love you very much.",
        ],
        funny: [
          "I wish you glasses that are always easy to find, and chess games that end in your victory, sometimes fair and square.",
          "May the newspaper be fresh, the tea hot and the grandchildren well behaved. At least for today.",
          "I wish you the energy of a young man and the wisdom you already have, which means nothing needs to change.",
        ],
      },
      zhena: {
        plain: ["My love,", "Dear wife,"],
        named: ["My love {name},", "Dear {name},"],
        warm: [
          "You make our home cosy, and you make me better.",
          "I wish you health, joy and every wish come true.",
          "With you I feel like the happiest person alive.",
          "May every day be filled with smiles, flowers and good news.",
          "I love you, and that is the most important thing I want to say.",
        ],
        funny: [
          "I wish you pleasant shopping trips and sales that never end.",
          "I promise not to say “I told you so”, at least not today.",
          "I wish you strength for all of us, because without you we would be lost.",
        ],
      },
      muzh: {
        plain: ["My love,", "Dear husband,"],
        named: ["My love {name},", "Dear {name},"],
        warm: [
          "You are my rock, and with you I am not afraid of anything.",
          "I wish you health, success and every plan fulfilled.",
          "Thank you for your care, your patience and your reliability.",
          "May someone always be waiting for you at home, and may luck go with you in all you do.",
          "How good it is that we are together.",
        ],
        funny: [
          "I wish you socks that always turn up in pairs and a football team that keeps winning.",
          "May the remote be in your hands, and I in your heart.",
          "I promise not to mention the rubbish. Today.",
        ],
      },
      podruga: {
        plain: ["Dear friend,", "My dear friend,"],
        named: ["Dear {name},", "Sweet {name},"],
        warm: [
          "You are someone I can be silent with, or laugh with, equally easily.",
          "I wish you health, love, inspiration and kind people around you.",
          "Thank you for being there in happy times and in hard ones.",
          "May your dreams come true, and may you meet only good people on your way.",
          "Your friendship is one of the best things I have.",
        ],
        funny: [
          "I wish you an age that exists only in your passport, while in your heart you stay twenty for ever.",
          "May your coffee always be hot, your news always good, and your friend always nearby to talk it all over.",
          "May wrinkles come only from laughing, and may someone else fight the extra weight.",
        ],
      },
      drug: {
        plain: ["Dear friend,", "My friend,"],
        named: ["Dear {name},", "My friend {name},"],
        warm: [
          "You are a true friend: I can always count on you.",
          "I wish you health, luck and great victories.",
          "Thank you for your support and your honesty.",
          "May your affairs go from strength to strength, and may loyal people always be by your side.",
          "I am glad to have a friend like you.",
        ],
        funny: [
          "I wish you a salary that grows faster than prices, and friends who only ever make life more fun.",
          "May the barbecue be juicy and the weather on our side.",
          "I promise not to retell your stories to your mum. Today.",
        ],
      },
      uchitelnitsa: { plain: ["Dear teacher,", "Our dear teacher,"], named: ["Dear {name},", "Our dear {name},"], ...teacherEn },
      uchitel: { plain: ["Dear teacher,", "Our dear teacher,"], named: ["Dear {name},", "Our dear {name},"], ...teacherEn },
    },
    occasions: {
      birthday: { titles: ["Happy birthday!", "Warmest birthday wishes!"], follow: "Today is a special day, and I want to say the warmest words I can." },
      jubilee: {
        titles: ["Happy jubilee!", "Warmest wishes on your jubilee!"],
        titlesAge: ["Happy jubilee — {age}!", "Warmest wishes on your jubilee: {age}!"],
        follow: "A date like this is a reason to look back on the road travelled and to enjoy it.",
      },
      march8: { titles: ["Happy 8 March!", "Warmest wishes on 8 March!"], follow: "May spring come not only to the calendar, but to your heart." },
      defender: { titles: ["Happy 23 February!", "Warmest wishes on 23 February!"], follow: "On this day I want to say thank you for your strength, your reliability and your care." },
      teachers: { titles: ["Happy Teachers’ Day!", "Warmest wishes on Teachers’ Day!"], follow: "On this day we remember especially clearly who gave us knowledge and kindness." },
      anniversary: { titles: ["Happy wedding anniversary!", "Happy anniversary of our wedding!"], follow: "Every year we have lived together is our shared treasure." },
      newyear: { titles: ["Happy New Year!", "Warmest wishes for the New Year!"], follow: "May it bring more warmth, light and good news." },
    },
    closings: {
      warm: { family: ["With love and warmth.", "A big, tight hug."], formal: ["With deepest respect and gratitude.", "With sincere appreciation."] },
      funny: { family: ["And remember: age is just a number. A big one, but still a number.", "Hooray! The cake is already waiting."], formal: ["With respect and love — your students."] },
    },
  },
};

/** Детерминированный генератор: один и тот же seed — одна и та же последовательность. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(list: readonly T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length)];
}

/** n разных элементов в случайном порядке. */
function pickMany<T>(list: readonly T[], n: number, rand: () => number): T[] {
  const copy = [...list];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
}

export interface GreetingInput {
  locale: Locale;
  recipient: RecipientId;
  occasion: OccasionId;
  tone: ToneId;
  /** Имя адресата; пустое — обращение без имени. */
  name?: string;
  /** Возраст для юбилея: «60» → «С юбилеем — 60!» */
  age?: number | null;
  /** Короткое — одно пожелание (для сообщения), обычное — три. */
  short?: boolean;
  /** Номер варианта: «Другой вариант» увеличивает его. */
  variant?: number;
}

export function generateGreeting(input: GreetingInput): string {
  const d = data[toPublic(input.locale)];
  const pool = d.recipients[input.recipient];
  const occ = d.occasions[input.occasion];
  const name = input.name?.trim().slice(0, 40) ?? "";
  const rand = rng(hash(`${input.locale}|${input.recipient}|${input.occasion}|${input.tone}|${name}|${input.age ?? ""}|${input.short ? 1 : 0}`) + (input.variant ?? 0) * 7919);

  const salutation = pick(name ? pool.named : pool.plain, rand).replace("{name}", name);
  const age = input.age && input.age > 0 && input.age < 121 ? String(input.age) : "";
  const titles = age && occ.titlesAge ? occ.titlesAge : occ.titles;
  const title = pick(titles, rand).replace("{age}", age);
  const count = input.short ? 1 : 3;
  const wishes =
    input.tone === "funny"
      ? [...pickMany(pool.funny, input.short ? 1 : 2, rand), ...pickMany(pool.warm, input.short ? 0 : 1, rand)]
      : pickMany(pool.warm, count, rand);
  const closing = pick(d.closings[input.tone][pool.formal ? "formal" : "family"], rand);

  const body = input.short ? `${title} ${wishes.join(" ")}` : `${title} ${occ.follow} ${wishes.join(" ")}`;
  return input.short ? `${salutation} ${body} ${closing}` : `${salutation}\n\n${body}\n\n${closing}`;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Для тестов: все заготовки языка. */
export const greetingData = data;
