/** Сайт грузит WOFF2-подмножества из assets/fonts/web (scripts/web-fonts.sh) — в 5–7 раз легче TTF; PDF берёт полные TTF. */
import localFont from "next/font/local";

export const onest = localFont({
  src: [
    { path: "../../assets/fonts/web/Onest-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Onest-500.woff2", weight: "500" },
    { path: "../../assets/fonts/web/Onest-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/Onest-700.woff2", weight: "700" },
  ],
  variable: "--font-onest",
  display: "swap",
});

export const cormorant = localFont({
  src: [
    { path: "../../assets/fonts/web/Cormorant-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Cormorant-500.woff2", weight: "500" },
    { path: "../../assets/fonts/web/Cormorant-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/Cormorant-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../../assets/fonts/web/Cormorant-500-italic.woff2", weight: "500", style: "italic" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

export const playfair = localFont({
  src: [
    { path: "../../assets/fonts/web/Playfair-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Playfair-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/Playfair-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-playfair",
  display: "swap",
  preload: false,
});

export const lora = localFont({
  src: [
    { path: "../../assets/fonts/web/Lora-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Lora-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/Lora-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-lora",
  display: "swap",
  preload: false,
});

export const ptserif = localFont({
  src: [
    { path: "../../assets/fonts/web/PTSerif-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/PTSerif-700.woff2", weight: "700" },
    { path: "../../assets/fonts/web/PTSerif-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-ptserif",
  display: "swap",
  preload: false,
});

export const montserrat = localFont({
  src: [
    { path: "../../assets/fonts/web/Montserrat-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Montserrat-500.woff2", weight: "500" },
    { path: "../../assets/fonts/web/Montserrat-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/Montserrat-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-montserrat",
  display: "swap",
  preload: false,
});

export const badscript = localFont({
  src: [{ path: "../../assets/fonts/web/BadScript-400.woff2", weight: "400" }],
  variable: "--font-badscript",
  display: "swap",
  preload: false,
});

export const caveat = localFont({
  src: [{ path: "../../assets/fonts/web/Caveat-500.woff2", weight: "500" }],
  variable: "--font-caveat",
  display: "swap",
  preload: false,
});

export const ebgaramond = localFont({
  src: [
    { path: "../../assets/fonts/web/EBGaramond-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/EBGaramond-500.woff2", weight: "500" },
    { path: "../../assets/fonts/web/EBGaramond-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/EBGaramond-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-ebgaramond",
  display: "swap",
  preload: false,
});

export const literata = localFont({
  src: [
    { path: "../../assets/fonts/web/Literata-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Literata-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/Literata-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-literata",
  display: "swap",
  preload: false,
});

export const alegreya = localFont({
  src: [
    { path: "../../assets/fonts/web/Alegreya-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Alegreya-700.woff2", weight: "700" },
    { path: "../../assets/fonts/web/Alegreya-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-alegreya",
  display: "swap",
  preload: false,
});

export const spectral = localFont({
  src: [
    { path: "../../assets/fonts/web/Spectral-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Spectral-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/Spectral-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-spectral",
  display: "swap",
  preload: false,
});

export const oldstandard = localFont({
  src: [
    { path: "../../assets/fonts/web/OldStandard-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/OldStandard-700.woff2", weight: "700" },
    { path: "../../assets/fonts/web/OldStandard-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-oldstandard",
  display: "swap",
  preload: false,
});

export const notodisplay = localFont({
  src: [
    { path: "../../assets/fonts/web/NotoSerifDisplay-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/NotoSerifDisplay-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/NotoSerifDisplay-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-notodisplay",
  display: "swap",
  preload: false,
});

export const prata = localFont({
  src: [
    { path: "../../assets/fonts/web/Prata-400.woff2", weight: "400" },
  ],
  variable: "--font-prata",
  display: "swap",
  preload: false,
});

export const yeseva = localFont({
  src: [
    { path: "../../assets/fonts/web/YesevaOne-400.woff2", weight: "400" },
  ],
  variable: "--font-yeseva",
  display: "swap",
  preload: false,
});

export const forum = localFont({
  src: [
    { path: "../../assets/fonts/web/Forum-400.woff2", weight: "400" },
  ],
  variable: "--font-forum",
  display: "swap",
  preload: false,
});

export const cormorantsc = localFont({
  src: [
    { path: "../../assets/fonts/web/CormorantSC-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/CormorantSC-600.woff2", weight: "600" },
  ],
  variable: "--font-cormorantsc",
  display: "swap",
  preload: false,
});

export const raleway = localFont({
  src: [
    { path: "../../assets/fonts/web/Raleway-300.woff2", weight: "300" },
    { path: "../../assets/fonts/web/Raleway-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Raleway-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/Raleway-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-raleway",
  display: "swap",
  preload: false,
});

export const intertight = localFont({
  src: [
    { path: "../../assets/fonts/web/InterTight-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/InterTight-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/InterTight-800.woff2", weight: "800" },
  ],
  variable: "--font-intertight",
  display: "swap",
  preload: false,
});

export const geologica = localFont({
  src: [
    { path: "../../assets/fonts/web/Geologica-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Geologica-700.woff2", weight: "700" },
    { path: "../../assets/fonts/web/Geologica-800.woff2", weight: "800" },
  ],
  variable: "--font-geologica",
  display: "swap",
  preload: false,
});

export const oswald = localFont({
  src: [
    { path: "../../assets/fonts/web/Oswald-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Oswald-600.woff2", weight: "600" },
  ],
  variable: "--font-oswald",
  display: "swap",
  preload: false,
});

export const montalt = localFont({
  src: [
    { path: "../../assets/fonts/web/MontserratAlt-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/MontserratAlt-600.woff2", weight: "600" },
  ],
  variable: "--font-montalt",
  display: "swap",
  preload: false,
});

export const pacifico = localFont({
  src: [
    { path: "../../assets/fonts/web/Pacifico-400.woff2", weight: "400" },
  ],
  variable: "--font-pacifico",
  display: "swap",
  preload: false,
});

export const lobster = localFont({
  src: [
    { path: "../../assets/fonts/web/Lobster-400.woff2", weight: "400" },
  ],
  variable: "--font-lobster",
  display: "swap",
  preload: false,
});

export const kurale = localFont({
  src: [
    { path: "../../assets/fonts/web/Kurale-400.woff2", weight: "400" },
  ],
  variable: "--font-kurale",
  display: "swap",
  preload: false,
});

export const philosopher = localFont({
  src: [
    { path: "../../assets/fonts/web/Philosopher-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Philosopher-700.woff2", weight: "700" },
  ],
  variable: "--font-philosopher",
  display: "swap",
  preload: false,
});

export const alice = localFont({
  src: [
    { path: "../../assets/fonts/web/Alice-400.woff2", weight: "400" },
  ],
  variable: "--font-alice",
  display: "swap",
  preload: false,
});

export const comfortaa = localFont({
  src: [
    { path: "../../assets/fonts/web/Comfortaa-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Comfortaa-700.woff2", weight: "700" },
  ],
  variable: "--font-comfortaa",
  display: "swap",
  preload: false,
});

export const nunito = localFont({
  src: [
    { path: "../../assets/fonts/web/Nunito-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Nunito-700.woff2", weight: "700" },
    { path: "../../assets/fonts/web/Nunito-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-nunito",
  display: "swap",
  preload: false,
});

export const pangolin = localFont({
  src: [
    { path: "../../assets/fonts/web/Pangolin-400.woff2", weight: "400" },
  ],
  variable: "--font-pangolin",
  display: "swap",
  preload: false,
});

/** Библиотека шрифтов дизайнера: @font-face объявлены всегда, файлы грузятся, только когда шрифт виден на странице. */
const designFonts = [ebgaramond, literata, alegreya, spectral, oldstandard, notodisplay, prata, yeseva, forum, cormorantsc, raleway, intertight, geologica, oswald, montalt, pacifico, lobster, kurale, philosopher, alice, comfortaa, nunito, pangolin];

export const fontVariables = [onest, cormorant, playfair, lora, ptserif, montserrat, badscript, caveat, ...designFonts]
  .map((f) => f.variable)
  .join(" ");
